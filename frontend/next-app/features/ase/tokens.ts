// The one design-system token file (S1c). No component may hardcode a
// colour, size, or spacing value — every visual constant used anywhere in
// the Control Room comes from here, so nothing can drift from it silently.
// A component that needs a magnitude this file doesn't already name adds a
// new export here, it never inlines the number.

// -- surface --------------------------------------------------------------

export const CANVAS = '#0A0B0D'
export const PANEL = '#101216'
export const PANEL_RAISED = '#161920'
export const HAIRLINE = '#1E2229'
export const OVERLAY = 'rgba(10,11,13,0.72)'

// -- text -------------------------------------------------------------------

export const TEXT_PRIMARY = '#E8EBF0'
export const TEXT_SECONDARY = '#8B93A1'
export const TEXT_DIM = '#565E6B'

// -- meaning ------------------------------------------------------------
// These five carry all state in the Control Room. Nothing else is coloured.

export const NOMINAL = '#4C8DFF'
export const WATCH = '#E8A33D'
export const ANOMALY = '#F0483E'
export const VERIFIED = '#FFFFFF'
export const HUMAN = '#A78BFA' // anything a person asserted or corrected

// -- type ---------------------------------------------------------------
// Three sizes, two families, no exceptions. Font family itself is applied
// via Tailwind's `font-mono`/default-sans utilities at the call site (family
// isn't a colour/size/spacing value); size, weight, and tracking come from
// here. Monospace is reserved for measured values inside a Metric, IDs,
// timestamps, and code — prose in monospace is what made the old build read
// as a terminal.

