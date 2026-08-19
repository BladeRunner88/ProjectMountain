import { describe, expect, it } from "vitest"

import {
  isApiPath,
  isAppPath,
  isPublicApiPath,
  requiresAccess,
} from "./access-gate"

describe("requiresAccess", () => {
  it("gates the product and demo surfaces", () => {
    expect(isAppPath("/app")).toBe(true)
    expect(isAppPath("/app/graph")).toBe(true)
    expect(isAppPath("/demo/workspace")).toBe(true)
    expect(requiresAccess("/app/search")).toBe(true)
    expect(requiresAccess("/demo")).toBe(true)
  })

  it("leaves marketing and the access form alone", () => {
    expect(requiresAccess("/")).toBe(false)
    expect(requiresAccess("/request-access")).toBe(false)
    expect(requiresAccess("/about")).toBe(false)
  })

  it("gates warehouse APIs so a missing cookie cannot be bypassed via /api", () => {
    expect(isApiPath("/api/findings")).toBe(true)
    expect(requiresAccess("/api/findings")).toBe(true)
    expect(requiresAccess("/api/objects/machine_00001")).toBe(true)
    expect(requiresAccess("/api/search")).toBe(true)
  })

  it("keeps health and access-request submission public", () => {
    expect(isPublicApiPath("/api/health")).toBe(true)
    expect(isPublicApiPath("/api/access-requests")).toBe(true)
    expect(requiresAccess("/api/health")).toBe(false)
    expect(requiresAccess("/api/access-requests")).toBe(false)
    expect(requiresAccess("/api/access-requests/")).toBe(false)
  })
})
