// S8.5N: THE DETAIL PANEL's own spine — a per-kind key/value PROPERTIES
// list and a written SUMMARY, both computed fresh from the dataset (never
// stored). Reuses every real relationship the dataset already carries
// (hierarchy counts, LineProfile, MachineProfile, live environment
// readings) and seeds the handful of fields nothing in the domain model
// carries at all (workOrders issued, technical grade, guide count, safety
// rating, battery, confidence) the same deterministic "seeded per id, no
// Date.now()" way machineProfile.ts/terrainProfile.ts already do — flavour
// text, disclosed as such, never something a real number could contradict.

import { mulberry32, randInt, seedFromString } from "./rng"
import {
  ENVIRONMENT_CYCLE_TIME_BREACH_S,
  ENVIRONMENT_SPINDLE_TEMP_BREACH_C,
  ENVIRONMENT_OEE_BREACH_PCT,
  ENVIRONMENT_VIBRATION_BREACH_MM_S,
} from "./dataset"
import { computeConnections } from "./connections"
import type { EnvironmentReading } from "../stores/environmentStore"
import type { MachinePlacement, LineProfile } from "./terrainProfile"
import type { MachineProfile } from "./machineProfile"
import type {
  DomainDataset,
  DomainEntity,
  EntityTier,
  SubNode,
} from "../types/domain"
import type { GraphId } from "../types/graph"

export const OEE_BREACH_PCT = 85
export const VIBRATION_BREACH_HIGH = 160
export const VIBRATION_BREACH_LOW = 45

export interface PropertyRow {
  label: string
  value: string
  breaching?: boolean
  threshold?: string
}

export interface EntityDetail {
  kind: EntityTier | "record"
  rows: PropertyRow[]
  summary: string
}

export interface ReadingsReading {
  oee: number
  vibration: number
}

export interface EntityPropertiesContext {
  environmentReadings: ReadonlyMap<GraphId, EnvironmentReading>
  lineProfiles: ReadonlyMap<GraphId, LineProfile>
  machinePlacements: ReadonlyMap<GraphId, MachinePlacement>
  machineProfiles: ReadonlyMap<GraphId, MachineProfile>
  /** The live machine this reading belongs to, if any is currently active — readingsStore only ever tracks one machine at a time. */
  activeReadings: { machineId: GraphId; reading: ReadingsReading } | null
}

/** Lines are direct children of plants (S8.3) — one hop, no walk needed. */
function plantIdOfLine(
  byId: ReadonlyMap<GraphId, DomainEntity>,
  lineId: GraphId
): GraphId | null {
  return byId.get(lineId)?.parentId ?? null
}

const TECHNICAL_GRADES = [
  "PD",
  "PD+",
  "AD",
  "AD+",
  "D",
  "D+",
  "TD",
  "TD+",
  "ED",
] as const

function formatAgo(ts: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - ts) / 60000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function mostRecentSubNodeTs(
  dataset: DomainDataset,
  parentId: GraphId
): number | null {
  let latest: number | null = null
  for (const s of dataset.subNodes) {
    if (s.parentId !== parentId) continue
    if (latest === null || s.ts > latest) latest = s.ts
  }
  return latest
}

function environmentRow(
  label: string,
  value: number,
  unit: string,
  breach: (v: number) => boolean,
  thresholdText: string,
  decimals = 0
): PropertyRow {
  const breaching = breach(value)
  return {
    label,
    value: `${decimals ? value.toFixed(decimals) : Math.round(value)}${unit}`,
    breaching,
    threshold: breaching ? thresholdText : undefined,
  }
}

function conditionsRows(
  reading: EnvironmentReading | undefined
): PropertyRow[] {
  if (!reading) return []
  return [
    environmentRow(
      "Vibration",
      reading.vibrationMmS,
      "kph",
      (v) => v > ENVIRONMENT_VIBRATION_BREACH_MM_S,
      `threshold ${ENVIRONMENT_VIBRATION_BREACH_MM_S}kph`
    ),
    environmentRow(
      "Spindle temp",
      reading.spindleTempC,
      "°C",
      (v) => v < ENVIRONMENT_SPINDLE_TEMP_BREACH_C,
      `threshold ${ENVIRONMENT_SPINDLE_TEMP_BREACH_C}°C`
    ),
    environmentRow(
      "Effectiveness",
      reading.oeePct,
      "km",
      (v) => v < ENVIRONMENT_OEE_BREACH_PCT,
      `threshold ${ENVIRONMENT_OEE_BREACH_PCT}km`,
      1
    ),
    environmentRow(
      "Cycle time",
      reading.cycleTimeS,
      "m",
      (v) => v > ENVIRONMENT_CYCLE_TIME_BREACH_S,
      `threshold ${ENVIRONMENT_CYCLE_TIME_BREACH_S}m`
    ),
  ]
}