export const TYPE_DISPLAY = { fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' } as const // headline numerals only
export const TYPE_BODY = { fontSize: 14, fontWeight: 400, letterSpacing: 'normal' } as const // all prose, labels, table cells
export const TYPE_CAPTION = { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em' } as const // uppercase section labels

// -- spacing ------------------------------------------------------------
// A 4px scale. These six values only.

export const SPACE_8 = 8
export const SPACE_12 = 12
export const SPACE_16 = 16
export const SPACE_24 = 24
export const SPACE_32 = 32
export const SPACE_48 = 48

export const ROW_HEIGHT_DEFAULT = 40
export const ROW_HEIGHT_COMPACT = 32
export const PAGE_GUTTER = 24
export const PANEL_PADDING = 16

// -- radius / border ------------------------------------------------------

export const RADIUS_INTERACTIVE = 4 // interactive elements only
export const RADIUS_STATIC = 0 // tables and panels
export const BORDER_WIDTH = 1 // the only border width; no shadows, no gradients, no glassmorphism

// -- focus ------------------------------------------------------------------
// "The Control Room must be fully operable without a mouse" (S1d) — the ring
// is never optional, so its magnitude is centralised like everything else.

export const FOCUS_RING_WIDTH = 2
export const FOCUS_RING_OFFSET = 2

// -- motion -----------------------------------------------------------------
// Nothing outside these three animates. Every consumer must gate on
// `prefers-reduced-motion` (see index.css's Control Room motion block).

export const MOTION_VALUE_FADE_MS = 200 // cross-fade on value change — no digit roll, ever (S9.1h)
export const MOTION_VALUE_FLASH_MS = 240 // S9.1h: 400ms→240ms, AND only fires on a threshold crossing now — see ase/Metric.tsx
export const MOTION_PANEL_MS = 240 // S9.1h: panel open/close, ease-out — exits along the same path it entered (200-300ms band)
export const MOTION_DEPENDENCY_DIM_MS = 100 // S9.1h: 120ms→100ms — hover feedback must feel causal, not animated
export const MOTION_DEPENDENCY_RESTORE_MS = 60 // S9.1h: 80ms→60ms
export const DEPENDENCY_DIM_OPACITY = 0.12
// S9.1h: the as-of scrubber's commit debounce moved from a 120ms timer to
// a single rAF (never a timer, per the spec) — no duration token needed.
export const MOTION_PRESS_MS = 120 // S9.1h: 80ms→120ms — within the spec's 100-160ms press-feedback band
export const PRESS_SCALE = 0.97 // S9.1h: 0.96→0.97
// selection has no transition — it is instant, on purpose.

// -- component-specific magnitudes -----------------------------------------
// Not part of the base spacing scale, but still centralised here rather than
// inlined at the call site, per this file's own rule.

export const TOOLTIP_MAX_WIDTH_PX = 320
export const BADGE_PADDING_V = 2 // S9.5b: the identity record's serial chip and status badges (SEALED, ACCESS LOGGED)
export const MEANING_HELP_TEXT_MAX_WIDTH_PX = 480 // S9.7: ADD A RULE's helper paragraph
export const MEANING_INPUT_MAX_WIDTH_PX = 320 // S9.7: ADD A RULE's meaning text input

// The navigation shell (S1d) — one bar, one inspector, nothing else has its
// own chrome, so these live here rather than being treated as a second
// spacing system.
export const BAR_HEIGHT = 48
export const TAB_GAP = 20
export const ACCENT_INDICATOR_WIDTH = 2 // the one deliberate exception to BORDER_WIDTH: the active-tab underline and a selected EvidenceTable row's left border, not a border
export const STATUS_DOT_SIZE = 6 // the Live pill's dot — distinct from a per-metric live indicator's 2px breathing dot, not yet built
export const SELECTION_DOT_SIZE = 8 // the Inspector header's state dot
export const INSPECTOR_WIDTH = 360
export const INSPECTOR_RAIL_WIDTH = 40 // collapsed width
export const ICON_SIZE_SM = 14 // the inspector's collapse chevron

// The shared row components (S1e).
export const CONFIDENCE_FLOOR_DEFAULT = 0.72 // EvidenceTable's watch threshold and FilterBar's "below confidence floor" chip
export const ACTIVITY_LANE_HEIGHT = 32
export const ACTIVITY_LANE_EXPANDED_MAX_HEIGHT = 240
export const COMMAND_PALETTE_WIDTH = 560
export const COMMAND_PALETTE_MAX_HEIGHT = 420
export const COMMAND_PALETTE_TOP_OFFSET_VH = 15

// Overview's evidence strip (S1f) — hand-rolled SVG, ~140px.
export const EVIDENCE_STRIP_HEIGHT = 140
export const FLOW_LINE_MIN_WIDTH = 1
export const FLOW_LINE_MAX_WIDTH = 6
export const SOURCE_CHIP_WIDTH = 260
export const SOURCE_CHIP_NAME_MAX_WIDTH = 110
export const OUTPUT_ZONE_WIDTH = 180 // WHAT YOU GET's reserved width on the right of the strip

// Processing's flow diagram (S1f) — three left-aligned bands of stage boxes.
export const STAGE_BOX_MIN_WIDTH = 230
export const STAGE_BOX_HEIGHT = 84
export const FLOW_CURVE_HEADROOM = 56 // vertical clear space below the diagram for the stage-12→9 curve and its label
export const BAND_HEADER_HEIGHT = 40 // title + subtitle above each row of stage boxes
export const FILTER_SEARCH_WIDTH = 160

// The as-of scrubber (S3) — a popover anchored under the Now control.
export const SCRUBBER_WIDTH = 400
export const SCRUBBER_TRACK_MARGIN = 8 // horizontal inset so end-of-track marks aren't clipped
export const SCRUBBER_MARK_SIZE = 6

// The custom direct-manipulation slider (S9.1h) — Detection/Tuning's
// threshold and Identity/Method's weights, both built on the same
// component rather than a native `<input type="range">`.
export const SLIDER_TRACK_HEIGHT = 4
export const SLIDER_HANDLE_SIZE = 18
export const SLIDER_RUBBER_BAND_PX = 24 // how far past an edge the handle can still be pulled, at maximum resistance

// Stacking order for the shell's floating layers — centralised because
// S1e adds two more of them (the palette, the activity lane's expanded
// history) that all have to agree on who sits on top of whom.
export const Z_TOOLTIP = 50
export const Z_ACTIVITY_LANE = 60
export const Z_SCRUBBER = 90
export const Z_COMMAND_PALETTE = 100

// -- Detection Map (S9.9) — node-graph canvas -----------------------------
// Header colour by KIND (structural identity, never status — status is the
// ring/wire colour, drawn from the five meaning colours above instead).

export const MAP_HEADER_COUNTRY = '#B5642E'
export const MAP_HEADER_ROUTE = '#6D4FA8'
export const MAP_HEADER_OPERATOR = '#2C6EA8'
export const MAP_HEADER_CLIMBER = '#2C7A55'
export const MAP_HEADER_SENSOR = '#237F86'
export const MAP_HEADER_RULE = '#3A404E'
export const MAP_GRID_LINE = '#14171C'
export const MAP_GRID_LINE_HEAVY = '#1B1F26'
