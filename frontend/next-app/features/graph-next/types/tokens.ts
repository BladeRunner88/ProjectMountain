// S8.5's own token file — every raw colour the NETWORK view uses lives
// here, the same "nowhere else inlines a hex value" discipline the Control
// Room's ase/tokens.ts already holds the rest of the product to.

export const GRAPH_BLACK = "#000000"

/**
 * A country's branch hue, derived from its own name.
 *
 * This was a fixed five-entry map keyed on the countries an invented world
 * happened to contain. The warehouse decides which countries exist, so a fixed
 * map cannot keep up: once the world changed, every country missed the lookup,
 * fell through to grey, and the entire colour-by-branch system rendered one
 * flat colour without anything failing.
 *
 * Deriving the hue from the name means any country the backend reports gets a
 * stable colour, identical across reloads, processes and machines.
 *
 * Green is excluded on purpose — it is reserved ENTIRELY for history links, and
 * a country branch sharing it would have a viewer reading "history" into an
 * ordinary node.
 */

/** Hues reserved for other meanings, and the width of the arc kept clear of each. */
const RESERVED_HUES = [
  { hue: 145, halfWidth: 25 }, // HISTORY_GREEN
  { hue: 3, halfWidth: 18 }, // ANOMALY_RED
]

/** FNV-1a: tiny, dependency-free, and stable across every JS engine. */
function hashName(name: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** Shortest distance between two hues on the colour circle, in degrees. */
function hueDistance(a: number, b: number): number {
  const direct = Math.abs(a - b)
  return Math.min(direct, 360 - direct)
}

/** True when `hue` sits inside an arc that means something else. */
function isReserved(hue: number): boolean {
  return RESERVED_HUES.some(
    ({ hue: centre, halfWidth }) => hueDistance(hue, centre) <= halfWidth
  )
}

export function countryHue(country: string): number {
  const hue = hashName(country) % 360
  if (!isReserved(hue)) return hue
  // Rotate off a reserved arc by a fixed amount rather than rehashing, so the
  // result stays a pure function of the name.
  return (hue + 60) % 360
}

export const ANOMALY_RED = "#F0483E"

/** S8.4b: environment nodes' own fixed colour — never derived from country hue. Red (ANOMALY_RED) on breach. */
export const ENVIRONMENT_TEAL = "#35C8D8"

/** S8.4b: "the only green elements in the entire graph." Never reused anywhere else, including Switzerland's own branch colour above. */
export const HISTORY_GREEN = "#45D89A"

/** S8.7: TERRAIN's "watch" tier — a machine still nominal but carrying at least one of their own alert-flagged records. Between white (nominal) and red (anomaly); never used by NETWORK/STRATA, which have no third status tier. */
export const WATCH_AMBER = "#E0A542"

/** S8.7: TERRAIN's nominal-machine marker colour, and the selection-ring stroke — the one place pure white is a deliberate colour choice rather than a token gap. */
export const MACHINE_WHITE = "#FFFFFF"

/** For a node with no country at all — not for a country whose name is simply unknown, since `countryHue` handles every name. */
export const UNKNOWN_BRANCH_GREY = "#888888"

/** S8.5: "a very faint radial vignette brightening toward the core is acceptable and helps the density read" — no grid, nothing else behind the graph. */
export const CORE_VIGNETTE =
  "radial-gradient(circle at center, rgba(255,255,255,0.05), rgba(0,0,0,0) 55%)"

/** S8.6: the anomaly gutter's own empty track, behind its red fill. */
export const GUTTER_TRACK = "rgba(255,255,255,0.06)"
