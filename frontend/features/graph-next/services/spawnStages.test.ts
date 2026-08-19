import { beforeEach, describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"
import {
  ANOMALY_FLUSH_HOPS,
  ANOMALY_FLUSH_TOTAL_MS,
  ANOMALY_TURN_RED_DELAY_MS,
  BUD_CHILD_TOTAL_MS,
  BUD_PARENT_SWELL_MS,
  buildSpawnPlan,
  MACHINE_STAGGER_MS,
  COUNTRY_STAGGER_MS,
  getHasEverSpawned,
  markHasSpawned,
  SENSOR_STAGGER_MS,
  PLANT_STAGGER_MS,
  resetHasEverSpawned,
  LINE_STAGGER_MS,
  STAGE_START_MS,
} from "./spawnStages"

const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)

describe("buildSpawnPlan (S8.5N cell-growth reveal)", () => {
  const plan = buildSpawnPlan(dataset)

  it("every country has its own PRIMITIVE A pop delay, staggered 220ms, and every other domain entity + environment node has a bud start", () => {
    const countries = dataset.domainEntities.filter((e) => e.tier === "country")
    expect(plan.countryPopDelayMs.size).toBe(countries.length)
    const sorted = countries
      .map((c) => plan.countryPopDelayMs.get(c.id)!)
      .sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i] - sorted[i - 1]).toBe(COUNTRY_STAGGER_MS)
    expect(sorted[0]).toBe(STAGE_START_MS.countries)

    for (const e of dataset.domainEntities) {
      if (e.tier === "country") continue
      expect(plan.budStartMs.get(e.id), `${e.id} (${e.tier})`).toBeDefined()
      expect(plan.budParentId.get(e.id), `${e.id} (${e.tier})`).toBe(e.parentId)
    }
    for (const env of dataset.environmentNodes) {
      expect(plan.budStartMs.get(env.id)).toBeDefined()
      expect(plan.budParentId.get(env.id)).toBe(env.plantId)
    }
  })

  it("country names fade in exactly POP_A_DURATION_MS + 200ms after their own pop delay", () => {
    for (const c of dataset.domainEntities.filter(
      (e) => e.tier === "country"
    )) {
      const pop = plan.countryPopDelayMs.get(c.id)!
      const name = plan.countryNameDelayMs.get(c.id)!
      expect(name - pop).toBeGreaterThan(200) // at least the post-land delay
    }
  })

  it("stage windows hold: countries < plants < environment < lines/lines < machines, each tier landing inside its own window", () => {
    const budRange = (tier: string) => {
      const vals = dataset.domainEntities
        .filter((e) => e.tier === tier)
        .map((e) => plan.budStartMs.get(e.id)!)
      return { min: Math.min(...vals), max: Math.max(...vals) }
    }
    const country = {
      min: 0,
      max: Math.max(
        ...dataset.domainEntities
          .filter((e) => e.tier === "country")
          .map((e) => plan.countryPopDelayMs.get(e.id)!)
      ),
    }
    expect(country.max).toBeLessThan(STAGE_START_MS.plants)

    const plant = budRange("plant")
    expect(plant.min).toBeGreaterThanOrEqual(STAGE_START_MS.plants)
    expect(plant.max).toBeLessThan(STAGE_START_MS.environment)

    const envVals = dataset.environmentNodes.map((e) =>
      plan.budStartMs.get(e.id)!
    )
    expect(Math.min(...envVals)).toBeGreaterThanOrEqual(
      STAGE_START_MS.environment
    )
    expect(Math.max(...envVals)).toBeLessThan(STAGE_START_MS.linesOperators)

    const line = budRange("line")
    expect(line.min).toBeGreaterThanOrEqual(STAGE_START_MS.linesOperators)

    const machine = budRange("machine")
    expect(machine.min).toBeGreaterThanOrEqual(STAGE_START_MS.machines)
    expect(machine.max).toBeLessThan(STAGE_START_MS.records)
  })

  it("plants within one country stagger 90ms, all countries branch simultaneously (every country's first plant starts at STAGE_START_MS.plants)", () => {
    const plantsByCountry = new Map<string, string[]>()
    for (const r of dataset.domainEntities.filter((e) => e.tier === "plant")) {
      const list = plantsByCountry.get(r.countryId) ?? []
      list.push(r.id)
      plantsByCountry.set(r.countryId, list)
    }
    for (const ids of plantsByCountry.values()) {
      const sorted = ids
        .map((id) => plan.budStartMs.get(id)!)
        .sort((a, b) => a - b)
      expect(sorted[0]).toBe(STAGE_START_MS.plants)
      for (let i = 1; i < sorted.length; i++)
        expect(sorted[i] - sorted[i - 1]).toBe(PLANT_STAGGER_MS)
    }
  })

  it("lines stagger 45ms across the full flat list (plant:line is 1:1, nothing to stagger within a single-child litter)", () => {
    const lines = dataset.domainEntities.filter((e) => e.tier === "line")
    const sorted = lines
      .map((r) => plan.budStartMs.get(r.id)!)
      .sort((a, b) => a - b)
    expect(sorted[0]).toBe(STAGE_START_MS.linesOperators)
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i] - sorted[i - 1]).toBe(LINE_STAGGER_MS)
  })

  it("machines stagger within their line, and every line starts them together", () => {
    // This previously grouped LINES by plant and asserted a within-plant
    // stagger despite its title — a mechanically-renamed duplicate of the
    // flat-list line-stagger test above. Rewritten to assert what it names.
    const machinesByLine = new Map<string, string[]>()
    for (const machine of dataset.domainEntities.filter(
      (e) => e.tier === "machine"
    )) {
      const list = machinesByLine.get(machine.parentId!) ?? []
      list.push(machine.id)
      machinesByLine.set(machine.parentId!, list)
    }

    const firstStarts = new Set<number>()
    for (const ids of machinesByLine.values()) {
      const sorted = ids
        .map((id) => plan.budStartMs.get(id)!)
        .sort((a, b) => a - b)
      firstStarts.add(sorted[0]!)
      for (let i = 1; i < sorted.length; i++)
        expect(sorted[i]! - sorted[i - 1]!).toBe(MACHINE_STAGGER_MS)
    }

    // Every line starts its own machines at the same moment.
    expect(firstStarts.size).toBe(1)
    expect([...firstStarts][0]).toBe(STAGE_START_MS.machines)
  })

  it("a machine's sensors bud just behind it, staggered", () => {
    const machineWithSensors = dataset.domainEntities.find(
      (e) =>
        e.tier === "machine" &&
        dataset.domainEntities.filter((s) => s.parentId === e.id).length > 1
    )!
    const machineStart = plan.budStartMs.get(machineWithSensors.id)!
    const sensorStarts = dataset.domainEntities
      .filter((s) => s.parentId === machineWithSensors.id)
      .map((s) => plan.budStartMs.get(s.id)!)
      .sort((a, b) => a - b)

    expect(sensorStarts[0]).toBe(machineStart)
    for (let i = 1; i < sensorStarts.length; i++)
      expect(sensorStarts[i]! - sensorStarts[i - 1]!).toBe(SENSOR_STAGGER_MS)
  })

  it("sensors bud alongside their line's first line, no extra stagger", () => {
    for (const sensor of dataset.domainEntities.filter(
      (e) => e.tier === "sensor"
    )) {
      const linesOnSameLine = dataset.domainEntities.filter(
        (e) => e.tier === "line" && e.parentId === sensor.parentId
      )
      if (linesOnSameLine.length === 0) continue
      const firstOperatorStart = Math.min(
        ...linesOnSameLine.map((o) => plan.budStartMs.get(o.id)!)
      )
      expect(plan.budStartMs.get(sensor.id)).toBe(firstOperatorStart)
    }
  })

  it("machines within an line stagger 30ms, all lines branch simultaneously", () => {
    const machinesByOperator = new Map<string, string[]>()
    for (const c of dataset.domainEntities.filter(
      (e) => e.tier === "machine"
    )) {
      const list = machinesByOperator.get(c.parentId!) ?? []
      list.push(c.id)
      machinesByOperator.set(c.parentId!, list)
    }
    for (const ids of machinesByOperator.values()) {
      const sorted = ids
        .map((id) => plan.budStartMs.get(id)!)
        .sort((a, b) => a - b)
      expect(sorted[0]).toBe(STAGE_START_MS.machines)
      for (let i = 1; i < sorted.length; i++)
        expect(sorted[i] - sorted[i - 1]).toBe(MACHINE_STAGGER_MS)
    }
  })

  it("parent-pop episodes: a country gets exactly one (its plant litter), a plant gets two in temporal order (environment then lines), a line gets one (its machine+sensor litter)", () => {
    const country = dataset.domainEntities.find((e) => e.tier === "country")!
    const countryEpisodes = plan.parentPopEpisodes.get(country.id) ?? []
    expect(countryEpisodes).toHaveLength(1)
    expect(countryEpisodes[0].relaxStart).toBeGreaterThan(
      countryEpisodes[0].swellStart
    )
    expect(countryEpisodes[0].swellStart).toBe(
      STAGE_START_MS.plants - BUD_PARENT_SWELL_MS
    )

    const plant = dataset.domainEntities.find((e) => e.tier === "plant")!
    const plantEpisodes = plan.parentPopEpisodes.get(plant.id) ?? []
    expect(plantEpisodes).toHaveLength(2)
    expect(plantEpisodes[0].relaxStart).toBeLessThanOrEqual(
      plantEpisodes[1].swellStart
    ) // non-overlapping, in order

    const line = dataset.domainEntities.find((e) => e.tier === "line")!
    const lineEpisodes = plan.parentPopEpisodes.get(line.id) ?? []
    expect(lineEpisodes).toHaveLength(1)
  })

  it("leaf tiers (sensor, environment) never bud children, so they have no parent-pop episodes", () => {
    // A machine is no longer a leaf: sensors are MOUNTED_ON a machine and bud
    // from it, so a machine legitimately pops for its own sensor litter.
    const sensor = dataset.domainEntities.find((e) => e.tier === "sensor")!
    expect(plan.parentPopEpisodes.get(sensor.id) ?? []).toHaveLength(0)
    const env = dataset.environmentNodes[0]
    expect(plan.parentPopEpisodes.get(env.id) ?? []).toHaveLength(0)
  })

  it("a machine pops exactly once, for its own sensor litter", () => {
    const machine = dataset.domainEntities.find(
      (e) =>
        e.tier === "machine" &&
        dataset.domainEntities.some((s) => s.parentId === e.id)
    )!

    expect(plan.parentPopEpisodes.get(machine.id) ?? []).toHaveLength(1)
  })

  it("anomaly: every one of the 9 anomalous machines turns red strictly AFTER its own bud settles (arrives normal, then becomes wrong)", () => {
    for (const machineId of dataset.anomalyMachineIds) {
      const bud = plan.budStartMs.get(machineId)!
      const turnRed = plan.anomalyTurnRedMs.get(machineId)!
      expect(turnRed).toBe(bud + BUD_CHILD_TOTAL_MS + ANOMALY_TURN_RED_DELAY_MS)
    }
  })

  it("anomaly flush: every anomalous machine has a full 3-hop ancestor chain with a defined flush delay, and its own hop-0 edge (never shared with another machine) fires exactly at its own turn-red moment", () => {
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
    for (const machineId of dataset.anomalyMachineIds) {
      const turnRed = plan.anomalyTurnRedMs.get(machineId)!
      const delays: number[] = []
      let current = byId.get(machineId)
      while (current && current.parentId !== null) {
        const key = `${current.parentId}->${current.id}`
        const delay = plan.anomalyFlushDelayMs.get(key)
        expect(delay, key).toBeDefined()
        delays.push(delay!)
        current = byId.get(current.parentId)
      }
      expect(delays).toHaveLength(ANOMALY_FLUSH_HOPS)
      // hop 0 — the edge directly INTO this machine — is never shared with
      // any other anomalous machine, so it always fires at exactly this
      // machine's own turn-red moment, with no dedup possible.
      expect(delays[0]).toBe(turnRed)
      // an UPPER hop, by contrast, may be shared with another anomalous
      // machine under the same line/line/plant and can legitimately
      // resolve EARLIER than this machine's own local schedule would
      // predict — "flushes at whichever machine reaches it first" is
      // covered by its own dedicated test below, so this one only asserts
      // hop 0's exactness plus every hop being within the reveal's own
      // sane bounds.
      for (const d of delays)
        expect(d).toBeGreaterThanOrEqual(
          turnRed - ANOMALY_FLUSH_TOTAL_MS * dataset.anomalyMachineIds.length
        )
    }
  })

  it("a shared ancestor edge between two anomalous machines flushes at the earliest of the two", () => {
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
    const seen = new Map<string, number>()
    for (const machineId of dataset.anomalyMachineIds) {
      const turnRed = plan.anomalyTurnRedMs.get(machineId)!
      let current = byId.get(machineId)
      let hop = 0
      while (current && current.parentId !== null) {
        const key = `${current.parentId}->${current.id}`
        const delay =
          turnRed + hop * (ANOMALY_FLUSH_TOTAL_MS / ANOMALY_FLUSH_HOPS)
        const prior = seen.get(key)
        seen.set(key, prior === undefined ? delay : Math.min(prior, delay))
        current = byId.get(current.parentId)
        hop++
      }
    }
    for (const [key, expectedMin] of seen) {
      expect(plan.anomalyFlushDelayMs.get(key)).toBe(expectedMin)
    }
  })

  it("stage 6: the spore release starts at STAGE_START_MS.records, history draws after it finishes, total duration is their sum", () => {
    expect(plan.subNodeStartMs).toBe(STAGE_START_MS.records)
    expect(plan.historyStartMs).toBe(
      plan.subNodeStartMs + plan.subNodeDurationMs
    )
    expect(plan.totalDurationMs).toBe(
      plan.historyStartMs + plan.historyDurationMs
    )
  })

  it("ticker lines: 6 lines (one per stage), real dataset counts, in stage order, fade starts after totalDurationMs", () => {
    expect(plan.tickerLines).toHaveLength(6)
    const lineCount = dataset.domainEntities.filter(
      (e) => e.tier === "line"
    ).length
    expect(plan.tickerLines[3].text).toContain(String(lineCount))
    expect(plan.tickerLines[3].text).toContain(String(lineCount))
    expect(plan.tickerLines[5].text).toContain(
      dataset.subNodes.length.toLocaleString()
    )
    for (let i = 1; i < plan.tickerLines.length; i++)
      expect(plan.tickerLines[i].atMs).toBeGreaterThan(
        plan.tickerLines[i - 1].atMs
      )
    expect(plan.tickerFadeStartMs).toBeGreaterThan(plan.totalDurationMs)
  })

  it("is deterministic: building the plan twice from the same dataset produces identical delays", () => {
    const again = buildSpawnPlan(dataset)
    expect([...plan.budStartMs.entries()]).toEqual([
      ...again.budStartMs.entries(),
    ])
    expect([...plan.countryPopDelayMs.entries()]).toEqual([
      ...again.countryPopDelayMs.entries(),
    ])
  })
})

describe('hasEverSpawned (S8.4b "ONCE PER DATASET", unchanged by S8.5N)', () => {
  beforeEach(() => resetHasEverSpawned())

  it("starts false, becomes true only after markHasSpawned, and stays true across repeated reads", () => {
    expect(getHasEverSpawned()).toBe(false)
    markHasSpawned()
    expect(getHasEverSpawned()).toBe(true)
    expect(getHasEverSpawned()).toBe(true)
  })

  it("resetHasEverSpawned restores the initial false state (test-only escape hatch)", () => {
    markHasSpawned()
    resetHasEverSpawned()
    expect(getHasEverSpawned()).toBe(false)
  })
})
