import { beforeEach, describe, expect, it } from "vitest"

import {
  ACCESS_COOKIE_NAME,
  ACCESS_COOKIE_VALUE,
  ACCESS_STORAGE_KEY,
  clearAccessCookie,
  clearStoredAccess,
  hasAccess,
  hasAccessCookie,
  isAccessSummary,
  persistAccess,
  readStoredAccess,
  setAccessCookie,
  type AccessSummary,
} from "@/lib/access"

const summary: AccessSummary = {
  companyName: "Isildur",
  industry: "Security",
  country: "NP",
  deploymentEnvironment: "cloud",
  billingContactEmail: "dev@example.com",
}

function clearAllCookies(): void {
  for (const part of document.cookie.split(";")) {
    const name = part.trim().split("=")[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

beforeEach(() => {
  window.localStorage.clear()
  clearAllCookies()
})

describe("isAccessSummary", () => {
  it("accepts a fully populated summary", () => {
    expect(isAccessSummary(summary)).toBe(true)
  })

  it("rejects non-objects", () => {
    expect(isAccessSummary(null)).toBe(false)
    expect(isAccessSummary(undefined)).toBe(false)
    expect(isAccessSummary("summary")).toBe(false)
    expect(isAccessSummary(42)).toBe(false)
  })

  it("rejects an object missing a required field", () => {
    const partial: Record<string, unknown> = { ...summary }
    delete partial.billingContactEmail
    expect(isAccessSummary(partial)).toBe(false)
  })

  it("rejects an object whose field has the wrong type", () => {
    expect(isAccessSummary({ ...summary, country: 7 })).toBe(false)
  })
})

describe("readStoredAccess", () => {
  it("reports no access when nothing is stored", () => {
    expect(readStoredAccess()).toEqual({ granted: false, summary: null })
  })

  it("returns the stored summary once persisted", () => {
    persistAccess(summary)
    expect(readStoredAccess()).toEqual({ granted: true, summary })
  })

  it("returns no access when the stored value is not valid JSON", () => {
    window.localStorage.setItem(ACCESS_STORAGE_KEY, "{not json")
    expect(readStoredAccess()).toEqual({ granted: false, summary: null })
  })

  it("returns no access when the stored JSON is not a summary", () => {
    window.localStorage.setItem(
      ACCESS_STORAGE_KEY,
      JSON.stringify({ companyName: "Isildur" })
    )
    expect(readStoredAccess()).toEqual({ granted: false, summary: null })
  })
})

describe("persistAccess / clearStoredAccess", () => {
  it("writes the summary under the documented key, with an expiry", () => {
    const before = Date.now()
    persistAccess(summary)
    const raw = window.localStorage.getItem(ACCESS_STORAGE_KEY)
    expect(raw).not.toBeNull()

    // The stored grant carries its own lifetime so the localStorage mirror
    // expires alongside the access cookie rather than outliving it.
    const stored = JSON.parse(raw as string) as {
      summary: unknown
      expiresAt: number
    }
    expect(stored.summary).toEqual(summary)
    expect(stored.expiresAt).toBeGreaterThan(before)
  })

  it("removes the stored summary", () => {
    persistAccess(summary)
    clearStoredAccess()
    expect(window.localStorage.getItem(ACCESS_STORAGE_KEY)).toBeNull()
    expect(readStoredAccess().granted).toBe(false)
  })
})

describe("access cookie helpers", () => {
  it("reports no cookie before one is set", () => {
    expect(hasAccessCookie()).toBe(false)
  })

  it("sets and detects the access cookie", () => {
    setAccessCookie()
    expect(document.cookie).toContain(
      `${ACCESS_COOKIE_NAME}=${ACCESS_COOKIE_VALUE}`
    )
    expect(hasAccessCookie()).toBe(true)
  })

  it("clears the access cookie", () => {
    setAccessCookie()
    clearAccessCookie()
    expect(hasAccessCookie()).toBe(false)
  })

  it("ignores the cookie when it carries an unexpected value", () => {
    document.cookie = `${ACCESS_COOKIE_NAME}=0; path=/`
    expect(hasAccessCookie()).toBe(false)
  })

  it("is not fooled by a different cookie whose name merely contains ours", () => {
    document.cookie = `not_${ACCESS_COOKIE_NAME}=${ACCESS_COOKIE_VALUE}; path=/`
    expect(hasAccessCookie()).toBe(false)
  })

  it("finds the cookie among several others", () => {
    document.cookie = "theme=dark; path=/"
    setAccessCookie()
    document.cookie = "locale=en; path=/"
    expect(hasAccessCookie()).toBe(true)
  })
})

describe("hasAccess", () => {
  it("is false when neither storage nor cookie is present", () => {
    expect(hasAccess()).toBe(false)
  })

  it("is false with only the stored summary", () => {
    persistAccess(summary)
    expect(hasAccess()).toBe(false)
  })

  it("is false with only the cookie", () => {
    setAccessCookie()
    expect(hasAccess()).toBe(false)
  })

  it("is true when both the stored summary and the cookie are present", () => {
    persistAccess(summary)
    setAccessCookie()
    expect(hasAccess()).toBe(true)
  })
})
