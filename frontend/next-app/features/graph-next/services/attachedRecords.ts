// S8.9: ATTACHED RECORDS ("a count by kind, and the ten most recent") and
// WHY FLAGGED ("which rules fired, when, and the value that triggered
// them"). Both read the SAME sub-node list (dataset.subNodes filtered by
// parentId) rather than owning separate data — WHY FLAGGED is just that
// list's alert-status subset, so a rule "firing" and a record actually
// existing can never disagree.

import type { DomainDataset, SubNode, SubNodeKind } from '../types/domain'
import type { GraphId } from '../types/graph'

export interface RecordCount {
  kind: SubNodeKind
  count: number
}

export function computeRecordCounts(dataset: DomainDataset, parentId: GraphId): RecordCount[] {
  const counts = new Map<SubNodeKind, number>()
  for (const s of dataset.subNodes) {
    if (s.parentId !== parentId) continue
    counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1)
  }
  return [...counts.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count)
}

export function computeRecentRecords(dataset: DomainDataset, parentId: GraphId, limit = 10): SubNode[] {
  return dataset.subNodes
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
}

/** The alert-flagged subset of the same parent's own records — "which rules fired, when, and the value that triggered them" reuses each alert record's own kind/ts/summary rather than a separate rules engine. */
export function computeFlaggedRecords(dataset: DomainDataset, parentId: GraphId): SubNode[] {
  return dataset.subNodes
    .filter((s) => s.parentId === parentId && s.status === 'alert')
    .sort((a, b) => b.ts - a.ts)
}
