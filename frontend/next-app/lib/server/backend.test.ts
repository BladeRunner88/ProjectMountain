import { describe, expect, it } from "vitest"

import { buildBackendUrl, pickSearchParams } from "./backend"

describe("buildBackendUrl", () => {
  it("prefixes the versioned API surface", () => {
    // The whole point of the Phase 6 flip. Route handlers pass bare paths, and
    // the prefix is applied here so twenty of them did not each have to change.
    expect(buildBackendUrl("/findings")).toBe(
      "http://localhost:8010/api/v1/findings"
    )
  })

  it("keeps the prefix ahead of a nested path", () => {
    expect(buildBackendUrl("/objects/machine_00001")).toBe(
      "http://localhost:8010/api/v1/objects/machine_00001"
    )
  })

  it("appends query parameters after the prefix, not inside it", () => {
    const url = buildBackendUrl("/search", new URLSearchParams({ q: "press" }))

    expect(url).toBe("http://localhost:8010/api/v1/search?q=press")
  })
})

describe("pickSearchParams", () => {
  it("copies only the allowed keys", () => {
    const source = new URLSearchParams({ type: "Machine", drop: "me" })

    expect(pickSearchParams(source, ["type"]).toString()).toBe("type=Machine")
  })

  it("keeps every value of a repeated key", () => {
    const source = new URLSearchParams([
      ["channel", "spindle_temp_c"],
      ["channel", "vibration_mm_s"],
    ])

    expect(pickSearchParams(source, ["channel"]).getAll("channel")).toEqual([
      "spindle_temp_c",
      "vibration_mm_s",
    ])
  })

  it("drops a key the upstream endpoint does not understand", () => {
    // This is a boundary, not a convenience: without it a client could smuggle
    // arbitrary parameters through the proxy into the backend.
    const source = new URLSearchParams({ limit: "10", "': DROP": "x" })

    expect(pickSearchParams(source, ["limit"]).toString()).toBe("limit=10")
  })
})
