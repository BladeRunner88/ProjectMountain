import { describe, expect, it } from "vitest"
import { clearRegistry } from "./graph"
import { sourceReliability } from "./folds"
import { derivationFnId, derived, instant, observed, sourceId } from "./traced"
import { formatElapsed, recentChanges } from "./activity"

describe("recentChanges", () => {
  it("reads only superseded values, newest first, and composes a sentence", () => {
    clearRegistry()
    const newer = observed(sourceId("s"), "oee", 71, sourceReliability(0.9))
    const older = observed(sourceId("s"), "oee", 98, sourceReliability(0.9), {
      supersededAt: instant("2026-01-01T00:00:10.000Z"),
      supersededBy: newer.id,
    })
    // A still-current value must not show up as a "change".
    const current = observed(sourceId("s"), "vibration", 80, sourceReliability(0.9))

    const changes = recentChanges([newer, older, current])
    expect(changes).toHaveLength(1)
    expect(changes[0].oldId).toBe(older.id)
    expect(changes[0].newId).toBe(newer.id)
    // Still English, not a template artefact — no underscores anywhere,
    // which a raw snake_case field slug would always leave behind.
    expect(changes[0].sentence).not.toContain("_")
    expect(changes[0].sentence).toContain("changed from 98 to 71")
  })

  it("orders multiple changes newest-first and respects the limit", () => {
    clearRegistry()
    const newA = observed(sourceId("s"), "a", 2, sourceReliability(0.9))
    const oldA = observed(sourceId("s"), "a", 1, sourceReliability(0.9), {
      supersededAt: instant("2026-01-01T00:00:00.000Z"),
      supersededBy: newA.id,
    })
    const newB = observed(sourceId("s"), "b", 2, sourceReliability(0.9))
    const oldB = observed(sourceId("s"), "b", 1, sourceReliability(0.9), {
      supersededAt: instant("2026-01-01T00:05:00.000Z"),
      supersededBy: newB.id,
    })

    const changes = recentChanges([newA, oldA, newB, oldB])
    expect(changes.map((c) => c.oldId)).toEqual([oldB.id, oldA.id])

    const limited = recentChanges([newA, oldA, newB, oldB], 1)
    expect(limited).toHaveLength(1)
    expect(limited[0].oldId).toBe(oldB.id)
  })

  it("is empty when nothing has been superseded", () => {
    clearRegistry()
    const tv = observed(sourceId("s"), "f", 1, sourceReliability(0.9))
    expect(recentChanges([tv])).toEqual([])
  })
})

// S1g: "a variable name must never reach the interface" — these prove the
// composed sentence for the two conventions any dataset can opt into, using
// deliberately non-campaign, non-banking field names so the logic itself
// stays proven domain-agnostic.
describe("sentence composition (S1g)", () => {
  it('a bare "..._ago" slug (no subject) reads as a source-level freshness sentence', () => {
    clearRegistry()
    const source = sourceId("widget-feed")
    const next = observed(
      source,
      "last_sync_seconds_ago",
      7,
      sourceReliability(0.9)
    )
    const prev = observed(
      source,
      "last_sync_seconds_ago",
      4,
      sourceReliability(0.9),
      {
        supersededBy: next.id,
        supersededAt: instant("2026-01-01T00:00:00.000Z"),
      }
    )
    const [change] = recentChanges([prev, next])
    expect(change.sentence).toBe(
      "Widget feed last synced 7 seconds ago — 3 seconds slower than before."
    )
  })

  it('a fresher reading reads as "faster"', () => {
    clearRegistry()
    const source = sourceId("widget-feed")
    const next = observed(
      source,
      "last_sync_seconds_ago",
      2,
      sourceReliability(0.9)
    )
    const prev = observed(
      source,
      "last_sync_seconds_ago",
      9,
      sourceReliability(0.9),
      {
        supersededBy: next.id,
        supersededAt: instant("2026-01-01T00:00:00.000Z"),
      }
    )
    const [change] = recentChanges([prev, next])
    expect(change.sentence).toBe(
      "Widget feed last synced 2 seconds ago — 7 seconds faster than before."
    )
  })

  // S9.6: a raw seconds count past 90 used to read as noise ("4646 seconds
  // ago"); it must express in minutes instead, both for the headline value
  // and the delta.
  it("a seconds reading past 90 reads in minutes, not raw seconds", () => {
    clearRegistry()
    const source = sourceId("widget-feed")
    const next = observed(
      source,
      "last_sync_seconds_ago",
      4646,
      sourceReliability(0.9)
    )
    const prev = observed(
      source,
      "last_sync_seconds_ago",
      4281,
      sourceReliability(0.9),
      {
        supersededBy: next.id,
        supersededAt: instant("2026-01-01T00:00:00.000Z"),
      }
    )
    const [change] = recentChanges([prev, next])
    expect(change.sentence).toBe(
      "Widget feed last synced 77.4 minutes ago — 6.1 minutes slower than before."
    )
  })

  it('a "subject:metric_pct" slug reads as a possessive rose/fell sentence', () => {
    clearRegistry()
    const source = sourceId("some-source")
    const next = observed(
      source,
      "test-subject:reading_pct",
      81,
      sourceReliability(0.9)
    )
    const prev = observed(
      source,
      "test-subject:reading_pct",
      84,
      sourceReliability(0.9),
      {
        supersededBy: next.id,
        supersededAt: instant("2026-01-01T00:00:00.000Z"),
      }
    )
    const [change] = recentChanges([prev, next])
    expect(change.sentence).toBe("Test Subject's reading fell from 84% to 81%.")
  })

  it("an unrecognised slug still falls back to English, never the raw slug alone", () => {
    clearRegistry()
    const source = sourceId("some-source")
    const next = observed(source, "widget_count", 5, sourceReliability(0.9))
    const prev = observed(source, "widget_count", 3, sourceReliability(0.9), {
      supersededBy: next.id,
      supersededAt: instant("2026-01-01T00:00:00.000Z"),
    })
    const [change] = recentChanges([prev, next])
    expect(change.sentence.includes("widget_count")).toBe(false)
    expect(change.sentence).toContain("widget count")
  })
})

