import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { computeConnections } from "./connections"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("graph/connections (S8.9)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)

  it("every machine is connected to their own line", () => {
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const connections = computeConnections(dataset, machine.id)
    const line = connections.find((c) => c.relation === "line")
    expect(line?.id).toBe(machine.parentId)
  })

  it("a machine's sensor connection is the one attached to their OWN line, never another line's", () => {
    const machine = dataset.domainEntities.find((e) => e.tier === "machine")!
    const line = dataset.domainEntities.find((e) => e.id === machine.parentId)!
    const connections = computeConnections(dataset, machine.id)
    const sensor = connections.find((c) => c.relation === "sensor")
    if (sensor) {
      const sensorEntity = dataset.domainEntities.find(
        (e) => e.id === sensor.id
      )!
      expect(sensorEntity.parentId).toBe(line.id)
    }
  })

  it("rope partners are machine<->machine only — never the line itself", () => {
    for (const machine of dataset.domainEntities.filter(
      (e) => e.tier === "machine"
    )) {
      const connections = computeConnections(dataset, machine.id)
      for (const c of connections.filter(
        (c) => c.relation === "rope-partner"
      )) {
        expect(c.tier).toBe("machine")
        expect(c.id).not.toBe(machine.id)
      }
    }
  })

  it("a non-machine entity has no connections (this section is machine-scoped)", () => {
    const plant = dataset.domainEntities.find((e) => e.tier === "plant")!
    expect(computeConnections(dataset, plant.id)).toEqual([])
  })

  it("an line with 2+ machines gives its first two a mutual rope-partner connection", () => {
    const byOperator = new Map<string, string[]>()
    for (const c of dataset.domainEntities.filter(
      (e) => e.tier === "machine"
    )) {
      const list = byOperator.get(c.parentId!) ?? []
      list.push(c.id)
      byOperator.set(c.parentId!, list)
    }
    const pairOperator = [...byOperator.values()].find(
      (list) => list.length >= 2
    )!
    const [a, b] = pairOperator
    expect(
      computeConnections(dataset, a).some(
        (c) => c.relation === "rope-partner" && c.id === b
      )
    ).toBe(true)
    expect(
      computeConnections(dataset, b).some(
        (c) => c.relation === "rope-partner" && c.id === a
      )
    ).toBe(true)
  })
})
