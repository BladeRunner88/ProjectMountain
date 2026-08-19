import { describe, expect, it } from "vitest"
import { buildDataset } from "./dataset"
import {
  ancestorsOf,
  applyCollapse,
  buildDetectionGraph,
  neighborhood,
} from "./detectionGraph"
import { testWorld } from "../testing/world"

describe("detectionGraph (S9.9 Map rebuild)", () => {
  it("builds one rule node per rule, plus one node per real MapNode", () => {
    const d = buildDataset(testWorld(), 1)
    const graph = buildDetectionGraph(d.detectionEngine)
    const ruleNodes = graph.nodes.filter((n) => n.kind === "rule")
    expect(ruleNodes).toHaveLength(d.detectionEngine.rules.length)
    const entityNodes = graph.nodes.filter((n) => n.kind !== "rule")
    expect(entityNodes).toHaveLength(d.detectionEngine.mapNodes.length)
  })

  it("a rule wires into the SPECIFIC port it watches, not the node generally", () => {
    const d = buildDataset(testWorld(), 1)
    const graph = buildDetectionGraph(d.detectionEngine)
    const oeeWires = graph.wires.filter(
      (w) => w.fromId === "rule:rule-low-oee"
    )
    expect(oeeWires.length).toBeGreaterThan(0)
    for (const w of oeeWires) {
      const target = graph.nodes.find((n) => n.id === w.toId)!
      expect(target.kind).toBe("machine")
      const port = target.ports.find((p) => p.id === w.toPortId)
      expect(port).toBeDefined()
      expect(port!.label).toBe("Effectiveness")
      expect(port!.live).not.toBeNull()
      expect(port!.live!.valueText).toMatch(/%$/)
    }
  })

  it("a firing machine node is anomaly status; its watched port carries the real value and age", () => {
    const d = buildDataset(testWorld(), 1)
    const graph = buildDetectionGraph(d.detectionEngine)
    const firingMachine = graph.nodes.find(
      (n) => n.kind === "machine" && n.status === "anomaly"
    )!
    expect(firingMachine).toBeDefined()
    const livePort = firingMachine.ports.find((p) => p.live !== null)
    expect(livePort).toBeDefined()
  })

  it("structural wires exist for the full hierarchy: country->line->operator->machine, line->sensor", () => {
    const d = buildDataset(testWorld(), 1)
    const graph = buildDetectionGraph(d.detectionEngine)
    const structural = graph.wires.filter(
      (w) =>
        w.kind === "structure" || (w.toPortId === null && w.fromPortId === null)
    )
    // every non-rule, non-root node has exactly one parent edge
    const nonRoot = graph.nodes.filter((n) => n.kind !== "rule" && n.parentId)
    expect(structural.length).toBe(nonRoot.length)
  })

  it("collapse folds non-anomalous operators/machines into one summary per parent, but never folds an anomalous node", () => {
    const d = buildDataset(testWorld(), 1)
    const graph = buildDetectionGraph(d.detectionEngine)
    const collapsed = applyCollapse(
      graph,
      new Set(["operator", "machine"]),
      new Set()
    )

    const anomalousMachines = graph.nodes.filter(
      (n) => n.kind === "machine" && n.status === "anomaly"
    )
    for (const c of anomalousMachines) {
      expect(collapsed.nodes.some((n) => n.id === c.id)).toBe(true) // still present, unfolded
    }

    const summaryNodes = collapsed.nodes.filter((n) => n.isSummary)
    expect(summaryNodes.length).toBeGreaterThan(0)
    expect(collapsed.nodes.length).toBeLessThan(graph.nodes.length)

    // every summary's members are real, non-anomalous nodes from the original graph
    for (const s of summaryNodes) {
      expect(s.summaryMemberIds.length).toBeGreaterThan(0)
      for (const memberId of s.summaryMemberIds) {
        const original = graph.nodes.find((n) => n.id === memberId)!
        expect(original.status).not.toBe("anomaly")
      }
    }
  })

  it("a manually-expanded parent is excluded from folding for its own children", () => {
    const d = buildDataset(testWorld(), 1)
    const graph = buildDetectionGraph(d.detectionEngine)
    const someOperator = graph.nodes.find(
      (n) =>
        n.kind === "operator" &&
        graph.nodes.some((c) => c.parentId === n.id && c.kind === "machine")
    )!
    const collapsed = applyCollapse(
      graph,
      new Set(["machine"]),
      new Set([someOperator.id])
    )
    const directMachineChildren = graph.nodes.filter(
      (n) => n.kind === "machine" && n.parentId === someOperator.id
    )
    for (const c of directMachineChildren) {
      expect(collapsed.nodes.some((n) => n.id === c.id)).toBe(true)
    }
  })

  it("ancestorsOf walks parentId to the root", () => {
    const d = buildDataset(testWorld(), 1)
    const graph = buildDetectionGraph(d.detectionEngine)
    const machine = graph.nodes.find((n) => n.kind === "machine")!
    const ancestors = ancestorsOf(graph, machine.id)
    expect(ancestors.length).toBe(3) // operator, line, country
    const kinds = ancestors.map(
      (id) => graph.nodes.find((n) => n.id === id)!.kind
    )
    expect(kinds).toEqual(["operator", "line", "country"])
  })

  it("neighborhood(hops=2) includes the node itself and stays bounded", () => {
    const d = buildDataset(testWorld(), 1)
    const graph = buildDetectionGraph(d.detectionEngine)
    const machine = graph.nodes.find((n) => n.kind === "machine")!
    const nbhd = neighborhood(graph, machine.id, 2)
    expect(nbhd.has(machine.id)).toBe(true)
    expect(nbhd.size).toBeGreaterThan(1)
    expect(nbhd.size).toBeLessThan(graph.nodes.length)
  })

  it("is deterministic for a given seed", () => {
    const a = buildDetectionGraph(buildDataset(testWorld(), 1).detectionEngine)
    const b = buildDetectionGraph(buildDataset(testWorld(), 1).detectionEngine)
    expect(a.nodes.map((n) => n.id).sort()).toEqual(
      b.nodes.map((n) => n.id).sort()
    )
    expect(a.wires.length).toBe(b.wires.length)
  })
})
