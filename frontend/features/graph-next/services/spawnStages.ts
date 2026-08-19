// S8.5N: THE CELL-GROWTH REVEAL — replaces S8.4b/8.5R's edge-then-pop
// staged reveal entirely. Two primitives:
//
//   PRIMITIVE A (countries only) — a single dramatic arrival: scale
//   0 -> 1.0 -> 1.22 -> 1.0, ease-in then ease-out, plus a one-shot
//   expanding arrival ring. No migration — a country doesn't come FROM
//   anywhere.
//
//   PRIMITIVE B (everything else, including environment nodes) — cell
//   division, not travel-to-a-destination: the PARENT swells, a CHILD
//   appears AT THE PARENT'S OWN POSITION and migrates outward to its own
//   final position (the edge drawing behind it as a trail), then settles
//   with a small overshoot while the parent relaxes.
//
// This module only ever computes WHEN things happen (every duration/easing
// constant a render layer needs to build its own CSS), never what a frame
// looks like — same separation this file has always kept.
//
// PARENT-POP EPISODES: a parent that buds more than once across the reveal
// (a plant buds its own environment node in stage 3, then its line in
// stage 4 — two separate litters) gets ONE swell/relax episode per litter,
// not one continuous swell spanning the whole reveal — "stays slightly
// swollen until its LAST child [of that litter] has left," not until the
// entire reveal ends. Rendered on a SEPARATE outer <g> layer from the
// node's own arrival animation (its inner <g>), so a node that is
// simultaneously still settling from its OWN arrival and beginning to
// swell as a parent (S8.5N's stage 4 deliberately overlaps lines landing
// with operators already budding) never fights itself for the same CSS
// `transform` — the two effects compose by nested-<g> multiplication, not
// by two animations racing on one element.

import type { DomainDataset, DomainEntity } from "../types/domain"
import type { GraphId } from "../types/graph"

export const STAGE_START_MS = {
  countries: 0,
  plants: 2000,
  environment: 3100,
  linesOperators: 3900,
  machines: 5200,
  records: 6400,
} as const

// -- PRIMITIVE A: the major pop (countries) ------------------------------
export const POP_A_DURATION_MS = 680
export const POP_A_EASE_IN = "cubic-bezier(0.42, 0.00, 0.58, 1.00)"
export const POP_A_EASE_OUT = "cubic-bezier(0.16, 1.00, 0.30, 1.00)"
export const COUNTRY_STAGGER_MS = 220
export const COUNTRY_NAME_DELAY_AFTER_LAND_MS = 200
export const COUNTRY_NAME_FADE_MS = 300
export const ARRIVAL_RING_DURATION_MS = 520
export const ARRIVAL_RING_MAX_RADIUS_PX = 40

// -- PRIMITIVE B: the bud (everything else) ------------------------------
export const BUD_PARENT_SWELL_MS = 160
export const BUD_PARENT_SWELL_SCALE = 1.14
export const BUD_PARENT_RELAX_MS = 220
export const BUD_CHILD_MIGRATE_MS = 380
export const BUD_CHILD_MIGRATE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)"
export const BUD_CHILD_SETTLE_MS = 260
export const BUD_CHILD_TOTAL_MS = BUD_CHILD_MIGRATE_MS + BUD_CHILD_SETTLE_MS // 640
export const BUD_CHILD_START_SCALE = 0.15
export const BUD_CHILD_MIGRATE_END_SCALE = 0.85
export const BUD_CHILD_SETTLE_PEAK_SCALE = 1.1

export const PLANT_STAGGER_MS = 90
/** Staggered ACROSS the flat list of lines, not within each plant's litter — that spread is what stage 5's overlap is measured against. */
export const LINE_STAGGER_MS = 45
export const MACHINE_STAGGER_MS = 30
/** Sensors bud with their machine, fanning out just behind it. */
export const SENSOR_STAGGER_MS = 12

