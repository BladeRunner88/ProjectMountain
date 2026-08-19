import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { buildLineProfiles, buildMachinePlacements } from "./terrainProfile"
import { buildMachineProfiles } from "./machineProfile"
import {
  computeEntityDetail,
  computeLabels,
  VIBRATION_BREACH_HIGH,
  VIBRATION_BREACH_LOW,
  OEE_BREACH_PCT,
  type EntityPropertiesContext,
} from "./entityProperties"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
const lineProfiles = buildLineProfiles(dataset)
const machinePlacements = buildMachinePlacements(dataset, lineProfiles)
const machineProfiles = buildMachineProfiles(
  dataset,
  machinePlacements,
  lineProfiles
)
const NOW = Date.now()

function baseCtx(
  overrides: Partial<EntityPropertiesContext> = {}
): EntityPropertiesContext {
  return {
    environmentReadings: new Map(),
    lineProfiles,
    machinePlacements,
    machineProfiles,
    activeReadings: null,
    ...overrides,
  }
}

function entityIdOf(tier: string): string {
  return dataset.domainEntities.find((e) => e.tier === tier)!.id
}

describe("computeEntityDetail (S8.5N detail panel spine)", () => {
  it("returns null for an id that resolves to nothing", () => {
    expect(
      computeEntityDetail(dataset, "does-not-exist", baseCtx(), NOW)
    ).toBeNull()
  })

  it("every domain tier produces a non-empty rows list and a non-empty summary, matching its own kind", () => {
    for (const tier of [
      "country",
      "plant",
      "line",
      "line",
      "machine",
      "sensor",
    ] as const) {
      const id = entityIdOf(tier)
      const detail = computeEntityDetail(dataset, id, baseCtx(), NOW)
      expect(detail, tier).not.toBeNull()
      expect(detail!.kind).toBe(tier)
      expect(detail!.rows.length).toBeGreaterThan(0)
      expect(detail!.summary.length).toBeGreaterThan(0)
    }
  })

  it("a record (sub-node) produces kind/timestamp/source/summary/confidence rows", () => {
    const sub = dataset.subNodes[0]
    const detail = computeEntityDetail(dataset, sub.id, baseCtx(), NOW)!
    expect(detail.kind).toBe("record")
    const labels = detail.rows.map((r) => r.label)
    expect(labels).toEqual([
      "Kind",
      "Timestamp",
      "Source",
      "Summary",
      "Confidence",
    ])
  })

  it("is deterministic: the same id, same context shape, same seed always produces the same rows and summary", () => {
    const id = entityIdOf("line")
    const a = computeEntityDetail(dataset, id, baseCtx(), NOW)
    const b = computeEntityDetail(dataset, id, baseCtx(), NOW)
    expect(a).toEqual(b)
  })

  it("country counts (plants/lines/lines/machines) match the real dataset hierarchy exactly, not a seeded guess", () => {
    const id = entityIdOf("country")
    const detail = computeEntityDetail(dataset, id, baseCtx(), NOW)!
    const country = dataset.domainEntities.find((e) => e.id === id)!
    const realPlants = dataset.domainEntities.filter(
      (e) => e.tier === "plant" && e.countryId === country.id
    ).length
    const realMachines = dataset.domainEntities.filter(
      (e) => e.tier === "machine" && e.countryId === country.id
    ).length
    expect(detail.rows.find((r) => r.label === "Plants")!.value).toBe(
      String(realPlants)
    )
    expect(detail.rows.find((r) => r.label === "Machines")!.value).toBe(
      String(realMachines)
    )
  })

  it("a plant with a breaching environment reading marks the corresponding rows red with a threshold, and a calm reading marks none", () => {
    const plantId = entityIdOf("plant")
    const calm = computeEntityDetail(
      dataset,
      plantId,
      baseCtx({
        environmentReadings: new Map([
          [
            plantId,
            {
              vibrationMmS: 10,
              spindleTempC: 0,
              oeePct: 15,
              cycleTimeS: 4000,
              breached: false,
            },
          ],
        ]),
      }),
      NOW
    )!
    expect(calm.rows.some((r) => r.breaching)).toBe(false)

    const breached = computeEntityDetail(
      dataset,
      plantId,
      baseCtx({
        environmentReadings: new Map([
          [
            plantId,
            {
              vibrationMmS: 999,
              spindleTempC: 0,
              oeePct: 15,
              cycleTimeS: 4000,
              breached: true,
            },
          ],
        ]),
      }),
      NOW
    )!
    const vibrationRow = breached.rows.find((r) => r.label === "Vibration")!
    expect(vibrationRow.breaching).toBe(true)
    expect(vibrationRow.threshold).toBeDefined()
  })

  it('a machine\'s effectiveness/vibration rows are "—" with no live reading, and breach correctly when the active readings cross the threshold', () => {
    const machineId = entityIdOf("machine")
    const noReadings = computeEntityDetail(dataset, machineId, baseCtx(), NOW)!
    expect(noReadings.rows.find((r) => r.label === "Oee")!.value).toBe("—")

    const lowOee = computeEntityDetail(
      dataset,
      machineId,
      baseCtx({
        activeReadings: {
          machineId,
          reading: { oee: OEE_BREACH_PCT - 5, vibration: 70 },
        },
      }),
      NOW
    )!
    const oeeRow = lowOee.rows.find((r) => r.label === "Oee")!
    expect(oeeRow.breaching).toBe(true)

    const highHr = computeEntityDetail(
      dataset,
      machineId,
      baseCtx({
        activeReadings: {
          machineId,
          reading: { oee: 98, vibration: VIBRATION_BREACH_HIGH + 10 },
        },
      }),
      NOW
    )!
    expect(highHr.rows.find((r) => r.label === "Vibration")!.breaching).toBe(
      true
    )

    const normalHr = computeEntityDetail(
      dataset,
      machineId,
      baseCtx({
        activeReadings: {
          machineId,
          reading: {
            oee: 98,
            vibration: (VIBRATION_BREACH_LOW + VIBRATION_BREACH_HIGH) / 2,
          },
        },
      }),
      NOW
    )!
    expect(normalHr.rows.find((r) => r.label === "Vibration")!.breaching).toBe(
      false
    )
  })

  it("an anomalous machine's summary mentions being flagged; a nominal one's does not", () => {
    const anomalyId = dataset.anomalyMachineIds[0]
    const anomalyDetail = computeEntityDetail(
      dataset,
      anomalyId,
      baseCtx(),
      NOW
    )!
    expect(anomalyDetail.summary).toContain("flagged")

    const nominalId = dataset.domainEntities.find(
      (e) => e.tier === "machine" && e.status === "nominal"
    )!.id
    const nominalDetail = computeEntityDetail(
      dataset,
      nominalId,
      baseCtx(),
      NOW
    )!
    expect(nominalDetail.summary).not.toContain("flagged")
  })
})

