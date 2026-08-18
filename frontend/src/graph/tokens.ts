// Graph design tokens — the JS-side companion to tokens.css. Every colour
// here is a `var(--...)` reference into the CSS custom properties scoped to
// `.graph-root`, never a raw hex/rgb literal — the one exception is
// BADGE_TEXT_COLOR (plain white text on a coloured chip; not the same
// concept as --bg-primary despite sharing a value, and not named as its own
// custom property in the spec this file was built from). This file, and
// tokens.css, are the ONE place scripts/check-graph-tokens.mjs allows a hex
// colour, an rgb()/rgba() literal, or a raw px font-size to appear anywhere
// under src/graph/, src/components/graph/, or src/pages/GraphNext.tsx.
//
// No letter-spacing anywhere in the type scale below — deliberate, per
// spec ("No letter-spacing adjustments anywhere"), unlike the old dark
// graph's mono-uppercase-tracked headers.

export const BG_PRIMARY = 'var(--bg-primary)'
export const BG_SECONDARY = 'var(--bg-secondary)'
export const BG_TERTIARY = 'var(--bg-tertiary)'

export const BORDER_LIGHT = 'var(--border-light)'
export const BORDER_MEDIUM = 'var(--border-medium)'

export const TEXT_PRIMARY = 'var(--text-primary)'
export const TEXT_SECONDARY = 'var(--text-secondary)'
export const TEXT_TERTIARY = 'var(--text-tertiary)'

export const ACCENT_BLUE = 'var(--accent-blue)' // root nodes, active states
export const ACCENT_CYAN = 'var(--accent-cyan)' // parent nodes, connections
export const ACCENT_GREEN = 'var(--accent-green)' // READY
export const ACCENT_AMBER = 'var(--accent-amber)' // WATCH
export const ACCENT_ORANGE = 'var(--accent-orange)' // IMPAIRED, anomalies
export const ACCENT_RED = 'var(--accent-red)' // REQUIRES DESCENT, critical
export const ACCENT_PURPLE = 'var(--accent-purple)' // strata layers, cross-connections, terrain elevation

// -- 8.13.2: UNKNOWN-status cell fill + Strata-only tokens --------------
export const CELL_VESICLE = 'var(--cell-vesicle)' // UNKNOWN status (no prediction on record)
export const STRATA_BOUNDARY = 'var(--strata-boundary)'
export const STRATA_BOUNDARY_HOVER = 'var(--strata-boundary-hover)'
export const STRATA_TINT_SELECT = 'var(--strata-tint-select)'
export const STRATA_TINT_STRESS = 'var(--strata-tint-stress)'
// Same tokens the Strata layout spec calls --border-default/--border-strong
// — no repo-wide rename of BORDER_LIGHT/BORDER_MEDIUM (used across every
// other graph component) for a naming-only difference with an identical
// underlying value; Strata code below reuses BORDER_LIGHT/BORDER_MEDIUM
// directly rather than introducing a second alias pointing at the same var.

export const SHADOW_SOFT = 'var(--shadow-soft)'
export const SHADOW_MEDIUM = 'var(--shadow-medium)'
/** SVG shapes don't take box-shadow — these are the same two elevations as a `filter: drop-shadow(...)` value, for cells that need to sit visually above what's behind them (8.13-V.2: "so cells sit above the bands rather than in them"). */
export const SHADOW_SOFT_FILTER = 'var(--shadow-soft-filter)'
export const SHADOW_MEDIUM_FILTER = 'var(--shadow-medium-filter)'

// -- 8.13.5 RESPONSIVE: mobile full-screen panel modal ---------------------
export const OVERLAY_BACKDROP = 'var(--overlay-backdrop)'
export const MODAL_CLOSE_FONT_SIZE = 'var(--modal-close-font-size)'

/** Badge text is plain white on a coloured chip — not the same concept as --bg-primary despite the shared value, so it isn't aliased to it. */
export const BADGE_TEXT_COLOR = '#ffffff'

// -- 8.7: raw hex companions, SMIL-only ------------------------------------
// The spawn animation's bud (graph/nodeVisuals.ts's resolvedHexColorFor)
// needs its <animate fill> to interpolate smoothly from the parent's
// colour to the child's own — SMIL cannot blend a `var(--...)` custom
// property the way it blends a literal colour, so this is a second,
// disclosed exception to "always var(), never a literal" alongside
// BADGE_TEXT_COLOR above. Each value mirrors its var() counterpart in
// tokens.css exactly — kept in sync by hand, the same way BADGE_TEXT_COLOR
// already mirrors --bg-primary's value without being aliased to it. Never
// used for a static fill/stroke; only ever an <animate> from/to endpoint.
export const ACCENT_BLUE_HEX = '#2563eb'
export const ACCENT_CYAN_HEX = '#00bcd4'
export const ACCENT_GREEN_HEX = '#10b981'
export const ACCENT_AMBER_HEX = '#f59e0b'
export const ACCENT_ORANGE_HEX = '#f97316'
export const ACCENT_RED_HEX = '#ef4444'
export const TEXT_TERTIARY_HEX = '#9ca3af'