function conditionsSummaryPhrase(
  reading: EnvironmentReading | undefined
): string {
  if (!reading) return "no live reading yet"
  if (!reading.breached)
    return `calm — ${Math.round(reading.vibrationMmS)}kph vibration, ${Math.round(reading.spindleTempC)}°C`
  const breaches: string[] = []
  if (reading.vibrationMmS > ENVIRONMENT_VIBRATION_BREACH_MM_S)
    breaches.push("vibration has exceeded the operating threshold")
  if (reading.spindleTempC < ENVIRONMENT_SPINDLE_TEMP_BREACH_C)
    breaches.push("temperature has dropped below the operating threshold")
  if (reading.oeePct < ENVIRONMENT_OEE_BREACH_PCT)
    breaches.push("effectiveness has fallen below the operating threshold")
  if (reading.cycleTimeS > ENVIRONMENT_CYCLE_TIME_BREACH_S)
    breaches.push("the cycle time has risen above the operating threshold")
  return breaches[0] ?? "a condition is currently breaching"
}

export function computeEntityDetail(
  dataset: DomainDataset,
  id: GraphId,
  ctx: EntityPropertiesContext,
  nowMs: number
): EntityDetail | null {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const entity = byId.get(id)
  if (entity)
    return computeDomainEntityDetail(dataset, entity, byId, ctx, nowMs)
  const sub = dataset.subNodes.find((s) => s.id === id)
  if (sub) return computeRecordDetail(sub)
  return null
}