describe("computeLabels", () => {
  it("returns null for an unresolved id", () => {
    expect(computeLabels(dataset, "does-not-exist")).toBeNull()
  })

  it("every domain entity gets its own kind/country/status", () => {
    const id = entityIdOf("machine")
    const machine = dataset.domainEntities.find((e) => e.id === id)!
    const labels = computeLabels(dataset, id)!
    expect(labels.kind).toBe("machine")
    expect(labels.status).toBe(machine.status)
    expect(labels.country).not.toBeNull()
  })

  it("a machine with a history link carries the prior-campaign tag; one without does not", () => {
    const withHistory = dataset.historyLinks[0].machineId
    expect(computeLabels(dataset, withHistory)!.tags).toContain(
      "prior-campaign"
    )

    const machineIdsWithHistory = new Set(
      dataset.historyLinks.map((h) => h.machineId)
    )
    const withoutHistory = dataset.domainEntities.find(
      (e) => e.tier === "machine" && !machineIdsWithHistory.has(e.id)
    )
    if (withoutHistory) {
      expect(computeLabels(dataset, withoutHistory.id)!.tags).not.toContain(
        "prior-campaign"
      )
    }
  })

  it('a record (sub-node) resolves to kind "record" with no country', () => {
    const sub = dataset.subNodes[0]
    const labels = computeLabels(dataset, sub.id)!
    expect(labels.kind).toBe("record")
    expect(labels.country).toBeNull()
  })
})