// -- anomaly: arrives normal, then becomes wrong -------------------------
export const ANOMALY_TURN_RED_DELAY_MS = 200
export const ANOMALY_TURN_RED_DURATION_MS = 200
export const ANOMALY_FLUSH_TOTAL_MS = 340
/** machine -> line -> plant -> country. Was 4, describing a chain with an `operator` rung that no longer exists, so the flush ran 255ms of its intended 340. */
export const ANOMALY_FLUSH_HOPS = 3

// -- stage 6: the spore release -------------------------------------------
export const SUBNODE_MASS_DURATION_MS = 900
export const HISTORY_DRAW_MS = 600
export const HISTORY_REST_OPACITY = 0.12

export const TICKER_FADE_DELAY_MS = 400
export const TICKER_FADE_MS = 500

export interface TickerLine {
  atMs: number
  text: string
}

export interface ParentPopEpisode {
  swellStart: number
  relaxStart: number
}

export interface SpawnPlan {
  /** Country id -> when its own PRIMITIVE A pop starts. */
  countryPopDelayMs: ReadonlyMap<GraphId, number>
  /** Country id -> when its name fades in beneath it. */
  countryNameDelayMs: ReadonlyMap<GraphId, number>
  /** Every non-country domain entity AND every environment node -> when it appears at its parent's position and begins migrating (PRIMITIVE B). */
  budStartMs: ReadonlyMap<GraphId, number>
  /** Same keys as budStartMs -> the parent it buds from, for computing the migration's start offset from resolved layout positions at render time. */
  budParentId: ReadonlyMap<GraphId, GraphId>
  /** Parent id -> every swell/relax episode it goes through as it buds its own children, in temporal order. */
  parentPopEpisodes: ReadonlyMap<GraphId, ParentPopEpisode[]>
  /** Anomalous machine id -> when it turns red (always AFTER it has already settled normally). */
  anomalyTurnRedMs: ReadonlyMap<GraphId, number>
  /** "parentId->childId" edge key -> when that hop's flush-to-red starts, outward (nearest the machine) to inward (nearest the country). */
  anomalyFlushDelayMs: ReadonlyMap<string, number>
  subNodeStartMs: number
  subNodeDurationMs: number
  historyStartMs: number
  historyDurationMs: number
  tickerLines: TickerLine[]
  tickerFadeStartMs: number
  /** The moment everything has landed — what "hasEverSpawned" gates future mounts against, and what a mid-reveal click jumps straight to. */
  totalDurationMs: number
}

