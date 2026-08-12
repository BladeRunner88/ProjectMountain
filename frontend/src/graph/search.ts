// S8.8: SEARCH — "matches name, serial, operator, route, origin". Rather
// than special-casing which tier has an "operator" or a "route", each
// entity's searchable text is its own label + serial, plus every ancestor's
// label up to country — for a climber that literally IS operator, route,
// region and country; for other tiers it degrades gracefully (a route
// matches its own name and its country's). Built once per dataset, same
// "precompute, don't walk per keystroke" discipline as hoverChain.ts.

import { serialFor } from './serial'
import type { DomainDataset, DomainEntity } from './domain'
import type { GraphId } from './types'

export function buildSearchIndex(dataset: DomainDataset): ReadonlyMap<GraphId, string> {
  const byId = new Map<GraphId, DomainEntity>(dataset.domainEntities.map((e) => [e.id, e]))
  const index = new Map<GraphId, string>()
  for (const entity of dataset.domainEntities) {
    const parts = [entity.label, serialFor(entity.id)]
    let current = entity.parentId !== null ? byId.get(entity.parentId) : undefined
    while (current) {
      parts.push(current.label)
      current = current.parentId !== null ? byId.get(current.parentId) : undefined
    }
    index.set(entity.id, parts.join(' ').toLowerCase())
  }
  return index
}

/** null = no active search (nothing dimmed); a Set = the matching ids (search's own consumers, per S8.8, dim everything NOT in this set). */
export function computeSearchMatches(searchIndex: ReadonlyMap<GraphId, string>, query: string): ReadonlySet<GraphId> | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const matches = new Set<GraphId>()
  for (const [id, text] of searchIndex) {
    if (text.includes(q)) matches.add(id)
  }
  return matches
}

/** The first match in `dataset.domainEntities`' own stable order — what Enter selects. */
export function firstSearchMatch(dataset: DomainDataset, searchIndex: ReadonlyMap<GraphId, string>, query: string): GraphId | null {
  const matches = computeSearchMatches(searchIndex, query)
  if (!matches) return null
  for (const entity of dataset.domainEntities) {
    if (matches.has(entity.id)) return entity.id
  }
  return null
}
