export const ACCESS_STORAGE_KEY = "isildur_access_request"
export const ACCESS_COOKIE_NAME = "isildur_access"
export const ACCESS_COOKIE_VALUE = "1"

/**
 * Lifetime of the demo access grant. The cookie `Max-Age` and the
 * `localStorage` mirror share this value so both expire together.
 */
export const ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

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

type StoredAccessRecord = {
  summary: AccessSummary
  expiresAt: number
}

function isStoredAccessRecord(value: unknown): value is StoredAccessRecord {
  if (!isRecord(value)) return false
  return Number.isFinite(value.expiresAt) && isAccessSummary(value.summary)
}

function makeRecord(summary: AccessSummary): StoredAccessRecord {
  return {
    summary,
    expiresAt: Date.now() + ACCESS_MAX_AGE_SECONDS * 1000,
  }
}

const EMPTY_STORED_ACCESS: StoredAccess = { granted: false, summary: null }

/**
 * Read-only: this is the `getSnapshot` behind `useSyncExternalStore`, so it must
 * never write to storage. Expired records read as "not granted" and are swept
 * away separately by `pruneExpiredAccess()`.
 */
export function readStoredAccess(): StoredAccess {
  if (typeof window === "undefined") {
    return EMPTY_STORED_ACCESS
  }
  try {
    const raw = window.localStorage.getItem(ACCESS_STORAGE_KEY)
    if (!raw) return EMPTY_STORED_ACCESS
    const parsed: unknown = JSON.parse(raw)
    if (isStoredAccessRecord(parsed)) {
      if (parsed.expiresAt <= Date.now()) return EMPTY_STORED_ACCESS
      return { granted: true, summary: parsed.summary }
    }
    // Grants written before the record format carried no expiry; honour them.
    if (isAccessSummary(parsed)) return { granted: true, summary: parsed }
    return EMPTY_STORED_ACCESS
  } catch {
    return EMPTY_STORED_ACCESS
  }
}

export function persistAccess(summary: AccessSummary): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      ACCESS_STORAGE_KEY,
      JSON.stringify(makeRecord(summary))
    )
  } catch {
    // Storage can be unavailable (private mode, quota). The cookie is what the
    // proxy gate actually reads, so a failed mirror must not abort the grant.
  }
}

/**
 * Slide the stored grant's expiry forward so it stays in lockstep with the
 * access cookie, which is re-issued with a fresh `Max-Age` on every visit.
 * No-op when there is no live grant to extend.
 */
function refreshStoredAccess(): void {
  const current = readStoredAccess()
  if (!current.granted || !current.summary) return
  persistAccess(current.summary)
}

/**
 * Drop a stored grant whose expiry has passed. Safe to call at any time; only
 * removes records that `readStoredAccess()` already treats as ungranted.
 */
export function pruneExpiredAccess(): void {
  if (typeof window === "undefined") return
  if (readStoredAccess().granted) return
  clearStoredAccess()
}

export function clearStoredAccess(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(ACCESS_STORAGE_KEY)
  } catch {
    // See persistAccess: storage failures must not break the gate.
  }
}

function accessCookieAttributes(): string[] {
  const attributes = ["path=/", "SameSite=Lax"]
  // Only mark the cookie `Secure` when the page can actually carry it. A
  // production build served over plain HTTP would otherwise have the cookie
  // silently dropped, leaving the visitor stuck in a /request-access loop.
  if (
    process.env.NODE_ENV === "production" &&
    window.location.protocol === "https:"
  ) {
    attributes.push("Secure")
  }
  return attributes
}

export function setAccessCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = [
    `${ACCESS_COOKIE_NAME}=${ACCESS_COOKIE_VALUE}`,
    ...accessCookieAttributes(),
    `max-age=${ACCESS_MAX_AGE_SECONDS}`,
  ].join("; ")
  // The cookie and its localStorage mirror share one lifetime, so every
  // re-issue of the cookie also slides the mirror forward.
  refreshStoredAccess()
}

export function clearAccessCookie(): void {
  if (typeof document === "undefined") return
  // Deletion matches on name/path/domain only, so `Secure` is irrelevant here
  // and omitting it keeps logout working over plain HTTP too.
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
