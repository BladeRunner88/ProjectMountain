// S8.6: NETWORK and STRATA must render "the same data" — not two separately
// built datasets, one genuinely shared instance.
//
// This was built at module-evaluation time from a seed. It cannot be any more:
// the dataset is derived from the world the backend serves, which arrives over
// HTTP, so the instance is created once when that lands and read through a
// subscription rather than an import.

import type { AseWorld } from "@/features/ase/types/world"

import type { DomainDataset } from "../types/domain"
import { buildGraphDataset, GRAPH_SEED } from "./dataset"

let current: DomainDataset | null = null
const listeners = new Set<() => void>()

/** Builds the shared instance from `world`. Idempotent — a second call is ignored. */
export function initializeGraphDataset(world: AseWorld): DomainDataset {
  if (current) return current
  current = buildGraphDataset(world, GRAPH_SEED)
  for (const listener of listeners) listener()
  return current
}

/** The shared instance, or null before the world has arrived. */
export function getGraphDataset(): DomainDataset | null {
  return current
}

export function subscribeToGraphDataset(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Test-only: drops the instance so the next initialize rebuilds it. */
export function resetGraphDataset(): void {
  current = null
}
