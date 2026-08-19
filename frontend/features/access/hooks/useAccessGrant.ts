"use client"

import { useEffect, useSyncExternalStore } from "react"

import { useAccess } from "@/hooks/use-access"
import {
  ACCESS_STORAGE_KEY,
  readStoredAccess,
  setAccessCookie,
  type AccessSummary,
  type StoredAccess,
} from "@/lib/access"

export type AccessGrant = {
  granted: boolean
  summary: AccessSummary | null
  grantAccess: (summary: AccessSummary) => void
}

let cachedRaw: string | null | undefined
let cachedStore: StoredAccess = { granted: false, summary: null }

function getSnapshot(): StoredAccess {
  const raw = window.localStorage.getItem(ACCESS_STORAGE_KEY)
  if (raw === cachedRaw) return cachedStore
  cachedRaw = raw
  cachedStore = readStoredAccess()
  return cachedStore
}

function getServerSnapshot(): StoredAccess {
  return { granted: false, summary: null }
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
  }
}

export function useAccessGrant(): AccessGrant {
  const access = useAccess()
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (access.granted || stored.granted) {
      setAccessCookie()
    }
  }, [access.granted, stored.granted])

  return {
    granted: access.granted || stored.granted,
    summary: access.summary ?? stored.summary,
    grantAccess: (next: AccessSummary): void => {
      cachedRaw = undefined
      access.grantAccess(next)
    },
  }
}