// 8.13.2: Strata's cool-to-warm layer-fill ramp anchors — interpolated
// numerically (never a raw hex literal outside this file) by
// graph/strataVisuals.ts to produce N runtime-registered
// `--strata-layer-<i>` custom properties for however many layers the real
// route actually generates. A five-layer expedition samples these five
// anchors exactly; any other count resamples the same ramp at its own
// normalised positions — never a second, hardcoded five-colour list.
export const STRATA_RAMP_HEX: readonly string[] = ['#eff6ff', '#ecfeff', '#f0fdf4', '#fffbeb', '#fef2f2']

// 8.13-V.1: the SAME five-hue sequence (blue -> cyan -> green -> amber ->
// red) at full saturation instead of a -50 pastel — reusing the hex
// companions already declared above rather than inventing a second set of
// literals. This is what "the layer's own accent" (camp anchors, the band's
// gradient tint before it's blended toward white) samples; STRATA_RAMP_HEX
// itself is untouched and still backs every OTHER pastel consumer
// (minimap swatches, the legend).
export const STRATA_RAMP_SATURATED_HEX: readonly string[] = [ACCENT_BLUE_HEX, ACCENT_CYAN_HEX, ACCENT_GREEN_HEX, ACCENT_AMBER_HEX, ACCENT_RED_HEX]

// -- THE READINESS SCALE — the only status vocabulary allowed anywhere in
// the UI. Never a fifth, never abbreviated. Typed as a literal union so a
// mistyped/invented status is a compile error, not a runtime surprise. --
export type ReadinessStatus = 'READY' | 'WATCH' | 'IMPAIRED' | 'REQUIRES DESCENT'

export const READINESS_COLOR: Record<ReadinessStatus, string> = {
  READY: ACCENT_GREEN,
  WATCH: ACCENT_AMBER,
  IMPAIRED: ACCENT_ORANGE,
  'REQUIRES DESCENT': ACCENT_RED,
}

// -- type scale ----------------------------------------------------------

export const FONT_FAMILY = "'Inter', 'Roboto', sans-serif"

export interface TypeStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
}

function type(fontSize: number, fontWeight: number, color: string): TypeStyle {
  return { fontFamily: FONT_FAMILY, fontSize, fontWeight, color }
}

export const TYPE_NODE_LABEL = type(11, 500, TEXT_PRIMARY)
export const TYPE_PANEL_HEADING = type(18, 600, TEXT_PRIMARY)
export const TYPE_PANEL_SUBHEADING = type(14, 500, TEXT_SECONDARY)
export const TYPE_PROPERTY_LABEL = type(12, 400, TEXT_TERTIARY)
export const TYPE_PROPERTY_VALUE = type(13, 400, TEXT_PRIMARY)
export const TYPE_BADGE = type(10, 600, BADGE_TEXT_COLOR)
export const TYPE_TIMESTAMP = type(11, 400, TEXT_TERTIARY)
export const TYPE_RESET_VIEW = type(10, 400, TEXT_TERTIARY)

// -- 8.11: the 380px detail panel's own type needs beyond the above --------
export const TYPE_IDENTITY_NAME = type(16, 700, TEXT_PRIMARY)
export const TYPE_SECTION_LABEL = type(11, 600, TEXT_TERTIARY)
export const TYPE_SUMMARY_BODY = type(13, 400, TEXT_SECONDARY)
export const TYPE_PILL = type(11, 500, TEXT_PRIMARY)
export const TYPE_BUTTON = type(12, 500, TEXT_PRIMARY)

// -- 8.13-ui: redesigned top bar / left panel type needs --------------------
export const TYPE_LOGO = type(17, 700, TEXT_PRIMARY)
export const TYPE_BREADCRUMB = type(13, 500, TEXT_PRIMARY)
export const TYPE_TAB_LABEL = type(12, 600, TEXT_TERTIARY)
export const TYPE_STAT_LABEL = type(9, 500, TEXT_TERTIARY)
export const TYPE_STAT_VALUE = type(13, 600, TEXT_PRIMARY)
export const TYPE_BODY_ROW = type(12, 400, TEXT_SECONDARY)
export const TYPE_MONOSPACE = type(11, 400, TEXT_SECONDARY)