function pluralCount(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`
}

function pushEpisode(
  map: Map<GraphId, ParentPopEpisode[]>,
  parentId: GraphId,
  swellStart: number,
  relaxStart: number
) {
  const list = map.get(parentId)
  const episode = { swellStart, relaxStart }
  if (list) list.push(episode)
  else map.set(parentId, [episode])
}

function groupBy<T>(
  items: readonly T[],
  keyOf: (item: T) => GraphId
): Map<GraphId, T[]> {
  const map = new Map<GraphId, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

export function buildSpawnPlan(dataset: DomainDataset): SpawnPlan {
  const byId = new Map<GraphId, DomainEntity>(
    dataset.domainEntities.map((e) => [e.id, e])
  )

  const countryPopDelayMs = new Map<GraphId, number>()
  const countryNameDelayMs = new Map<GraphId, number>()
  const budStartMs = new Map<GraphId, number>()
  const budParentId = new Map<GraphId, GraphId>()
  const parentPopEpisodes = new Map<GraphId, ParentPopEpisode[]>()

  // -- stage 1: countries — PRIMITIVE A, staggered 220ms -------------------
  const countries = dataset.domainEntities.filter((e) => e.tier === "country")
  countries.forEach((c, i) => {
    const pop = STAGE_START_MS.countries + i * COUNTRY_STAGGER_MS
    countryPopDelayMs.set(c.id, pop)
    countryNameDelayMs.set(
      c.id,
      pop + POP_A_DURATION_MS + COUNTRY_NAME_DELAY_AFTER_LAND_MS
    )
  })

  // -- stage 2: plants — budded from countries, staggered 90ms within country, all countries simultaneous --
  const plantsByCountry = groupBy(
    dataset.domainEntities.filter((e) => e.tier === "plant"),
    (r) => r.countryId
  )
  for (const [countryId, list] of plantsByCountry) {
    const starts = list.map((plant, j) => {
      const start = STAGE_START_MS.plants + j * PLANT_STAGGER_MS
      budStartMs.set(plant.id, start)
      budParentId.set(plant.id, plant.parentId!)
      return start
    })
    pushEpisode(
      parentPopEpisodes,
      countryId,
      Math.min(...starts) - BUD_PARENT_SWELL_MS,
      Math.max(...starts)
    )
  }

  // -- stage 3: environment — one per plant, all simultaneous, sideways --
  for (const env of dataset.environmentNodes) {
    const start = STAGE_START_MS.environment
    budStartMs.set(env.id, start)
    budParentId.set(env.id, env.plantId)
    pushEpisode(
      parentPopEpisodes,
      env.plantId,
      start - BUD_PARENT_SWELL_MS,
      start
    )
  }

  // -- stage 4: lines, budded from their plant ---------------------------
  // Staggered across the flat list rather than within each plant's litter:
  // that is what gives this stage a spread wide enough for the next stage's
  // overlap to be measured against.
  const lines = dataset.domainEntities.filter((e) => e.tier === "line")
  const lineStartById = new Map<GraphId, number>()
  lines.forEach((line, i) => {
    const start = STAGE_START_MS.linesOperators + i * LINE_STAGGER_MS
    budStartMs.set(line.id, start)
    budParentId.set(line.id, line.parentId!)
    lineStartById.set(line.id, start)
  })

  // ONE swell/relax episode per litter, not one per child. A plant with three
  // lines used to get three episodes for a single litter — the module's own
  // contract above says one, and plant:line being 1:1 in the old invented
  // world is the only reason nobody noticed.
  for (const [plantId, litter] of groupBy(lines, (line) => line.parentId!)) {
    const starts = litter.map((line) => lineStartById.get(line.id)!)
    pushEpisode(
      parentPopEpisodes,
      plantId,
      Math.min(...starts) - BUD_PARENT_SWELL_MS,
      Math.max(...starts)
    )
  }

  // -- stage 5: machines, budded from their line, with their own sensors ---
  // At STAGE_START_MS.machines with MACHINE_STAGGER_MS. Both constants were
  // dead: machines were being budded from the removed operator slot at
  // 4240ms while the ticker announced them at 5200ms, so they appeared a
  // full second before anything said they had.
  const machinesByLine = groupBy(
    dataset.domainEntities.filter((e) => e.tier === "machine"),
    (machine) => machine.parentId!
  )

  // Sensors are MOUNTED_ON a machine, so they bud from the machine they sit
  // on. They used to hang off a line, which now has no sensors at all.
  const sensorsByMachine = groupBy(
    dataset.domainEntities.filter((e) => e.tier === "sensor" && e.parentId),
    (sensor) => sensor.parentId!
  )

  for (const [lineId, machines] of machinesByLine) {
    const starts = machines.map((machine, k) => {
      const start = STAGE_START_MS.machines + k * MACHINE_STAGGER_MS
      budStartMs.set(machine.id, start)
      budParentId.set(machine.id, machine.parentId!)

      const sensors = sensorsByMachine.get(machine.id) ?? []
      const sensorStarts = sensors.map((sensor, n) => {
        const sensorStart = start + n * SENSOR_STAGGER_MS
        budStartMs.set(sensor.id, sensorStart)
        budParentId.set(sensor.id, sensor.parentId!)
        return sensorStart
      })
      if (sensorStarts.length > 0)
        pushEpisode(
          parentPopEpisodes,
          machine.id,
          Math.min(...sensorStarts) - BUD_PARENT_SWELL_MS,
          Math.max(...sensorStarts)
        )
      return start
    })
    if (starts.length > 0)
      pushEpisode(
        parentPopEpisodes,
        lineId,
        Math.min(...starts) - BUD_PARENT_SWELL_MS,
        Math.max(...starts)
      )
  }

  // Machines and their sensors bud with their line above; there is no separate
  // stage below it, because there is no operator rung between line and machine.

  // -- anomaly: arrives normal, turns red 200ms after settling, then its
  // ancestor chain flushes red outward (nearest the machine) to inward
  // (nearest the country) over 340ms. --
  const anomalyTurnRedMs = new Map<GraphId, number>()
  const anomalyFlushDelayMs = new Map<string, number>()
  for (const machineId of dataset.anomalyMachineIds) {
    const bud = budStartMs.get(machineId)
    if (bud === undefined) continue
    const turnRed = bud + BUD_CHILD_TOTAL_MS + ANOMALY_TURN_RED_DELAY_MS
    anomalyTurnRedMs.set(machineId, turnRed)
    let current: DomainEntity | undefined = byId.get(machineId)
    let hop = 0
    while (current && current.parentId !== null) {
      const key = `${current.parentId}->${current.id}`
      const delay =
        turnRed + hop * (ANOMALY_FLUSH_TOTAL_MS / ANOMALY_FLUSH_HOPS)
      const existing = anomalyFlushDelayMs.get(key)
      // A shared upper edge (two anomalous machines on the same line, say)
      // flushes at whichever machine reaches it FIRST.
      if (existing === undefined || delay < existing)
        anomalyFlushDelayMs.set(key, delay)
      current = byId.get(current.parentId)
      hop++
    }
  }

  // -- stage 6: the spore release, then history links draw last -----------
  const subNodeStartMs = STAGE_START_MS.records
  const subNodeDurationMs = SUBNODE_MASS_DURATION_MS
  const historyStartMs = subNodeStartMs + subNodeDurationMs
  const historyDurationMs = HISTORY_DRAW_MS
  const totalDurationMs = historyStartMs + historyDurationMs

  const tickerLines: TickerLine[] = [
    {
      atMs: STAGE_START_MS.countries,
      text: pluralCount(countries.length, "country", "countries"),
    },
    {
      atMs: STAGE_START_MS.plants,
      text: pluralCount(
        dataset.domainEntities.filter((e) => e.tier === "plant").length,
        "plant",
        "plants"
      ),
    },
    {
      atMs: STAGE_START_MS.environment,
      text: `${dataset.environmentNodes.length} environmental sensors · live`,
    },
    {
      atMs: STAGE_START_MS.linesOperators,
      text: `${pluralCount(lines.length, "line", "lines")}`,
    },
    {
      atMs: STAGE_START_MS.machines,
      text: pluralCount(
        dataset.domainEntities.filter((e) => e.tier === "machine").length,
        "individual",
        "individuals"
      ),
    },
    {
      atMs: STAGE_START_MS.records,
      text: `${dataset.subNodes.length.toLocaleString()} attached records · ${new Set(dataset.historyLinks.map((h) => h.machineId)).size} prior campaigns`,
    },
  ]

  return {
    countryPopDelayMs,
    countryNameDelayMs,
    budStartMs,
    budParentId,
    parentPopEpisodes,
    anomalyTurnRedMs,
    anomalyFlushDelayMs,
    subNodeStartMs,
    subNodeDurationMs,
    historyStartMs,
    historyDurationMs,
    tickerLines,
    tickerFadeStartMs: totalDurationMs + TICKER_FADE_DELAY_MS,
    totalDurationMs,
  }
}

// -- "ONCE PER DATASET" --------------------------------------------------
// Module-level, not component state — the dataset itself (graph/
// currentDataset.ts) is a module-level singleton built once per page
// session, so "once per dataset" and "once per session" are the same scope
// here. A view switch unmounts and remounts NetworkView; this flag is what
// tells the next mount "render everything final, don't replay."
let hasEverSpawned = false

export function getHasEverSpawned(): boolean {
  return hasEverSpawned
}

export function markHasSpawned(): void {
  hasEverSpawned = true
}

/** Test-only. */
export function resetHasEverSpawned(): void {
  hasEverSpawned = false
}