function computeDomainEntityDetail(
  dataset: DomainDataset,
  entity: DomainEntity,
  byId: ReadonlyMap<GraphId, DomainEntity>,
  ctx: EntityPropertiesContext,
  nowMs: number
): EntityDetail {
  const rand = mulberry32(seedFromString(entity.id, 7100))
  const descendants = (tier: EntityTier, scopeId: GraphId) =>
    dataset.domainEntities.filter(
      (e) => e.tier === tier && e.countryId === scopeId
    )

  switch (entity.tier) {
    case "country": {
      const plants = descendants("plant", entity.id)
      const lines = descendants("line", entity.id)
      const machines = descendants("machine", entity.id)
      const anomaliesOpen = dataset.domainEntities.filter(
        (e) => e.countryId === entity.id && e.status === "anomaly"
      ).length
      const workOrdersIssued = machines.length + randInt(rand, 5, 40)
      const activeCampaigns = new Set(machines.map((c) => c.parentId)).size
      const rows: PropertyRow[] = [
        { label: "Plants", value: String(plants.length) },
        { label: "Lines", value: String(lines.length) },
        { label: "Machines", value: String(machines.length) },
        { label: "Active campaigns", value: String(activeCampaigns) },
        { label: "WorkOrders issued", value: String(workOrdersIssued) },
        { label: "Anomalies open", value: String(anomaliesOpen) },
      ]
      const flaggedMachine = machines.find((c) => c.status === "anomaly")
      const flaggedLine = flaggedMachine
        ? lineLabelFor(byId, flaggedMachine.id)
        : null
      const summary =
        anomaliesOpen === 0
          ? `${entity.label} hosts ${plants.length} active plant${plants.length === 1 ? "" : "s"} and ${machines.length} machines. Nothing is currently flagged.`
          : `${entity.label} hosts ${plants.length} active plant${plants.length === 1 ? "" : "s"} and ${machines.length} machines. ${anomaliesOpen} ${anomaliesOpen === 1 ? "entity is" : "entities are"} currently flagged${flaggedLine ? `, including on the ${flaggedLine} line` : ""}.`
      return { kind: "country", rows, summary }
    }
    case "plant": {
      const country = byId.get(entity.parentId ?? "")
      const lines = dataset.domainEntities.filter(
        (e) => e.tier === "line" && e.parentId === entity.id
      )
      const machines = dataset.domainEntities.filter(
        (e) => e.tier === "machine" && lines.some((l) => l.id === e.parentId)
      )
      const reading = ctx.environmentReadings.get(entity.id)
      const rows: PropertyRow[] = [
        { label: "Country", value: country?.label ?? "—" },
        { label: "Lines", value: String(lines.length) },
        { label: "Parties on line", value: String(machines.length) },
        { label: "Machines", value: String(machines.length) },
        ...conditionsRows(reading),
      ]
      const anomalyMachines = machines.filter((c) => c.status === "anomaly")
      const conditionsClause = reading
        ? `Conditions are currently ${conditionsSummaryPhrase(reading)}`
        : "Live conditions have not reported in yet"
      const flaggedClause =
        anomalyMachines.length > 0
          ? `, and ${anomalyMachines.length} machine${anomalyMachines.length === 1 ? " is" : "s are"} flagged`
          : ""
      const summary = `${entity.label} carries ${lines.length} line${lines.length === 1 ? "" : "s"} for  and ${machines.length} machines. ${conditionsClause}${flaggedClause}.`
      return { kind: "plant", rows, summary }
    }
    case "line": {
      const plant = byId.get(entity.parentId ?? "")
      const profile = ctx.lineProfiles.get(entity.id)
      const machines = dataset.domainEntities.filter(
        (e) => e.tier === "machine" && e.parentId === entity.id
      )
      const sensor = dataset.domainEntities.find(
        (e) => e.tier === "sensor" && e.parentId === entity.id
      )
      const grade =
        TECHNICAL_GRADES[Math.floor(rand() * TECHNICAL_GRADES.length)]
      const rows: PropertyRow[] = [
        { label: "Plant", value: plant?.label ?? "—" },
        { label: "Length", value: profile ? `${profile.lengthKm}km` : "—" },
        {
          label: "Entry load",
          value: profile ? `${profile.entryLoadM.toLocaleString()}m` : "—",
        },
        {
          label: "Crux load",
          value: profile ? `${profile.cruxLoadM.toLocaleString()}m` : "—",
        },
        {
          label: "Exit load",
          value: profile ? `${profile.exitLoadM.toLocaleString()}m` : "—",
        },
        { label: "Technical grade", value: grade },
        { label: "Parties on line", value: String(machines.length) },
        { label: "Sensor covering it", value: sensor?.label ?? "none" },
      ]
      const summary = `${entity.label} runs ${profile?.lengthKm ?? "—"}km from ${profile?.entryLoadM.toLocaleString() ?? "—"}m to a ${profile?.exitLoadM.toLocaleString() ?? "—"}m exit, graded ${grade}. ${machines.length} machine${machines.length === 1 ? " is" : "s are"} currently on line.`
      return { kind: "line", rows, summary }
    }
    case "machine": {
      const profile = ctx.machineProfiles.get(entity.id)
      const placement = ctx.machinePlacements.get(entity.id)
      const connections = computeConnections(dataset, entity.id)
      const ropePartners = connections.filter(
        (c) => c.relation === "rope-partner"
      )
      const readings =
        ctx.activeReadings?.machineId === entity.id
          ? ctx.activeReadings.reading
          : null
      const rows: PropertyRow[] = [
        { label: "Operator", value: profile?.operatorLabel ?? "—" },
        { label: "Line", value: profile?.lineLabel ?? "—" },
        { label: "Current station", value: placement?.station ?? "—" },
        {
          label: "Load",
          value: placement ? `${placement.loadM.toLocaleString()}m` : "—",
        },
        { label: "Line", value: profile?.linePrefix ?? "—" },
        { label: "Origin", value: profile?.originCountry ?? "—" },
        {
          label: "Date of birth",
          value: profile
            ? `${profile.dateOfBirthIso} (${profile.ageYears})`
            : "—",
        },
        {
          label: "Targets",
          value: profile ? String(profile.targetsCompleted) : "—",
        },
        readings
          ? {
              label: "Oee",
              value: `${Math.round(readings.oee)}%`,
              breaching: readings.oee < OEE_BREACH_PCT,
              threshold:
                readings.oee < OEE_BREACH_PCT
                  ? `threshold ${OEE_BREACH_PCT}%`
                  : undefined,
            }
          : { label: "Oee", value: "—" },
        readings
          ? {
              label: "Vibration",
              value: `${Math.round(readings.vibration)}mm/s`,
              breaching:
                readings.vibration > VIBRATION_BREACH_HIGH ||
                readings.vibration < VIBRATION_BREACH_LOW,
              threshold:
                readings.vibration > VIBRATION_BREACH_HIGH ||
                readings.vibration < VIBRATION_BREACH_LOW
                  ? `threshold ${VIBRATION_BREACH_LOW}-${VIBRATION_BREACH_HIGH}mm/s`
                  : undefined,
            }
          : { label: "Vibration", value: "—" },
        {
          label: "Rope partners",
          value:
            ropePartners.length > 0
              ? ropePartners.map((p) => p.label).join(", ")
              : "none",
        },
      ]
      const flaggedText =
        entity.status === "anomaly" ? ` This machine is currently flagged.` : ""
      const summary = `${entity.label} is climbing with ${profile?.operatorLabel ?? "their operator"} on ${profile?.lineLabel ?? "their line"}, currently at ${placement?.station ?? "an unknown station"} (${placement?.loadM.toLocaleString() ?? "—"}m). ${profile?.targetsCompleted ?? 0} prior target${(profile?.targetsCompleted ?? 0) === 1 ? "" : "s"} completed.${flaggedText}`
      return { kind: "machine", rows, summary }
    }
    case "sensor": {
      const line = byId.get(entity.parentId ?? "")
      const plantId = line ? plantIdOfLine(byId, line.id) : null
      const reading = plantId ? ctx.environmentReadings.get(plantId) : undefined
      const battery = randInt(rand, 18, 100)
      const lastTs = mostRecentSubNodeTs(dataset, entity.id)
      const rows: PropertyRow[] = [
        { label: "Line", value: line?.label ?? "—" },
        ...conditionsRows(reading),
        {
          label: "Battery",
          value: `${battery}%`,
          breaching: battery < 20,
          threshold: battery < 20 ? "threshold 20%" : undefined,
        },
        {
          label: "Last reading age",
          value: lastTs !== null ? formatAgo(lastTs, nowMs) : "—",
        },
      ]
      const conditionsClause = reading
        ? `currently reading ${conditionsSummaryPhrase(reading)}`
        : "has not reported live conditions yet"
      const summary = `${entity.label} covers ${line?.label ?? "its line"}, ${conditionsClause}. Battery at ${battery}%.`
      return { kind: "sensor", rows, summary }
    }
  }
}

