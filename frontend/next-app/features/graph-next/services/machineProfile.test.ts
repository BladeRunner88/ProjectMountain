import { describe, expect, it } from "vitest"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"
import { buildMachinePlacements, buildLineProfiles } from "./terrainProfile"
import { buildMachineProfiles } from "./machineProfile"
import { graphTestWorld } from "@/features/graph-next/testing/graphWorld"

describe("graph/machineProfile (S8.9)", () => {
  const dataset = buildGraphDataset(graphTestWorld(), GRAPH_SEED)
  const lineProfiles = buildLineProfiles(dataset)
  const placements = buildMachinePlacements(dataset, lineProfiles)
  const profiles = buildMachineProfiles(dataset, placements, lineProfiles)

  it("builds one profile for every one of the 50 machines", () => {
    expect(profiles.size).toBe(50)
  })

  it("is deterministic — same dataset, same profiles", () => {
    const again = buildMachineProfiles(dataset, placements, lineProfiles)
    for (const [id, p] of profiles) expect(again.get(id)).toEqual(p)
  })

  it("reuses TERRAIN's own placement for station/line/load — the panel and the mountain can never disagree", () => {
    const [machineId, profile] = [...profiles.entries()][0]
    const placement = placements.get(machineId)!
    const lineProfile = lineProfiles.get(placement.lineId)!
    expect(profile.station).toBe(placement.station)
    expect(profile.loadM).toBe(placement.loadM)
    expect(profile.lineLabel).toBe(lineProfile.label)
  })

  it("confidence is a plausible percentage", () => {
    for (const p of profiles.values()) {
      expect(p.confidencePct).toBeGreaterThanOrEqual(0)
      expect(p.confidencePct).toBeLessThanOrEqual(100)
    }
  })

  it("date of birth implies a plausible adult age", () => {
    for (const p of profiles.values()) {
      expect(p.ageYears).toBeGreaterThanOrEqual(18)
      expect(p.ageYears).toBeLessThanOrEqual(80)
      expect(p.dateOfBirthIso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it("lat/lon land near the line country and stay within valid bounds", () => {
    for (const p of profiles.values()) {
      expect(p.lat).toBeGreaterThan(-90)
      expect(p.lat).toBeLessThan(90)
      expect(p.lon).toBeGreaterThan(-180)
      expect(p.lon).toBeLessThan(180)
    }
  })
})
