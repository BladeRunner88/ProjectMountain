"use client"

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react"

import {
  clearAccessCookie,
  clearStoredAccess,
  persistAccess,
  pruneExpiredAccess,
  readStoredAccess,
  setAccessCookie,
  type AccessSummary,
  type StoredAccess,
} from "@/lib/access"

export type AccessContextValue = StoredAccess & {
  grantAccess: (summary: AccessSummary) => void
  clearAccess: () => void
}

const AccessContext = createContext<AccessContextValue | null>(null)

const EMPTY_ACCESS: StoredAccess = { granted: false, summary: null }

const listeners = new Set<() => void>()
let cachedAccess: StoredAccess = EMPTY_ACCESS

function sameAccess(a: StoredAccess, b: StoredAccess): boolean {
  if (a.granted !== b.granted) return false
  if (a.summary === b.summary) return true
  if (!a.summary || !b.summary) return false
  return (
    a.summary.companyName === b.summary.companyName &&
    a.summary.industry === b.summary.industry &&
    a.summary.country === b.summary.country &&
    a.summary.deploymentEnvironment === b.summary.deploymentEnvironment &&
    a.summary.billingContactEmail === b.summary.billingContactEmail
  )
}

function readCachedAccess(): StoredAccess {
  const next = readStoredAccess()
  if (sameAccess(cachedAccess, next)) return cachedAccess
  cachedAccess = next
  return cachedAccess
}

function emitAccess(): void {
  cachedAccess = readStoredAccess()
  for (const listener of listeners) listener()
}

function subscribeAccess(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

export function AccessProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const state = useSyncExternalStore(
    subscribeAccess,
    readCachedAccess,
    () => EMPTY_ACCESS
  )

  useEffect(() => {
    // Re-issuing the cookie also slides the stored mirror forward, so the two
    // halves of the demo gate always expire at the same moment.
    if (state.granted) {
      setAccessCookie()
      return
    }
    // Sweep a grant that has aged out; readStoredAccess stays read-only.
    pruneExpiredAccess()
  }, [state.granted])

  const grantAccess = (summary: AccessSummary): void => {
    persistAccess(summary)
    setAccessCookie()
    emitAccess()
  }

  const clearAccess = (): void => {
    clearStoredAccess()
    clearAccessCookie()
    emitAccess()
  }

  return (
    <AccessContext.Provider value={{ ...state, grantAccess, clearAccess }}>
      {children}
    </AccessContext.Provider>
  )
}

export function useAccess(): AccessContextValue {
  const ctx = useContext(AccessContext)
  if (!ctx) {
    throw new Error("useAccess must be used within AccessProvider")
  }
  return ctx
}

export type { AccessSummary }
