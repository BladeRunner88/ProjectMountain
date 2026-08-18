export type ViewMode = 'network' | 'strata' | 'terrain'

export type FilterKind = 'all' | 'anomalies' | 'watch' | 'by-tier' | 'by-country'

/** 8.13.3: Strata's own left-panel filter — "ONE filter system, in the left panel," but the values are status-based (matching the cell-forms vocabulary) rather than Network's topology-based FilterKind above, so it's its own type, not a reuse of FilterKind. */
export type StrataStatusFilter = 'all' | 'READY' | 'WATCH' | 'IMPAIRED' | 'REQUIRES_DESCENT' | 'UNKNOWN'

/** 8.13.5 RESPONSIVE: the layout spec fixes the left panel at 420px and never says what happens when the window can't afford it — this is that ruling, applied identically across all three views (Network/Strata/Terrain), not a Strata-only concern.
 *  full    >1280px    420px panel, canvas flex:1, 140px timeline
 *  compact 1024-1280  panel still 420px, timeline collapses to its 40px tab by default
 *  sheet   768-1024   panel becomes a bottom sheet at 60% height (swipe up to expand); canvas full width; legend + minimap hidden
 *  mobile  <768       single column; canvas above; panel as a full-screen modal, shown only when something is selected */
export type PageLayoutMode = 'full' | 'compact' | 'sheet' | 'mobile'

export function pageLayoutModeForWidth(widthPx: number): PageLayoutMode {
  if (widthPx > 1280) return 'full'
  if (widthPx >= 1024) return 'compact'
  if (widthPx >= 768) return 'sheet'
  return 'mobile'
}
