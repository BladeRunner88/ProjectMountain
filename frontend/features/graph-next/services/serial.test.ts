import { describe, expect, it } from "vitest"
import { serialFor } from "./serial"

describe("graph/serial (S8.8)", () => {
  it("is deterministic for the same id", () => {
    expect(serialFor("machine-7")).toBe(serialFor("machine-7"))
  })

  it("differs between different ids (in the general case)", () => {
    expect(serialFor("machine-7")).not.toBe(serialFor("machine-8"))
  })

  it("is always a masked 4-digit serial", () => {
    expect(serialFor("machine-0")).toMatch(/^•••\d{4}$/)
  })
})
