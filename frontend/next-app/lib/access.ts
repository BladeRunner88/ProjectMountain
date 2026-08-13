export const ACCESS_STORAGE_KEY = "isildur_access_request"
export const ACCESS_COOKIE_NAME = "isildur_access"
export const ACCESS_COOKIE_VALUE = "1"

export type AccessSummary = {
  companyName: string
  industry: string
  country: string
  deploymentEnvironment: string
  billingContactEmail: string
}

export type StoredAccess = {
  granted: boolean
  summary: AccessSummary | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function isAccessSummary(value: unknown): value is AccessSummary {
  if (!isRecord(value)) return false
  return (
    typeof value.companyName === "string" &&
    typeof value.industry === "string" &&
    typeof value.country === "string" &&
    typeof value.deploymentEnvironment === "string" &&
    typeof value.billingContactEmail === "string"
  )
}

export function readStoredAccess(): StoredAccess {
  if (typeof window === "undefined") {
    return { granted: false, summary: null }
  }
  try {
    const raw = window.localStorage.getItem(ACCESS_STORAGE_KEY)
    if (!raw) return { granted: false, summary: null }
    const parsed: unknown = JSON.parse(raw)
    if (!isAccessSummary(parsed)) return { granted: false, summary: null }
    return { granted: true, summary: parsed }
  } catch {
    return { granted: false, summary: null }
  }
}

export function persistAccess(summary: AccessSummary): void {
  window.localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(summary))
}

export function clearStoredAccess(): void {
  window.localStorage.removeItem(ACCESS_STORAGE_KEY)
}

export function setAccessCookie(): void {
  document.cookie = `${ACCESS_COOKIE_NAME}=${ACCESS_COOKIE_VALUE}; path=/; SameSite=Lax`
}

export function clearAccessCookie(): void {
  document.cookie = `${ACCESS_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`
}

export function hasAccessCookie(): boolean {
  if (typeof document === "undefined") return false
  return document.cookie.split(";").some((part) => {
    const trimmed = part.trim()
    const eq = trimmed.indexOf("=")
    if (eq < 0) return false
    const name = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    return name === ACCESS_COOKIE_NAME && value === ACCESS_COOKIE_VALUE
  })
}

export function hasAccess(): boolean {
  if (typeof window === "undefined") return false
  return readStoredAccess().granted && hasAccessCookie()
}
