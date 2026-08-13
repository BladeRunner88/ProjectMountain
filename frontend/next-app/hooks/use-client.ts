"use client"

import { useSyncExternalStore } from "react"

function emptySubscribe(): () => void {
  return () => {}
}

export function useIsClient(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

function subscribeClock(onStoreChange: () => void): () => void {
  const id = window.setInterval(onStoreChange, 1000)
  return () => window.clearInterval(id)
}

function getClockSnapshot(): number {
  return Math.floor(Date.now() / 1000)
}

function getClockServerSnapshot(): number {
  return 0
}

export function useClientNow(): Date | null {
  const isClient = useIsClient()
  const seconds = useSyncExternalStore(
    subscribeClock,
    getClockSnapshot,
    getClockServerSnapshot
  )
  if (!isClient) return null
  return new Date(seconds * 1000)
}
