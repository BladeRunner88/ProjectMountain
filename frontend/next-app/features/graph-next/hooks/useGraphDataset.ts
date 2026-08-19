"use client"

import { useSyncExternalStore } from "react"

import {
  getGraphDataset,
  subscribeToGraphDataset,
} from "../services/currentDataset"
import type { DomainDataset } from "../types/domain"

/** The shared graph dataset, or null until the world has been fetched and built. */
export function useGraphDataset(): DomainDataset | null {
  return useSyncExternalStore(
    subscribeToGraphDataset,
    getGraphDataset,
    // Nothing is built on the server: the world is fetched in the browser.
    () => null
  )
}
