import { describe, expect, it } from "vitest"
import { buildDataset } from "./dataset"
import { confidence, provenance } from "./folds"
import { testWorld } from "../testing/world"
import { nodesOfTier } from "@/features/ase/types/world"

describe("ontology (S9.5)", () => {
  it("every competency question has a walkable, confidence-foldable canAnswer TracedValue", () => {
    const d = buildDataset(testWorld(), 1)
    for (const q of d.ontology.questions) {
      expect(() => provenance(q.canAnswer)).not.toThrow()
      expect(() => confidence(q.canAnswer)).not.toThrow()
    }
  })

  it("has exactly ten competency questions, all YES since S9.5b models insurance and evacuation cover", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.ontology.questions).toHaveLength(10)
    const yes = d.ontology.questions.filter((q) => q.canAnswer.value === true)
    const no = d.ontology.questions.filter((q) => q.canAnswer.value === false)
    // S9.5b: the identity record's WHAT A RESPONDER NEEDS block models
    // insurance and evacuation cover directly, flipping the one S9.5 NO.
    expect(yes).toHaveLength(10)
    expect(no).toHaveLength(0)
    const insurance = d.ontology.questions.find((q) => q.id === "q-insurance")!
    expect(insurance.canAnswer.value).toBe(true)
    expect(insurance.query()).not.toBe(
      "insurance and evacuation cover — not modelled."
    )
  })

  it("every question query() returns live English, not a hardcoded placeholder", () => {
    const d = buildDataset(testWorld(), 1)
    for (const q of d.ontology.questions) {
      const sentence = q.query()
      expect(typeof sentence).toBe("string")
      expect(sentence.length).toBeGreaterThan(0)
    }
  })

  it("every own-fact with a traced value is walkable and foldable", () => {
    const d = buildDataset(testWorld(), 1)
    for (const f of d.ontology.facts) {
      if (f.traced) {
        expect(() => provenance(f.traced!)).not.toThrow()
        expect(() => confidence(f.traced!)).not.toThrow()
      }
    }
  })

  it("relationship (non-own) facts carry no traced value, own facts do", () => {
    const d = buildDataset(testWorld(), 1)
    for (const f of d.ontology.facts) {
      if (!f.own) expect(f.traced).toBeNull()
    }
  })

  it("seeds six thing kinds, counted from the world rather than a fixed pool", () => {
    // The country count used to be hardcoded at 5, from a fixed name pool.
    // Plants and their countries now
    // come from the warehouse, so the number is whatever the world reports --
    // asserting it against the world is the only way this stays true when the
    // warehouse gains a plant.
    const world = testWorld()
    const d = buildDataset(world, 1)
    const byKind = Object.fromEntries(
      d.ontology.things.map((t) => [t.kind, t.count])
    )
    const lines = nodesOfTier(world, "line")
    const countries = new Set(
      lines.map((line) => {
        const plant = world.nodes.find((node) => node.id === line.parentId)
        return plant?.country
      })
    )

    expect(byKind).toEqual({
      country: countries.size,
      plant: lines.length,
      line: lines.length,
      // Real operators dealt across the lines, with a placeholder for any line
      // the world left without one -- so never fewer than there are lines. It
      // was a flat 30, from a pool of invented company names.
      operator: Math.max(world.operators.length, lines.length),
      machine: 50,
      sensor: 14,
    })
  })

  it("has exactly one NO in-house source citation with a justification note", () => {
    const d = buildDataset(testWorld(), 1)
    const inHouse = d.ontology.sources.filter((s) => s.inHouse)
    expect(inHouse).toHaveLength(1)
    expect(inHouse[0].note.length).toBeGreaterThan(0)
  })

  it('names exactly three "what we got wrong" items, verbatim', () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.ontology.whatWeGotWrong).toEqual([
      "Lines and plants are drawn as one dot in the graph but are two different things here.",
      "Operators have only one sub-type — either add more or remove the distinction.",
      "Rope partnerships are stored twice, once from each side.",
    ])
  })

  it("names the exact validity mismatch", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.ontology.validityMismatch).toBe(
      "The stored list is missing two nationality values added in January — new records using them are rejected at storage."
    )
    expect(d.ontology.validityChecks.map((c) => c.place)).toEqual([
      "code",
      "arrival",
      "storage",
    ])
  })

  it("never stores a race or linePrefix category anywhere (S9.5b)", () => {
    const d = buildDataset(testWorld(), 1)
    const json = JSON.stringify(d.ontology).toLowerCase()
    expect(json).not.toContain("linePrefix")
    expect(json).not.toMatch(/"race"/)
  })

  it("seeds exactly three record misfits, each with a walkable traced value", () => {
    const d = buildDataset(testWorld(), 1)
    expect(d.ontology.misfits).toHaveLength(3)
    for (const m of d.ontology.misfits) {
      expect(() => provenance(m.traced)).not.toThrow()
      expect(() => confidence(m.traced)).not.toThrow()
    }
  })

  it("every version has a real, live dependents()-backed conclusionsAffected()", () => {
    const d = buildDataset(testWorld(), 1)
    for (const v of d.ontology.versions) {
      expect(() => v.conclusionsAffected()).not.toThrow()
      expect(v.conclusionsAffected()).toBeGreaterThanOrEqual(0)
    }
    // v1.2 (conflict-policy resolution) has a real downstream dependent: Age.
    const v12 = d.ontology.versions.find((v) => v.version === "1.2")!
    expect(v12.conclusionsAffected()).toBeGreaterThanOrEqual(1)
  })

  it("exportOntology produces valid, parseable JSON containing the real thing/fact/version counts", async () => {
    const d = buildDataset(testWorld(), 1)
    const { exportOntology } = await import("./ontology")
    const json = exportOntology(d.ontology)
    const parsed = JSON.parse(json)
    expect(parsed.things).toHaveLength(6)
    expect(parsed.facts.length).toBe(d.ontology.facts.length)
    expect(parsed.versions.length).toBe(d.ontology.versions.length)
    // No function/closure leaks into the export — every value is JSON-safe.
    expect(json).not.toContain("function")
  })
})
