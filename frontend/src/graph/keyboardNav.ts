// S8.8: pure ordering logic for keyboard navigation — "tab cycles entities,
// arrows move within a tier". Kept separate from the keydown handler
// (wired at GraphNext level) so the ordering itself is unit-testable
// without a DOM.

import type { DomainDataset } from './domain'
import type { GraphId } from './types'

/** Tab / Shift+Tab — cycles through all 127 domain entities in their dataset's own stable order. */
export function nextEntity(dataset: DomainDataset, currentId: GraphId | null, direction: 1 | -1): GraphId | null {
  const list = dataset.domainEntities
  if (list.length === 0) return null
  if (!currentId) return direction === 1 ? list[0].id : list[list.length - 1].id
  const idx = list.findIndex((e) => e.id === currentId)
  if (idx === -1) return list[0].id
  const nextIdx = (idx + direction + list.length) % list.length
  return list[nextIdx].id
}

/** Arrow keys — moves to the next/previous entity of the SAME tier as `currentId`, wrapping. */
export function siblingInTier(dataset: DomainDataset, currentId: GraphId, direction: 1 | -1): GraphId | null {
  const current = dataset.domainEntities.find((e) => e.id === currentId)
  if (!current) return null
  const siblings = dataset.domainEntities.filter((e) => e.tier === current.tier)
  const idx = siblings.findIndex((e) => e.id === currentId)
  if (idx === -1) return null
  const nextIdx = (idx + direction + siblings.length) % siblings.length
  return siblings[nextIdx].id
}