// S9.4: a conflict's resolved value is a real 'derived' TracedValue, not
// 'observed' — it has no rawField, but its `fn` (see conflictFnSlug) is
// authored in the exact same "subject:metric" convention, so the same
// generic pattern-matching composes real English for it too.
describe("sentence composition for 'derived' fn slugs (S9.4)", () => {
  it('a "subject:metric" derived fn slug reads as a possessive sentence, same as an observed one', () => {
    clearRegistry()
    const source = sourceId("some-source")
    const inputA = observed(source, "a", 1, sourceReliability(0.9))
    const inputB = observed(source, "b", 2, sourceReliability(0.9))
    const next = derived(
      [inputA.id, inputB.id],
      derivationFnId("mac-0001:age"),
      35
    )
    const prev = derived(
      [inputA.id, inputB.id],
      derivationFnId("mac-0001:age"),
      34,
      {
        supersededBy: next.id,
        supersededAt: instant("2026-01-01T00:00:00.000Z"),
      }
    )
    const [change] = recentChanges([prev, next])
    expect(change.sentence).toBe("MAC-0001's age changed from 34 to 35.")
  })

  it("a bare (no-subject) derived fn slug falls back to the generic non-observed phrasing, never a raw slug", () => {
    clearRegistry()
    const source = sourceId("some-source")
    const input = observed(source, "f", 1, sourceReliability(0.9))
    const next = derived([input.id], derivationFnId("mean-confidence"), 91)
    const prev = derived([input.id], derivationFnId("mean-confidence"), 88, {
      supersededBy: next.id,
      supersededAt: instant("2026-01-01T00:00:00.000Z"),
    })
    const [change] = recentChanges([prev, next])
    expect(change.sentence).toBe("A derived value changed from 88 to 91.")
    expect(change.sentence).not.toContain("_")
    expect(change.sentence).not.toContain("mean-confidence")
  })

  it('a derived value whose value is not a primitive (e.g. a range-merge interval) never leaks "[object Object]"', () => {
    clearRegistry()
    const source = sourceId("some-source")
    const inputA = observed(source, "a", 1, sourceReliability(0.9))
    const inputB = observed(source, "b", 2, sourceReliability(0.9))
    const next = derived(
      [inputA.id, inputB.id],
      derivationFnId("plant:ambient-pressure"),
      { min: 860, max: 875 }
    )
    const prev = derived(
      [inputA.id, inputB.id],
      derivationFnId("plant:ambient-pressure"),
      { min: 862, max: 871 },
      {
        supersededBy: next.id,
        supersededAt: instant("2026-01-01T00:00:00.000Z"),
      }
    )
    const [change] = recentChanges([prev, next])
    expect(change.sentence).toBe("Plant's ambient pressure changed.")
    expect(change.sentence).not.toContain("object")
  })
})

describe("formatElapsed", () => {
  const now = new Date("2026-01-01T00:10:00.000Z")

  it("formats seconds, minutes, hours, and days", () => {
    expect(formatElapsed(instant("2026-01-01T00:09:55.000Z"), now)).toBe(
      "5s ago"
    )
    expect(formatElapsed(instant("2026-01-01T00:05:00.000Z"), now)).toBe(
      "5m ago"
    )
    expect(formatElapsed(instant("2025-12-31T22:10:00.000Z"), now)).toBe(
      "2h ago"
    )
    expect(formatElapsed(instant("2025-12-30T00:10:00.000Z"), now)).toBe(
      "2d ago"
    )
  })
})

describe("plant designations in activity sentences", () => {
  it("keeps a designation in its own shape rather than title-casing it", () => {
    // "mac-0001" is an identifier, not prose. Title-casing produced
    // "Mac 0001", which is not what anything in the plant is called.
    clearRegistry()
    const source = sourceId("some-source")
    const input = observed(source, "a", 1, sourceReliability(0.9))
    const next = derived([input.id], derivationFnId("bod-0014:cycle_time"), 12)
    const prev = derived(
      [input.id],
      derivationFnId("bod-0014:cycle_time"),
      11,
      {
        supersededBy: next.id,
        supersededAt: instant("2026-01-01T00:00:00.000Z"),
      }
    )

    const [change] = recentChanges([prev, next])

    expect(change.sentence).toContain("BOD-0014")
    expect(change.sentence).not.toContain("Bod 0014")
  })

  it("still title-cases a genuine multi-word subject", () => {
    clearRegistry()
    const source = sourceId("some-source")
    const input = observed(source, "a", 1, sourceReliability(0.9))
    const next = derived([input.id], derivationFnId("press-shop-one:takt"), 42)
    const prev = derived(
      [input.id],
      derivationFnId("press-shop-one:takt"),
      41,
      {
        supersededBy: next.id,
        supersededAt: instant("2026-01-01T00:00:00.000Z"),
      }
    )

    const [change] = recentChanges([prev, next])

    expect(change.sentence).toContain("Press Shop One")
  })
})
