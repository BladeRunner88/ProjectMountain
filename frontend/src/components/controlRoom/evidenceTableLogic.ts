// Pure logic behind EvidenceTable (S1e), kept DOM-free so it's testable
// without mounting a component — same convention as ase/LiteralsAudit.ts's
// `looksAuthored`.

/** S1e: "a row that cannot produce a sentence does not render at all" — never an empty WHY cell, the row itself is gone. */
export function hasRenderableWhy(why: string | null): why is string {
  return why !== null && why.trim() !== ''
}

export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export interface VisibleRange {
  start: number
  end: number
}

/** The windowed slice to render for a virtualized list — `end` is exclusive. */
export function computeVisibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  totalCount: number,
  overscan: number
): VisibleRange {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const end = Math.min(totalCount, start + visibleCount)
  return { start, end }
}