function lineLabelFor(
  byId: ReadonlyMap<GraphId, DomainEntity>,
  machineId: GraphId
): string | null {
  const machine = byId.get(machineId)
  const operator = machine?.parentId ? byId.get(machine.parentId) : undefined
  const line = operator?.parentId ? byId.get(operator.parentId) : undefined
  return line?.label ?? null
}

const RECORD_SOURCE_LABEL = "field system"

function computeRecordDetail(sub: SubNode): EntityDetail {
  const rand = mulberry32(seedFromString(sub.id, 7200))
  const confidencePct = randInt(rand, 62, 99)
  const rows: PropertyRow[] = [
    { label: "Kind", value: sub.kind },
    { label: "Timestamp", value: new Date(sub.ts).toISOString() },
    { label: "Source", value: sub.provenanceId || RECORD_SOURCE_LABEL },
    { label: "Summary", value: sub.summary },
    { label: "Confidence", value: `${confidencePct}%` },
  ]
  const summary = `A ${sub.kind} record${sub.status === "alert" ? ", currently flagged," : ""}: ${sub.summary}`
  return { kind: "record", rows, summary }
}

// -- LABELS: "small chips at the foot — the entity kind, its country, its
// status, and any tags: corroborated, single-source, anomalous, prior-
// campaign." Status itself already reads as ANOMALY/NOMINAL in its own
// chip (the header), so "anomalous" here isn't repeated as a redundant
// second badge — corroborated/single-source (provenance diversity across
// this entity's own attached records) and prior-campaign (machines with
// at least one graph/domain.ts HistoryLink) are the two tags that add
// information the header doesn't already carry. --

export interface LabelChips {
  kind: string
  country: string | null
  status: string
  tags: string[]
}

export function computeLabels(
  dataset: DomainDataset,
  id: GraphId
): LabelChips | null {
  const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
  const entity = byId.get(id)
  if (entity) {
    const country = byId.get(entity.countryId)
    const tags: string[] = []
    const provenances = new Set(
      dataset.subNodes
        .filter((s) => s.parentId === id)
        .map((s) => s.provenanceId)
    )
    if (provenances.size > 1) tags.push("corroborated")
    else if (provenances.size === 1) tags.push("single-source")
    if (
      entity.tier === "machine" &&
      dataset.historyLinks.some((h) => h.machineId === id)
    )
      tags.push("prior-campaign")
    return {
      kind: entity.tier,
      country: country?.label ?? null,
      status: entity.status,
      tags,
    }
  }
  const sub = dataset.subNodes.find((s) => s.id === id)
  if (sub) {
    return { kind: "record", country: null, status: sub.status, tags: [] }
  }
  const env = dataset.environmentNodes.find((e) => e.id === id)
  if (env) {
    const country = byId.get(env.countryId)
    return {
      kind: "environment",
      country: country?.label ?? null,
      status: env.breached ? "anomaly" : "nominal",
      tags: [],
    }
  }
  return null
}
