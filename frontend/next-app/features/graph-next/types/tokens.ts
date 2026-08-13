// S8.5's own token file — every raw colour the NETWORK view uses lives
// here, the same "nowhere else inlines a hex value" discipline the Control
// Room's ase/tokens.ts already holds the rest of the product to.

export const GRAPH_BLACK = '#000000'

/**
 * Keyed by the exact country name strings ase/dataset.ts's REGIONS uses.
 * S8.4b moves Switzerland from green (#45D89A) to green-blue (#45B8D8) —
 * green is now reserved ENTIRELY for history links; a country branch could
 * never share it without a viewer reading "history" into an ordinary node.
 */
export const COUNTRY_COLOR: Record<string, string> = {
  Nepal: '#3FD0E8',
  Pakistan: '#A05BE8',
  'China (Tibet)': '#E0479C',
  'United States': '#4C8DFF',
  Switzerland: '#45B8D8',
}

export const ANOMALY_RED = '#F0483E'

/** S8.4b: environment nodes' own fixed colour — never derived from country hue. Red (ANOMALY_RED) on breach. */
export const ENVIRONMENT_TEAL = '#35C8D8'

/** S8.4b: "the only green elements in the entire graph." Never reused anywhere else, including Switzerland's own branch colour above. */
export const HISTORY_GREEN = '#45D89A'

/** S8.7: TERRAIN's "watch" tier — a climber still nominal but carrying at least one of their own alert-flagged records. Between white (nominal) and red (anomaly); never used by NETWORK/STRATA, which have no third status tier. */
export const WATCH_AMBER = '#E0A542'

/** S8.7: TERRAIN's nominal-climber marker colour, and the selection-ring stroke — the one place pure white is a deliberate colour choice rather than a token gap. */
export const CLIMBER_WHITE = '#FFFFFF'

/** Defensive fallback only — every real country in the dataset always has a COUNTRY_COLOR entry; this is what an unmatched lookup falls back to rather than crashing. */
export const UNKNOWN_BRANCH_GREY = '#888888'

/** S8.5: "a very faint radial vignette brightening toward the core is acceptable and helps the density read" — no grid, nothing else behind the graph. */
export const CORE_VIGNETTE = 'radial-gradient(circle at center, rgba(255,255,255,0.05), rgba(0,0,0,0) 55%)'

/** S8.6: the anomaly gutter's own empty track, behind its red fill. */
export const GUTTER_TRACK = 'rgba(255,255,255,0.06)'