// -- 8.13-V.1: the altitude gutter's own three text sizes --------------
export const TYPE_GUTTER_TICK = type(10, 500, TEXT_TERTIARY)
export const TYPE_ANCHOR_NAME = type(12, 600, TEXT_PRIMARY)
export const TYPE_ANCHOR_RANGE = type(10, 400, TEXT_TERTIARY)

// -- shape -----------------------------------------------------------------

export const RADIUS_PANEL = 8
export const RADIUS_CARD = 6
export const RADIUS_BADGE = 12 // pill
export const RADIUS_BUTTON = 4

// -- spacing — 8px base grid, every margin/padding a multiple of 8 --------
// (panel internal padding is the one named exception the spec itself
// states as an exact value — 20, not a multiple of 8 — so it's kept
// literal here rather than silently rounded to fit the grid rule.)

export const SPACE_8 = 8
export const SPACE_16 = 16
export const SPACE_24 = 24
export const SPACE_32 = 32

export const PANEL_INTERNAL_PADDING = 20
export const PANEL_SECTION_GAP = SPACE_16

// -- node sizing -------------------------------------------------------

export const NODE_DIAMETER_ROOT = 24
export const NODE_DIAMETER_PARENT = 18
export const NODE_DIAMETER_CHILD = 14
export const NODE_DIAMETER_LEAF = 8 // diamond, not a circle

// -- edges -----------------------------------------------------------------

// 2.5/3 per the redesign spec's own spindle numbers (primary spindle rest
// width / "Selected: Thick (3px)") — was 1.5/2.5.
export const EDGE_STROKE_DEFAULT = 2.5
export const EDGE_STROKE_HOVER = 2.5
export const EDGE_STROKE_SELECTED = 3

// -- entity kinds — the legend and (later) the real node rendering share
// this ONE mapping, so a kind's colour can never drift between the two. --
export type EntityKind = 'country' | 'route' | 'camp' | 'climber' | 'source'

export const ENTITY_KIND_COLOR: Record<EntityKind, string> = {
  country: ACCENT_BLUE, // root
  route: ACCENT_CYAN, // parent
  camp: ACCENT_CYAN, // parent (the Operator tier's on-mountain display name)
  climber: TEXT_SECONDARY, // child — no accent assigned; carries its own readiness colour instead
  source: TEXT_TERTIARY, // leaf — dimmest neutral
}

export const ANOMALY_COLOR = ACCENT_ORANGE

export type EdgeKind = 'parent-child' | 'sibling' | 'cross-connection'

export const EDGE_KIND_COLOR: Record<EdgeKind, string> = {
  'parent-child': ACCENT_CYAN, // "parent nodes, connections" — the same token covers both
  sibling: TEXT_SECONDARY,
  'cross-connection': ACCENT_PURPLE,
}

// -- frame layout ------------------------------------------------------
// 48/420 per the UI redesign spec (2026-08) — was 56/380.

export const TOP_BAR_HEIGHT_PX = 48
export const LEFT_PANEL_WIDTH_PX = 420
export const SEARCH_INPUT_WIDTH_PX = 280

// -- 8.13-ui: mitosis interaction-state numbers, per the redesign spec's
// own interaction-states table. Rendering constants only — the hover/
// select/search/filter LOGIC that decides what's hovered/selected/matched
// (graph/interactionState.ts, graph/searchAndFilter.ts) is untouched; only
// how those states are drawn changes here.
export const CELL_HOVER_SCALE = 1.05
export const CELL_SELECTED_SCALE = 1.08
export const CELL_CHILDREN_PUSH_PX = 10
export const SPINDLE_OPACITY_REST = 0.4
export const SPINDLE_OPACITY_HOVER = 0.8
export const SPINDLE_OPACITY_SELECTED = 1
export const GRANDCHILD_FADE_OPACITY = 0.3
export const DESELECTED_PARENT_DIM_OPACITY = 0.3
/** Selected-cell glow filter's feGaussianBlur stdDeviation, per the spec's own `<filter id="glow">`. */
export const GLOW_BLUR_STD_DEVIATION = 4
/** Vesicle (leaf/source) nodes are "hidden, tooltip only" at rest per the spec's C2 row — dimmed rather than removed (still reachable/searchable), full opacity the moment they're hovered, connected-to-hover, or selected. */
export const VESICLE_REST_OPACITY = 0.25
