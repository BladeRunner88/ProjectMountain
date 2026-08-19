import { describe, expect, it } from "vitest"

import { formatComputed, humaniseFindingType } from "./display"

describe("humaniseFindingType", () => {
  it("gives a known detector a readable name", () => {
    expect(humaniseFindingType("SOURCE_DIVERGENCE")).toBe("Source divergence")
  })

  it("still reads a detector the frontend has never heard of", () => {
    // A backend that learns to detect something new must not render as a shout.
    expect(humaniseFindingType("TOOL_WEAR_TREND")).toBe("tool wear trend")
  })
})

describe("formatComputed", () => {
  it("labels keys without their underscores", () => {
    expect(formatComputed({ gap_minutes: 442 })).toEqual([
      { label: "gap minutes", value: "442" },
    ])
  })

  it("keeps integers exact and rounds fractions", () => {
    const entries = formatComputed({ window_n: 1234, z_score: -4.271 })

    expect(entries[0]?.value).toBe("1,234")
    expect(entries[1]?.value).toBe("-4.27")
  })

  it("hides keys that name the measure rather than quantify it", () => {
    const labels = formatComputed({
      unit: "batches",
      measure: "runs",
      count: 3,
    }).map((e) => e.label)

    expect(labels).toEqual(["count"])
  })

  it("drops null values rather than printing them", () => {
    expect(formatComputed({ baseline_rate: null, current_rate: 0.15 })).toEqual(
      [{ label: "current rate", value: "0.15" }]
    )
  })

  it("shows unknown keys rather than dropping them", () => {
    // A detector the frontend was not taught about should still show its working.
    expect(formatComputed({ novel_metric: 7 })).toEqual([
      { label: "novel metric", value: "7" },
    ])
  })

  it("caps how many it shows so one finding cannot flood the row", () => {
    const computed = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`key_${i}`, i])
    )

    expect(formatComputed(computed)).toHaveLength(4)
  })
})
