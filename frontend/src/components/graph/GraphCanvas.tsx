// 8.6: STATIC RENDERING — draws nodes/edges at their already-settled (8.5)
// positions. 8.7: SPAWN ANIMATION — the 4-phase "cell division" sequence.
//
// 8.8: STRUCTURAL FIX + LIVE DATA. 8.7 drove every animation's `begin`
// attribute from a render-computed `"Xms"` string. That's fragile: React
// only skips re-writing an attribute when the new value is IDENTICAL to
// the old one, and once a live-tick-triggered re-render (ase/store.tsx's
// real 5s interval) produces a fresh `nodes`/`positions` array, nothing
// guarantees those strings stay byte-identical forever — and if a
// `begin` attribute is ever rewritten on an already-fired/frozen SMIL
// animation, browsers are free to re-evaluate its instance times, which
// can un-freeze it. That is the exact bug this block's own report
// describes: "the spawn animation completed, a re-render occurred, and
// the component restarted from progress 0."
//
// THE FIX, structurally, not defensively:
//   1. No animation element's `begin` is EVER a render-computed value
//      again. Every phase-driving animation uses `begin="indefinite"` (a
//      CONSTANT string — React never touches it after first paint) and is
//      started with exactly ONE imperative `beginElement()` call, scheduled
//      from graph/spawnController.ts's module-level registry — never React
//      state. Every phase AFTER that first one is chained by SYNCBASE
//      reference (`begin="otherElementId.end"` / `"otherElementId.begin+
//      200ms"`) — also a constant string, also immune to re-renders — so
//      one JS trigger cascades the entire 4-phase sequence natively.
//   2. Completion is terminal per node id in that same module-level
//      registry (spawnController.ts's `markSpawnSettled`), which survives
//      any number of re-renders AND a full GraphCanvas unmount/remount
//      (switching to Strata and back) — checked fresh on every render, not
//      cached in a way that could go stale.
//   3. Every node's BASE (non-animated) attribute values are the CORRECT,
//      FINAL, static form — full size, right colour, right position —
//      always, unconditionally. The animation is a TEMPORARY OVERRIDE that
//      SMIL applies on top for the brief window it's active, then freezes
//      at values that already match the base. If the scheduling loop never
//      runs at all (killed, or a fresh reload with it disabled), every
//      animate element simply never activates and the base values are ALL
//      that ever renders — already correct, nothing further required.
//   4. React StrictMode double-invokes effects on mount (mount, cleanup,
//      mount again) but never recreates the underlying DOM for a plain
//      render commit — spawnController.tryStartSpawning(id) guards on the
//      node id itself (module-level), so the second invocation is always a
//      no-op, regardless of how many times the effect runs.
//
// LIVE DATA reuses the same "imperative, one-shot, ref-targeted" shape for
// everything a touched/added/changed/removed node needs — see the
// liveEvents effect below. None of it is SMIL (those effects need
// runtime-decided endpoints — e.g. "the OLD colour, whatever it was" — that
// a declarative animate element's static `values` attribute can't express
// without exactly the same re-render fragility being fixed here); they use
// the Web Animations API instead, imperative by construction.

import { cloneElement, forwardRef, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState, type ReactElement } from 'react'
import type { GraphEdge, GraphNode, GraphNodeStatus } from '../../graph/adapter'
import { crossCurve, parentChildCurve, quadraticSvgPath, siblingCurve } from '../../graph/edgeGeometry'
import { buildAdjacency, computeAncestorChain, computeMutualConnections, computeTierOrder, type HighlightSet } from '../../graph/interactionState'
import { computeVisibleLabels, type LabelCandidate } from '../../graph/labelCollision'
import { idleDriftOffset, RADIUS_BY_TIER, type Point } from '../../graph/layout'
import type { LiveGraphEvent } from '../../graph/liveGraphState'
import { baseColorFor, computeStatusRollup, isCritical, organelleOffsets, PARENT_COLOR, resolvedHexColorFor, ROOT_BASE_COLOR, STATUS_COLOR, truncateLabel } from '../../graph/nodeVisuals'
import { ZoomControls } from './ZoomControls'
import {
  computeFilterMatchIds,
  computeSearchMatchIds,
  edgeMatchesFilter,
  firstSearchMatch,
  pushedAlongAxis,
  pushedPosition,
  resolveFilterReferenceId,
} from '../../graph/searchAndFilter'
import { anySpawnInProgress, ensureSpawnPending, isSpawnSettled, markSpawnSettled, settleAllSpawning, tryStartSpawning } from '../../graph/spawnController'
import { computeSpawnSchedule, PHASE_BUD_END_MS, PHASE_PULSE_END_MS, PHASE_SETTLE_END_MS, PHASE_SPLIT_END_MS, type SpawnTiming } from '../../graph/spawnSchedule'
import type { FilterKind } from '../../graph/types'
import {
  ACCENT_BLUE,
  ACCENT_CYAN,
  ACCENT_PURPLE,
  BADGE_TEXT_COLOR,
  BG_SECONDARY,
  BORDER_MEDIUM,
  CELL_CHILDREN_PUSH_PX,
  CELL_HOVER_SCALE,
  CELL_SELECTED_SCALE,
  EDGE_STROKE_DEFAULT,
  EDGE_STROKE_HOVER,
  EDGE_STROKE_SELECTED,
  GLOW_BLUR_STD_DEVIATION,
  NODE_DIAMETER_LEAF,
  RADIUS_BUTTON,
  RADIUS_CARD,
  SPACE_16,
  SPACE_8,
  TEXT_PRIMARY,
  TYPE_RESET_VIEW,
  VESICLE_REST_OPACITY,
} from '../../graph/tokens'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_TO_NODE_LEVEL = 2
const ZOOM_ANIMATION_MS = 400
const ZOOM_LABEL_THRESHOLD = 1.2
// 8.9: the threshold class toggle used to flip on every wheel/pinch event
// that crossed 1.2x — fine for a single deliberate zoom, but hovering
// right at the boundary (a slow wheel scroll, a jittery pinch) could flip
// it back and forth every event. Debounced so a crossing only commits
// once the zoom level has actually held past it for a beat, with zero
// React re-render or layout cost either way — still a plain class toggle.
const LABEL_THRESHOLD_DEBOUNCE_MS = 120
const MINIMAP_WIDTH_PX = 150
const MINIMAP_PADDING_FRACTION = 0.08 // fit-to-view breathing room, both the main canvas fit and the minimap's own bbox framing
const BADGE_RADIUS_PX = 3
const LABEL_GAP_PX = 4
const ROOT_LABEL_FONT_PX = 11
const PARENT_LABEL_FONT_PX = 11
const CHILD_LABEL_FONT_PX = 10
const DEFAULT_PAN_ZOOM = { x: 0, y: 0, zoom: 1 }

// -- 8.10 interaction states -------------------------------------------
// 8.13-ui: hover/selected SCALE FACTORS now come from tokens.ts
// (CELL_HOVER_SCALE=1.05, CELL_SELECTED_SCALE=1.08, per the redesign
// spec's own interaction-state table) — was a local 1.3 hover-only
// constant. Timing/opacity constants below are unchanged.
const HOVER_TRANSITION = 'transform 150ms ease-out'
const OPACITY_TRANSITION = 'opacity 200ms ease-out'
const HOVER_DIM_OPACITY = 0.3
const SELECT_DIM_OPACITY = 0.2
const SELECTION_RING_WIDTH = 3
const SELECTION_RING_GAP = 4 // ring sits this far outside the node's own radius
const ROOT_PARENT_LABEL_HOVER_FONT_BUMP = 3

// -- 8.12 search/filter ---------------------------------------------------
const SEARCH_DIM_OPACITY = 0.2
const FILTER_DIM_OPACITY = 0.15
const FILTER_MATCH_SCALE = 1.2
const AUX_TRANSITION = 'opacity 300ms ease, filter 300ms ease'
const FILTER_SCALE_TRANSITION = 'transform 300ms ease'
const COUNTRY_PUSH_FACTOR = 1.6
const COUNTRY_PUSH_TRANSITION = 'transform 600ms ease'
const SEARCH_PULSE_DUR_MS = 900
// child label's own hover font-size bump lives as a CSS custom property
// (--child-label-hover-font-size in tokens.css) instead of a JS constant —
// interactions.css drives that enlarge purely via :hover, no React state
// needed since child labels live INSIDE the node they belong to.

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// -- spawn choreography durations (fixed constants — safe as literals; it's
// TIMING OFFSETS computed from render data that were the actual hazard) --
const EASE_OUT_SPLINE = '0 0 0.58 1'
const EASE_IN_OUT_SPLINE = '0.42 0 0.58 1'
const BUD_OVERSHOOT_KEYTIMES = '0;0.65;1'
const BUD_OVERSHOOT_SPLINES = '0.16 1 0.3 1;0.4 0 0.6 1'
const RING_GROWTH_FACTOR = 2.5
const BUD_PHASE2_SCALE = 0.6
const FLASH_OPACITY_PEAK = 0.7
const FADE_IN_DUR_MS = 300
const WOBBLE_DUR_MS = PHASE_SETTLE_END_MS - PHASE_SPLIT_END_MS
const ROOT_FADE_DUR_MS = 400
const LIVE_FLASH_DUR_MS = 350
const LIVE_COLOR_TRANSITION_DUR_MS = 400
const REMOVAL_SHRINK_DUR_MS = 500

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function badgeOffset(radius: number): Point {
  const d = radius * 0.75
  return { x: d, y: -d }
}

interface RenderEdge {
  edge: GraphEdge
  path: string
  a: Point
  b: Point
  sourceColor: string
  targetColor: string
  /** parent-kind only: the sanitized CHILD id, so the filament's animate elements can syncbase off that child's own bud-scale2 element. */
  targetSid: string
  /** cross/sibling: whichever of source/target has the LATER schedule start — a structural fact, not a live value, safe to bake into a syncbase reference. Null if either endpoint never animates (both already-settled roots/orphans, or the schedule doesn't cover them) — such an edge is just shown immediately. */
  laterSid: string | null
}

export interface GraphCanvasHandle {
  resetView: () => void
  /** 8.11: lets the detail panel's CONNECTIONS rows drive graph selection from outside the canvas — the same single-select `selectNode(id, false)` a real node click already performs internally. */
  selectNodeExternally: (nodeId: string) => void
  /** 8.11: lets the detail panel's own close (X) button clear graph selection the same way Escape/empty-canvas-click already do. */
  deselectAllExternally: () => void
}

export interface GraphCanvasProps {
  nodes: readonly GraphNode[]
  edges: readonly GraphEdge[]
  positions: ReadonlyMap<string, Point>
  liveEvents: readonly LiveGraphEvent[]
  removingIds: ReadonlySet<string>
  onViewChanged?: (isDefault: boolean) => void
  /** 8.10: fires whenever the selection changes — empty array on deselect, one entry for a single select, several for shift+click. The right panel (8.11) reads this to open/update/switch to comparison mode. */
  onSelectionChanged?: (selectedNodes: GraphNode[]) => void
  /** 8.12: matches name/serial/operator/route/origin — drives the pulse, the camera pan, and the dim of everything else. */
  searchQuery: string
  /** 8.12: All/Anomalies/Watch/By tier/By country. By-tier/by-country have no selector UI of their own, so their reference node is resolved from selection (first) or the first search match (second) — see searchAndFilter.ts. */
  activeFilter: FilterKind
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas({ nodes, edges, positions, liveEvents, removingIds, onViewChanged, onSelectionChanged, searchQuery, activeFilter }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<SVGGElement>(null)
  const panZoomRef = useRef({ ...DEFAULT_PAN_ZOOM })
  const draggingRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const isDefaultRef = useRef(true)

  // -- 8.9 navigation state — all imperative (refs), never React state per
  // frame/gesture, same discipline pan/zoom has followed since 8.6.
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchLastDistRef = useRef<number | null>(null)
  const zoomAnimRafRef = useRef<number | null>(null)
  const labelDebounceTimerRef = useRef<number | null>(null)
  const appliedZoomedInRef = useRef(false)
  const minimapRectRef = useRef<SVGRectElement | null>(null)

  const [reducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  // dev-only escape hatch for requirement 3's own verification ("disable
  // the loop and reload") — never present in a production build.
  const [loopDisabled] = useState(() => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('noSpawnLoop'))
  const animateSpawn = !reducedMotion && !loopDisabled

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const rollup = useMemo(() => computeStatusRollup(nodes), [nodes])
  const schedule = useMemo(() => computeSpawnSchedule(nodes), [nodes])
  const childrenOf = useMemo(() => {
    const map = new Map<string, GraphNode[]>()
    for (const n of nodes) {
      if (!n.parentId) continue
      const list = map.get(n.parentId) ?? []
      list.push(n)
      map.set(n.parentId, list)
    }
    return map
  }, [nodes])

  // -- 8.10 interaction state — plain React state, deliberately NOT refs.
  // Unlike pan/zoom (continuous, per-frame during a gesture, which is
  // exactly why THAT stays imperative) hover/select are discrete, one
  // state update per pointer enter/leave/click — ordinary UI state is the
  // right tool here, not an exception to the imperative-for-motion rule
  // the rest of this file follows.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(new Set())

  const adjacency = useMemo(() => buildAdjacency(edges), [edges])
  const tierRank = useMemo(() => {
    const ordered = computeTierOrder(nodes)
    return new Map(ordered.map((n, i) => [n.id, i + 1])) // 1-based: 0 means "not tabbable" territory for tabIndex semantics
  }, [nodes])

  // SELECT (single): ancestor trail, root down to the selection. MULTI-SELECT: only the selected nodes and edges directly between two of them — a different rule, not a union of ancestor trails.
  const highlight: HighlightSet | null = useMemo(() => {
    if (selectedNodeIds.size === 0) return null
    if (selectedNodeIds.size === 1) {
      const [id] = selectedNodeIds
      return computeAncestorChain(id, nodeById)
    }
    return computeMutualConnections(selectedNodeIds, edges)
  }, [selectedNodeIds, nodeById, edges])

  useEffect(() => {
    onSelectionChanged?.([...selectedNodeIds].map((id) => nodeById.get(id)).filter((n): n is GraphNode => !!n))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeIds, nodeById])

  function selectNode(nodeId: string, additive: boolean) {
    setSelectedNodeIds((prev) => {
      if (!additive) return new Set([nodeId])
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  function deselectAll() {
    setSelectedNodeIds((prev) => (prev.size === 0 ? prev : new Set()))
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    // A click that landed on a node never reaches here — NodeShape's own
    // onClick calls stopPropagation before it can bubble this far. Anything
    // else (empty space, an edge, a label) counts as "empty canvas."
    if (!(e.target as Element).closest?.('[data-node-id]')) deselectAll()
  }

  // 8.10 DESELECT: "Escape... Everything returns to full opacity." A
  // React onKeyDown on the container only ever catches events that
  // originate from WITHIN that container's own DOM subtree — a live check
  // found that a click made via dispatchEvent (needed to work around a
  // Playwright/SVG pointer-capture quirk already diagnosed in 8.9) doesn't
  // trigger the browser's native click-to-focus behaviour the way a real
  // click does, leaving focus on <body> — and Escape pressed there would
  // never bubble into the container at all. A REAL click DOES focus the
  // node (it has a real tabIndex), so this was latent rather than always
  // visible, but "click empty canvas, then Escape" or any focus loss
  // between select and Escape hits the same gap. A document-level listener
  // makes Escape work regardless of where focus currently is, matching
  // the spec's own "Escape, or click empty canvas" — both unconditional.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') deselectAll()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -- 8.8 THE SKIP CONTROL — a snapshot of ids in flight AT CLICK TIME, so
  // a node that arrives later via live data still gets its own real
  // animation rather than being silently suppressed forever by a past click.
  const skippedIdsRef = useRef<Set<string>>(new Set())
  const [skipTick, bumpSkipTick] = useReducer((x: number) => x + 1, 0)
  const [, bumpSettleTick] = useReducer((x: number) => x + 1, 0)

  function handleSkip() {
    for (const n of nodes) {
      if (!isSpawnSettled(n.id)) skippedIdsRef.current.add(n.id)
    }
    settleAllSpawning()
    bumpSkipTick()
  }

  // -- refs the scheduling effect below needs: each node's OWN entry-point
  // animate element (the thing beginElement() is actually called on), and
  // each node's own shape element (for the live-data WAAPI effects, which
  // target ANY node, not just ones that ever spawn-animated).
  const triggerRefs = useRef(new Map<string, SVGElement>())
  const shapeRefs = useRef(new Map<string, SVGElement>())
  const driftRefs = useRef(new Map<string, SVGGElement | null>())
  const controllerStartRef = useRef<number | null>(null)

  // -- 8.8 THE SCHEDULING EFFECT — the ONLY place beginElement() is ever
  // called. Runs whenever the node list changes (initial load, and again
  // whenever live data adds a node); tryStartSpawning's module-level guard
  // means any node already scheduled — from THIS mount, a PRIOR mount, or
  // a StrictMode phantom re-invoke — is always a cheap no-op here.
  useEffect(() => {
    if (loopDisabled) return
    if (controllerStartRef.current === null) controllerStartRef.current = performance.now()
    const controllerStart = controllerStartRef.current

    for (const n of nodes) {
      const timing = schedule.get(n.id)
      ensureSpawnPending(n.id)
      if (!tryStartSpawning(n.id)) continue

      const scheduledAtMs = controllerStart + (timing?.animated ? timing.startMs : 0)
      const delay = Math.max(0, scheduledAtMs - performance.now())
      const totalDurationMs = timing?.animated ? PHASE_SETTLE_END_MS : ROOT_FADE_DUR_MS

      window.setTimeout(() => {
        if (skippedIdsRef.current.has(n.id)) return // skipped before its own turn ever came up
        const el = triggerRefs.current.get(n.id)
        if (el instanceof SVGAnimateElement) el.beginElement()
      }, delay)
      window.setTimeout(() => {
        // The Skip control (settleAllSpawning) can mark this node settled
        // LONG before this, its own originally-scheduled timer, actually
        // fires — a live check found the resulting redundant
        // bumpSettleTick() calls (one per still-pending node, up to ~1.5s
        // of them trailing after a skip click) kept forcing GraphCanvas to
        // re-render for seconds afterward, which was interrupting any CSS
        // transition — e.g. hovering a node right after clicking skip
        // never reached its full 1.3x scale, caught by exactly that live
        // check. Once genuinely settled, there is nothing left to report.
        if (isSpawnSettled(n.id)) return
        markSpawnSettled(n.id)
        bumpSettleTick()
      }, delay + totalDurationMs)
    }
  }, [nodes, schedule, loopDisabled])

  // -- 8.8 LIVE DATA reactions — imperative, one-shot, Web-Animations-API
  // (not SMIL: these need a RUNTIME-DECIDED pair of endpoints — "flash from
  // whatever colour this node currently is," "transition from the OLD
  // status colour to the NEW one" — that a static declarative <animate>
  // values="..." attribute can't express without being rewritten by React
  // on every occurrence, which is precisely the fragility this block
  // exists to remove).
  useEffect(() => {
    for (const evt of liveEvents) {
      if (evt.kind === 'touched' || evt.kind === 'statusChanged') {
        const el = shapeRefs.current.get(evt.nodeId)
        if (!el) continue
        const flash = el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2.4)' }, { filter: 'brightness(1)' }], { duration: LIVE_FLASH_DUR_MS, easing: 'ease-out' })
        if (evt.kind === 'statusChanged') {
          const node = nodeById.get(evt.nodeId)
          if (node) {
            const fromHex = evt.fromStatus ? resolvedHexColorFor({ ...node, status: evt.fromStatus }) : resolvedHexColorFor({ ...node, status: null })
            const toHex = resolvedHexColorFor(node)
            flash.addEventListener('finish', () => {
              el.animate([{ fill: fromHex }, { fill: toHex }], { duration: LIVE_COLOR_TRANSITION_DUR_MS, easing: 'linear', fill: 'forwards' })
            })
          }
        }
      }
      if (evt.kind === 'removed') {
        const el = shapeRefs.current.get(evt.nodeId)
        if (el) el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0)' }], { duration: REMOVAL_SHRINK_DUR_MS, easing: 'ease-in', fill: 'forwards' })
        const edgePath = shapeRefs.current.get(`edge:${evt.nodeId}`)
        if (edgePath instanceof SVGPathElement) {
          const len = edgePath.getTotalLength()
          edgePath.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: len }], { duration: REMOVAL_SHRINK_DUR_MS, easing: 'ease-in', fill: 'forwards' })
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvents])

  // -- 8.12 SEARCH — name/serial/operator/route/origin, computed against
  // whatever `nodes` this render actually has (the live-render subset,
  // same set everything else here already works from).
  const searchMatchIds = useMemo(() => computeSearchMatchIds(nodes, searchQuery), [nodes, searchQuery])
  const isSearchActive = searchQuery.trim() !== ''

  // -- 8.12 FILTERS — by-tier/by-country have no selector of their own, so
  // their reference resolves from the current selection (first) or the
  // first search match (second); with neither, the pill is a structural
  // no-op (computeFilterMatchIds returns null, same as "All").
  const filterReferenceId = useMemo(
    () => resolveFilterReferenceId(activeFilter, selectedNodeIds, nodes, searchQuery),
    [activeFilter, selectedNodeIds, nodes, searchQuery],
  )
  const filterMatchIds = useMemo(() => computeFilterMatchIds(activeFilter, nodes, filterReferenceId), [activeFilter, nodes, filterReferenceId])
  const isFilterActive = filterMatchIds !== null
  const isCountryPushActive = activeFilter === 'by-country' && isFilterActive

  // duplicates graphBBox's own min/max walk (further below) rather than
  // depending on it, so this block doesn't have to be reordered ahead of
  // graphBBox's existing definition — cheap enough at this node count that
  // the small duplication isn't worth the reordering risk.
  const graphCenter = useMemo(() => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const pos = positions.get(n.id)
      if (!pos) continue
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x)
      maxY = Math.max(maxY, pos.y)
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0 }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  }, [nodes, positions])

  // "By country" rebalance: a NON-matching node's DISPLAY position is
  // pushed further from the graph's own centre along the direction it's
  // already sitting in — "the rest is pushed toward the edges rather than
  // hidden." A matching node (or every node when the filter isn't
  // by-country) keeps its real, unmodified position. This is a display-only
  // derived map — spawn/bud math elsewhere keeps reading the REAL
  // `positions` prop, never this one, so an in-progress spawn's bud
  // direction is unaffected by whatever this filter is doing.
  //
  // 8.13-ui: layered on top — "Selected: children push outward 10px along
  // the spindle axis" (the redesign spec's own interaction-state table).
  // Single-select only (spec doesn't define this for a multi-select); each
  // DIRECT child of the one selected node is pushed 10px further from that
  // parent's OWN display position (so it composes correctly even if the
  // parent itself was already pushed by the by-country rule above).
  const singleSelectedId = selectedNodeIds.size === 1 ? [...selectedNodeIds][0] : null
  const displayPositions = useMemo(() => {
    if (!isCountryPushActive && !singleSelectedId) return positions
    const out = new Map(positions)
    if (isCountryPushActive && filterMatchIds) {
      for (const n of nodes) {
        if (filterMatchIds.has(n.id)) continue
        const pos = positions.get(n.id)
        if (!pos) continue
        out.set(n.id, pushedPosition(pos, graphCenter, COUNTRY_PUSH_FACTOR))
      }
    }
    if (singleSelectedId) {
      const parentDisplayPos = out.get(singleSelectedId)
      if (parentDisplayPos) {
        for (const n of nodes) {
          if (n.parentId !== singleSelectedId) continue
          const pos = out.get(n.id)
          if (!pos) continue
          out.set(n.id, pushedAlongAxis(pos, parentDisplayPos, CELL_CHILDREN_PUSH_PX))
        }
      }
    }
    return out
  }, [isCountryPushActive, filterMatchIds, positions, nodes, graphCenter, singleSelectedId])

  // -- 8.12 search pulse trigger refs — same "begin=indefinite,
  // beginElement() called imperatively" SMIL discipline as the spawn
  // ring-pulse this reuses the visual language of, but re-triggerable (a
  // search match set can change many times across a session, unlike a
  // spawn which fires once).
  const searchTriggerRefs = useRef(new Map<string, SVGElement>())

  useEffect(() => {
    if (!searchQuery.trim()) return
    for (const id of searchMatchIds) {
      const el = searchTriggerRefs.current.get(id)
      if (el instanceof SVGAnimateElement) el.beginElement()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // -- 8.12 camera pan to the first match, over 400ms — reuses the exact
  // zoom-to-node tween, just holding the CURRENT zoom level instead of
  // forcing 2x (a search shouldn't also change how zoomed in you are).
  useEffect(() => {
    if (!searchQuery.trim()) return
    const match = firstSearchMatch(nodes, searchQuery)
    if (!match) return
    const pos = positions.get(match.id)
    if (!pos) return
    animatePanZoomTo(computeNodePanOnlyTransform(pos.x, pos.y))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const renderEdges: RenderEdge[] = useMemo(() => {
    const out: RenderEdge[] = []
    for (const e of edges) {
      // displayPositions (not positions) so an edge stays visually attached
      // to a node the by-country filter has pushed toward the edges — see
      // that memo's own comment for why bud/spawn math elsewhere is exempt.
      const a = displayPositions.get(e.source)
      const b = displayPositions.get(e.target)
      const sourceNode = nodeById.get(e.source)
      const targetNode = nodeById.get(e.target)
      if (!a || !b || !sourceNode || !targetNode) continue
      const curve = e.kind === 'parent' ? parentChildCurve(e.id, a, b) : e.kind === 'sibling' ? siblingCurve(e.id, a, b) : crossCurve(e.id, a, b)
      const sourceTiming = schedule.get(e.source)
      const targetTiming = schedule.get(e.target)
      const sourceStart = sourceTiming?.animated ? sourceTiming.startMs : -1
      const targetStart = targetTiming?.animated ? targetTiming.startMs : -1
      const laterSid = sourceStart < 0 && targetStart < 0 ? null : sanitizeId(sourceStart >= targetStart ? e.source : e.target)
      out.push({
        edge: e,
        path: quadraticSvgPath(curve),
        a,
        b,
        sourceColor: baseColorFor(sourceNode),
        targetColor: baseColorFor(targetNode),
        targetSid: sanitizeId(e.target),
        laterSid,
      })
    }
    return out
  }, [edges, displayPositions, nodeById, schedule])

  const visibleLabelIds = useMemo(() => {
    const candidates: LabelCandidate[] = []
    for (const n of nodes) {
      if (n.tier !== 'root' && n.tier !== 'parent') continue
      const pos = positions.get(n.id)
      if (!pos) continue
      const radius = RADIUS_BY_TIER[n.tier]
      candidates.push({
        id: n.id,
        label: truncateLabel(n.label),
        anchorX: pos.x,
        anchorY: pos.y + radius + LABEL_GAP_PX,
        fontSize: n.tier === 'root' ? ROOT_LABEL_FONT_PX : PARENT_LABEL_FONT_PX,
        priority: n.tier === 'root' ? 2 : 1,
      })
    }
    return computeVisibleLabels(candidates)
  }, [nodes, positions])

  // -- 8.9 graph bounding box — feeds zoom-to-fit and the minimap. Recomputed
  // only when positions actually change (a live arrival, a removal), never
  // per frame; padded by each node's own radius so a node sitting AT the
  // extreme edge of the bbox isn't half-clipped by "fit."
  const graphBBox = useMemo(() => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const pos = positions.get(n.id)
      if (!pos) continue
      const r = RADIUS_BY_TIER[n.tier] + 20 // node radius plus label headroom
      minX = Math.min(minX, pos.x - r)
      minY = Math.min(minY, pos.y - r)
      maxX = Math.max(maxX, pos.x + r)
      maxY = Math.max(maxY, pos.y + r)
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 1, height: 1 }
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
  }, [nodes, positions])

  // ambient idle drift — unconditional, unaffected by spawn/live-data state
  useEffect(() => {
    if (reducedMotion) return
    let raf = 0
    const start = performance.now()
    function frame(now: number) {
      const elapsed = now - start
      for (const [id, el] of driftRefs.current) {
        if (!el) continue
        const { x, y } = idleDriftOffset(id, elapsed)
        el.setAttribute('transform', `translate(${x}, ${y})`)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion])

  function applyTransform() {
    const g = groupRef.current
    if (g) {
      const { x, y, zoom } = panZoomRef.current
      g.setAttribute('transform', `translate(${x}, ${y}) scale(${zoom})`)
    }
    updateMinimapViewportRect()
  }

  // 8.9: updates the minimap's viewport rectangle to match the main
  // canvas's CURRENT pan/zoom — called from every place applyTransform()
  // is, so it's always in sync in real time, imperatively (no React state).
  function updateMinimapViewportRect() {
    const rectEl = minimapRectRef.current
    const container = containerRef.current
    if (!rectEl || !container) return
    const { x, y, zoom } = panZoomRef.current
    const { width: cw, height: ch } = container.getBoundingClientRect()
    const scale = MINIMAP_WIDTH_PX / graphBBox.width
    // visible data-space rect, in minimap pixel space
    const vx = (-x / zoom - graphBBox.minX) * scale
    const vy = (-y / zoom - graphBBox.minY) * scale
    const vw = (cw / zoom) * scale
    const vh = (ch / zoom) * scale
    rectEl.setAttribute('x', String(vx))
    rectEl.setAttribute('y', String(vy))
    rectEl.setAttribute('width', String(Math.max(1, vw)))
    rectEl.setAttribute('height', String(Math.max(1, vh)))
  }

  function checkDefaultChanged() {
    const { x, y, zoom } = panZoomRef.current
    const nowDefault = x === DEFAULT_PAN_ZOOM.x && y === DEFAULT_PAN_ZOOM.y && zoom === DEFAULT_PAN_ZOOM.zoom
    if (nowDefault !== isDefaultRef.current) {
      isDefaultRef.current = nowDefault
      onViewChanged?.(nowDefault)
    }
  }

  // 8.9: debounced so hovering right at the 1.2x boundary (a slow wheel
  // scroll, a jittery pinch) doesn't flip the class back and forth on
  // every single event — still just a class toggle, no re-layout, no
  // React state, only the COMMIT of the toggle is delayed.
  function scheduleLabelThresholdUpdate(zoom: number) {
    const shouldBeZoomedIn = zoom > ZOOM_LABEL_THRESHOLD
    if (labelDebounceTimerRef.current !== null) window.clearTimeout(labelDebounceTimerRef.current)
    labelDebounceTimerRef.current = window.setTimeout(() => {
      labelDebounceTimerRef.current = null
      if (shouldBeZoomedIn === appliedZoomedInRef.current) return
      appliedZoomedInRef.current = shouldBeZoomedIn
      containerRef.current?.classList.toggle('graph-zoomed-in', shouldBeZoomedIn)
    }, LABEL_THRESHOLD_DEBOUNCE_MS)
  }

  // 8.9: one-shot rAF tween from the CURRENT pan/zoom to a target, used by
  // zoom-to-fit and zoom-to-node. Cancels any animation already in flight
  // (a rapid second double-click shouldn't fight the first's animation).
  function animatePanZoomTo(target: { x: number; y: number; zoom: number }) {
    if (zoomAnimRafRef.current !== null) cancelAnimationFrame(zoomAnimRafRef.current)
    const start = { ...panZoomRef.current }
    const startTime = performance.now()
    function step(now: number) {
      const t = Math.min(1, (now - startTime) / ZOOM_ANIMATION_MS)
      const eased = easeInOutCubic(t)
      panZoomRef.current = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        zoom: start.zoom + (target.zoom - start.zoom) * eased,
      }
      applyTransform()
      scheduleLabelThresholdUpdate(panZoomRef.current.zoom)
      if (t < 1) {
        zoomAnimRafRef.current = requestAnimationFrame(step)
      } else {
        zoomAnimRafRef.current = null
        checkDefaultChanged()
      }
    }
    zoomAnimRafRef.current = requestAnimationFrame(step)
  }

  function computeFitTransform(): { x: number; y: number; zoom: number } {
    const container = containerRef.current
    if (!container) return { ...DEFAULT_PAN_ZOOM }
    const { width: cw, height: ch } = container.getBoundingClientRect()
    const fitZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(cw / graphBBox.width, ch / graphBBox.height) * (1 - MINIMAP_PADDING_FRACTION)))
    const bboxCenterX = graphBBox.minX + graphBBox.width / 2
    const bboxCenterY = graphBBox.minY + graphBBox.height / 2
    return { zoom: fitZoom, x: cw / 2 - bboxCenterX * fitZoom, y: ch / 2 - bboxCenterY * fitZoom }
  }

  function computeNodeCenterTransform(nodeX: number, nodeY: number): { x: number; y: number; zoom: number } {
    const container = containerRef.current
    if (!container) return { ...DEFAULT_PAN_ZOOM }
    const { width: cw, height: ch } = container.getBoundingClientRect()
    return { zoom: ZOOM_TO_NODE_LEVEL, x: cw / 2 - nodeX * ZOOM_TO_NODE_LEVEL, y: ch / 2 - nodeY * ZOOM_TO_NODE_LEVEL }
  }

  // 8.12: search's own camera pan — centres the match WITHOUT changing the
  // current zoom level (unlike double-click-to-zoom-to-node, which
  // deliberately jumps to 2x).
  function computeNodePanOnlyTransform(nodeX: number, nodeY: number): { x: number; y: number; zoom: number } {
    const container = containerRef.current
    if (!container) return { ...DEFAULT_PAN_ZOOM }
    const { width: cw, height: ch } = container.getBoundingClientRect()
    const zoom = panZoomRef.current.zoom
    return { zoom, x: cw / 2 - nodeX * zoom, y: ch / 2 - nodeY * zoom }
  }

  // 8.13-ui: the floating zoom-stack buttons — a fixed step, clamped to the
  // same ZOOM_MIN/ZOOM_MAX as every other zoom path, anchored at the
  // viewport CENTRE (a button click has no cursor position of its own to
  // anchor to, unlike wheel/pinch).
  function computeZoomStepTransform(stepFactor: number): { x: number; y: number; zoom: number } {
    const container = containerRef.current
    if (!container) return { ...DEFAULT_PAN_ZOOM }
    const { width: cw, height: ch } = container.getBoundingClientRect()
    const current = panZoomRef.current
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current.zoom * stepFactor))
    const dataX = (cw / 2 - current.x) / current.zoom
    const dataY = (ch / 2 - current.y) / current.zoom
    return { zoom: newZoom, x: cw / 2 - dataX * newZoom, y: ch / 2 - dataY * newZoom }
  }

  function zoomIn() {
    animatePanZoomTo(computeZoomStepTransform(1.3))
  }

  function zoomOut() {
    animatePanZoomTo(computeZoomStepTransform(1 / 1.3))
  }

  useImperativeHandle(ref, () => ({
    resetView() {
      if (zoomAnimRafRef.current !== null) {
        cancelAnimationFrame(zoomAnimRafRef.current)
        zoomAnimRafRef.current = null
      }
      panZoomRef.current = { ...DEFAULT_PAN_ZOOM }
      applyTransform()
      if (labelDebounceTimerRef.current !== null) window.clearTimeout(labelDebounceTimerRef.current)
      appliedZoomedInRef.current = false
      containerRef.current?.classList.remove('graph-zoomed-in')
      checkDefaultChanged()
    },
    selectNodeExternally(nodeId: string) {
      selectNode(nodeId, false)
    },
    deselectAllExternally() {
      deselectAll()
    },
  }))

  useEffect(() => {
    applyTransform()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // the minimap's own scale depends on graphBBox — keep its viewport rect
  // in sync whenever the graph's extent itself changes (a live arrival or
  // removal), not just on pan/zoom.
  useEffect(() => {
    updateMinimapViewportRect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphBBox])

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // setPointerCapture throws if the browser doesn't consider this
    // pointerId "active" at the moment of the call — normally impossible
    // for real input, but a live check dispatching synthetic multi-pointer
    // events (simulating pinch outside a real touch session) hit exactly
    // this, and an uncaught exception here would break the whole gesture.
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // no-op — capture is an optimization (keeps receiving events if the
      // pointer leaves the element), not a correctness requirement here
    }
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activePointersRef.current.size >= 2) {
      draggingRef.current = null
      pinchLastDistRef.current = pinchDistance()
    } else {
      draggingRef.current = { startX: e.clientX, startY: e.clientY, originX: panZoomRef.current.x, originY: panZoomRef.current.y }
    }
  }

  function pinchDistance(): number {
    const pts = [...activePointersRef.current.values()]
    if (pts.length < 2) return 0
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
  }

  function pinchMidpoint(): { x: number; y: number } {
    const pts = [...activePointersRef.current.values()]
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    if (activePointersRef.current.size >= 2) {
      const rect = containerRef.current?.getBoundingClientRect()
      const lastDist = pinchLastDistRef.current
      if (!rect || !lastDist) return
      const newDist = pinchDistance()
      if (newDist < 1 || lastDist < 1) return
      const { x, y, zoom } = panZoomRef.current
      const factor = newDist / lastDist
      const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor))
      const mid = pinchMidpoint()
      const cx = mid.x - rect.left
      const cy = mid.y - rect.top
      const worldX = (cx - x) / zoom
      const worldY = (cy - y) / zoom
      panZoomRef.current = { zoom: nextZoom, x: cx - worldX * nextZoom, y: cy - worldY * nextZoom }
      pinchLastDistRef.current = newDist
      applyTransform()
      scheduleLabelThresholdUpdate(nextZoom)
      return
    }

    const drag = draggingRef.current
    if (!drag) return
    panZoomRef.current.x = drag.originX + (e.clientX - drag.startX)
    panZoomRef.current.y = drag.originY + (e.clientY - drag.startY)
    applyTransform()
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    activePointersRef.current.delete(e.pointerId)
    if (activePointersRef.current.size < 2) pinchLastDistRef.current = null
    if (activePointersRef.current.size === 0 && draggingRef.current) checkDefaultChanged()
    if (activePointersRef.current.size === 0) draggingRef.current = null
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const { x, y, zoom } = panZoomRef.current
    const factor = Math.min(1.15, Math.max(0.85, 1 - e.deltaY * 0.0016))
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor))
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const worldX = (cx - x) / zoom
    const worldY = (cy - y) / zoom
    panZoomRef.current = { zoom: nextZoom, x: cx - worldX * nextZoom, y: cy - worldY * nextZoom }
    applyTransform()
    checkDefaultChanged()
    scheduleLabelThresholdUpdate(nextZoom)
  }

  // 8.9: double-click empty canvas -> zoom-to-fit; double-click a node ->
  // zoom-to-node at 2x, centred. Both animate over 400ms and both count as
  // a pan/zoom change (Reset View appears).
  function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as Element
    const nodeGroup = target.closest('[data-node-id]')
    if (nodeGroup) {
      const nodeId = nodeGroup.getAttribute('data-node-id')
      const pos = nodeId ? positions.get(nodeId) : undefined
      if (pos) animatePanZoomTo(computeNodeCenterTransform(pos.x, pos.y))
      return
    }
    animatePanZoomTo(computeFitTransform())
  }

  // 8.9: drag the minimap's own viewport rectangle to pan the main canvas.
  // Converts a minimap-pixel delta into the main canvas's pan (screen)
  // space via the SAME scale the rect itself is drawn with.
  const minimapDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  function handleMinimapPointerDown(e: React.PointerEvent<SVGRectElement>) {
    e.stopPropagation()
    try {
      ;(e.currentTarget as unknown as Element).setPointerCapture(e.pointerId)
    } catch {
      // no-op — see handlePointerDown's own comment
    }
    minimapDragRef.current = { startX: e.clientX, startY: e.clientY, originX: panZoomRef.current.x, originY: panZoomRef.current.y }
  }

  function handleMinimapPointerMove(e: React.PointerEvent<SVGRectElement>) {
    const drag = minimapDragRef.current
    if (!drag) return
    const scale = MINIMAP_WIDTH_PX / graphBBox.width
    const { zoom } = panZoomRef.current
    const dxMinimap = e.clientX - drag.startX
    const dyMinimap = e.clientY - drag.startY
    panZoomRef.current.x = drag.originX - (dxMinimap / scale) * zoom
    panZoomRef.current.y = drag.originY - (dyMinimap / scale) * zoom
    applyTransform()
  }

  function handleMinimapPointerUp(e: React.PointerEvent<SVGRectElement>) {
    if (minimapDragRef.current) checkDefaultChanged()
    minimapDragRef.current = null
    ;(e.currentTarget as unknown as Element).releasePointerCapture?.(e.pointerId)
  }

  const showSkipButton = animateSpawn && anySpawnInProgress()

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: 'none', cursor: draggingRef.current ? 'grabbing' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onClick={handleCanvasClick}
    >
      <svg width="100%" height="100%" className="pointer-events-none absolute left-0 top-0">
        <defs>
          <radialGradient id="graph-root-gradient" cx="35%" cy="35%" r="65%">
            <stop offset="0%" style={{ stopColor: ROOT_BASE_COLOR }} />
            <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--accent-blue) 55%, white)' }} />
          </radialGradient>
          {/* 8.13-ui: the redesign spec's "Parent Cell" membrane — same
              light-centre/radial treatment as the root gradient above,
              just the parent tier's own colour. Parent-tier nodes (route/
              operator) get this instead of a flat fill; child (climber)
              stays a flat status-coloured fill per spec ("solid lighter
              shade," no gradient) and leaf (source) stays a flat vesicle
              dot — neither of those change here. */}
          <radialGradient id="graph-parent-gradient" cx="35%" cy="35%" r="65%">
            <stop offset="0%" style={{ stopColor: PARENT_COLOR }} />
            <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--accent-cyan) 55%, white)' }} />
          </radialGradient>
          {/* 8.13-ui: the redesign spec's own selected-cell glow filter,
              verbatim shape (feGaussianBlur + feMerge). */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={GLOW_BLUR_STD_DEVIATION} result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {renderEdges
            .filter((re) => re.edge.kind === 'parent')
            .map((re) => (
              <linearGradient key={re.edge.id} id={`graph-edge-grad-${sanitizeId(re.edge.id)}`} gradientUnits="userSpaceOnUse" x1={re.a.x} y1={re.a.y} x2={re.b.x} y2={re.b.y}>
                <stop offset="0%" stopColor={re.sourceColor} />
                <stop offset="100%" stopColor={re.targetColor} />
              </linearGradient>
            ))}
        </defs>

        <g ref={groupRef} className="pointer-events-auto">
          <g className="edges-layer">
            {renderEdges.map((re) => {
              const isConnectedToHover = hoveredNodeId !== null && (re.edge.source === hoveredNodeId || re.edge.target === hoveredNodeId)
              // 8.13-ui: "secondary spindle only visible when parent
              // selected or child hovered" — the target-is-a-vesicle case
              // of the same rest-dim rule the node loop applies below.
              const targetIsRestingVesicle = !isConnectedToHover && nodeById.get(re.edge.target)?.tier === 'leaf' && !selectedNodeIds.has(re.edge.target)
              const interactionOpacity = highlight
                ? highlight.edgeIds.has(re.edge.id)
                  ? 1
                  : SELECT_DIM_OPACITY
                : hoveredNodeId
                  ? isConnectedToHover
                    ? 1
                    : HOVER_DIM_OPACITY
                  : targetIsRestingVesicle
                    ? VESICLE_REST_OPACITY
                    : 1
              const searchEdgeMatch = !isSearchActive || (searchMatchIds.has(re.edge.source) && searchMatchIds.has(re.edge.target))
              const filterEdgeMatch = edgeMatchesFilter(re.edge, filterMatchIds)
              const auxOpacity = (isSearchActive ? (searchEdgeMatch ? 1 : SEARCH_DIM_OPACITY) : 1) * (isFilterActive ? (filterEdgeMatch ? 1 : FILTER_DIM_OPACITY) : 1)
              const desaturate = isFilterActive && !filterEdgeMatch
              return (
                <EdgeShape
                  key={re.edge.id}
                  renderEdge={re}
                  reducedMotion={reducedMotion}
                  animateSpawn={animateSpawn}
                  isRemoving={removingIds.has(re.edge.target)}
                  isConnectedToHover={isConnectedToHover}
                  isSelectedEdge={highlight !== null && highlight.edgeIds.has(re.edge.id)}
                  interactionOpacity={interactionOpacity}
                  auxOpacity={auxOpacity}
                  desaturate={desaturate}
                  edgeRef={(el) => {
                    if (el) shapeRefs.current.set(`edge:${re.edge.target}`, el)
                  }}
                />
              )
            })}
          </g>

          <g className="nodes-layer">
            {nodes.map((n) => {
              const pos = positions.get(n.id)
              if (!pos) return null
              const displayPos = displayPositions.get(n.id) ?? pos
              const parentNode = n.parentId ? nodeById.get(n.parentId) : undefined
              const parentPos = n.parentId ? positions.get(n.parentId) : undefined
              const timing = schedule.get(n.id)
              const childIds = (childrenOf.get(n.id) ?? []).map((c) => c.id)
              const suppressAnimation = !animateSpawn || skippedIdsRef.current.has(n.id) || isSpawnSettled(n.id)
              const isHovered = hoveredNodeId === n.id
              const isConnectedToHover = hoveredNodeId !== null && !isHovered && (adjacency.get(hoveredNodeId)?.has(n.id) ?? false)
              const isSelected = selectedNodeIds.has(n.id)
              // 8.13-ui: vesicles (leaf/source nodes) rest dimmed per the
              // spec's C2 row ("hidden, tooltip only") — full opacity the
              // moment they're hovered, connected-to-hover, or selected;
              // the existing select/hover-dim branches below still take
              // priority when something ELSE is hovered/selected instead.
              const isRestingVesicle = n.tier === 'leaf' && !isHovered && !isConnectedToHover && !isSelected
              const interactionOpacity = highlight
                ? highlight.nodeIds.has(n.id)
                  ? 1
                  : SELECT_DIM_OPACITY
                : hoveredNodeId
                  ? isHovered || isConnectedToHover
                    ? 1
                    : HOVER_DIM_OPACITY
                  : isRestingVesicle
                    ? VESICLE_REST_OPACITY
                    : 1
              const isSearchMatch = searchMatchIds.has(n.id)
              const isFilterMatch = !isFilterActive || (filterMatchIds?.has(n.id) ?? true)
              const auxOpacity = (isSearchActive ? (isSearchMatch ? 1 : SEARCH_DIM_OPACITY) : 1) * (isFilterActive ? (isFilterMatch ? 1 : FILTER_DIM_OPACITY) : 1)
              const desaturate = isFilterActive && !isFilterMatch
              const filterScale = isFilterActive && isFilterMatch ? FILTER_MATCH_SCALE : 1
              return (
                <NodeShape
                  key={n.id}
                  node={n}
                  pos={pos}
                  displayPos={displayPos}
                  parentNode={parentNode}
                  parentPos={parentPos}
                  rollup={rollup}
                  timing={timing}
                  childIds={childIds}
                  suppressAnimation={suppressAnimation}
                  isRemoving={removingIds.has(n.id)}
                  isHovered={isHovered}
                  isConnectedToHover={isConnectedToHover}
                  isSelected={isSelected}
                  interactionOpacity={interactionOpacity}
                  auxOpacity={auxOpacity}
                  desaturate={desaturate}
                  filterScale={filterScale}
                  tabIndex={tierRank.get(n.id) ?? -1}
                  onHoverEnter={() => setHoveredNodeId(n.id)}
                  onHoverLeave={() => setHoveredNodeId((cur) => (cur === n.id ? null : cur))}
                  onSelect={(additive) => selectNode(n.id, additive)}
                  triggerRef={(el) => {
                    if (el) triggerRefs.current.set(n.id, el)
                  }}
                  childTriggerRef={(childId, el) => {
                    if (el) triggerRefs.current.set(childId, el)
                  }}
                  searchTriggerRef={(el) => {
                    if (el) searchTriggerRefs.current.set(n.id, el)
                  }}
                  shapeRef={(el) => {
                    if (el) shapeRefs.current.set(n.id, el)
                  }}
                  driftRef={(el) => driftRefs.current.set(n.id, el)}
                />
              )
            })}
          </g>

          <g className="labels-layer">
            {nodes.map((n) => {
              if (n.tier === 'leaf') return null
              const pos = positions.get(n.id)
              if (!pos) return null
              const radius = RADIUS_BY_TIER[n.tier]
              const timing = schedule.get(n.id)
              const gateLabel = animateSpawn && timing?.animated && !isSpawnSettled(n.id) && !skippedIdsRef.current.has(n.id)
              if (n.tier === 'child') {
                return (
                  <text
                    key={n.id}
                    className="graph-child-label"
                    x={pos.x}
                    y={pos.y + radius + LABEL_GAP_PX + CHILD_LABEL_FONT_PX * 0.8}
                    textAnchor="middle"
                    fontSize={CHILD_LABEL_FONT_PX}
                    style={{ fill: TEXT_PRIMARY, fontFamily: 'Inter, Roboto, sans-serif' }}
                  >
                    {truncateLabel(n.label)}
                  </text>
                )
              }
              const isHovered = hoveredNodeId === n.id
              // 8.10: HOVER "label appears if hidden" — a root/parent label
              // collision-suppressed by computeVisibleLabels (8.6) still
              // renders (opacity 0, no layout cost) so hovering its own
              // node can reveal it; a label already scheduled to survive
              // collision keeps its existing gating untouched.
              if (!visibleLabelIds.has(n.id) && !isHovered) return null
              const sid = sanitizeId(n.id)
              const baseFontSize = n.tier === 'root' ? ROOT_LABEL_FONT_PX : PARENT_LABEL_FONT_PX
              return (
                <text
                  key={n.id}
                  x={pos.x}
                  y={pos.y + radius + LABEL_GAP_PX + ROOT_LABEL_FONT_PX * 0.8}
                  textAnchor="middle"
                  fontSize={isHovered ? baseFontSize + ROOT_PARENT_LABEL_HOVER_FONT_BUMP : baseFontSize}
                  opacity={gateLabel && !isHovered ? 0 : 1}
                  style={{ fill: TEXT_PRIMARY, fontFamily: 'Inter, Roboto, sans-serif', transition: 'font-size 150ms ease-out, opacity 150ms ease-out' }}
                >
                  {truncateLabel(n.label)}
                  {gateLabel && <animate attributeName="opacity" values="0;1" keyTimes="0;1" begin={`bud-scale3-${sid}.end`} dur={`${FADE_IN_DUR_MS}ms`} fill="freeze" />}
                </text>
              )
            })}
          </g>
        </g>
      </svg>

      <button
        type="button"
        onClick={handleSkip}
        style={{
          ...TYPE_RESET_VIEW,
          position: 'absolute',
          bottom: SPACE_16,
          right: SPACE_16 + MINIMAP_WIDTH_PX + SPACE_16,
          background: BG_SECONDARY,
          border: `1px solid ${BORDER_MEDIUM}`,
          borderRadius: RADIUS_BUTTON,
          padding: `${SPACE_8}px ${SPACE_16}px`,
          cursor: 'pointer',
          opacity: showSkipButton ? 1 : 0,
          pointerEvents: showSkipButton ? 'auto' : 'none',
          transition: 'opacity 120ms ease-out',
        }}
        data-skip-tick={skipTick}
      >
        Skip animation
      </button>

      <Minimap nodes={nodes} positions={positions} bbox={graphBBox} rectRef={(el) => (minimapRectRef.current = el)} onRectPointerDown={handleMinimapPointerDown} onRectPointerMove={handleMinimapPointerMove} onRectPointerUp={handleMinimapPointerUp} />
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
})

function EdgeShape({
  renderEdge,
  reducedMotion,
  animateSpawn,
  isRemoving,
  isConnectedToHover,
  isSelectedEdge,
  interactionOpacity,
  auxOpacity,
  desaturate,
  edgeRef,
}: {
  renderEdge: RenderEdge
  reducedMotion: boolean
  animateSpawn: boolean
  isRemoving: boolean
  isConnectedToHover: boolean
  /** 8.13-ui: part of the current ancestor-trail/mutual-connection highlight — "Selected: spindle Thick (3px)" per the redesign spec. */
  isSelectedEdge: boolean
  interactionOpacity: number
  /** 8.12: search/filter combined dim factor — a SEPARATE outer layer from interactionOpacity (hover/select) so each keeps its own transition duration (200ms vs 300ms), same "one concern per wrapping <g>" discipline as everywhere else in this file. */
  auxOpacity: number
  desaturate: boolean
  edgeRef: (el: SVGPathElement | null) => void
}) {
  const { edge, path } = renderEdge
  const pathId = `graph-edge-path-${sanitizeId(edge.id)}`
  // 8.10 HOVER: "connected edges brighten" — same thicker/brighter
  // treatment interactions.css already gives an edge on its OWN :hover,
  // just driven by React state now since the trigger is hovering the
  // NODE at either end, not the edge itself (a sibling-layer concern CSS
  // can't reach, same reasoning as the root/parent label enlarge above).
  const hoverBrighten = isConnectedToHover ? { filter: 'brightness(1.35)' } : undefined

  let core: ReactElement
  if (edge.kind === 'parent') {
    const gated = animateSpawn && !isSpawnSettled(edge.target)
    const budScale2Id = `bud-scale2-${renderEdge.targetSid}`
    core = (
      <g className="graph-edge-group" style={{ opacity: interactionOpacity, transition: OPACITY_TRANSITION }}>
        <path
          id={pathId}
          ref={edgeRef}
          d={path}
          fill="none"
          stroke={`url(#graph-edge-grad-${sanitizeId(edge.id)})`}
          strokeWidth={isSelectedEdge ? EDGE_STROKE_SELECTED : isConnectedToHover ? EDGE_STROKE_HOVER : gated ? 0 : EDGE_STROKE_DEFAULT}
          strokeDasharray={gated ? '100 100' : undefined}
          strokeDashoffset={gated ? 100 : 0}
          pathLength={gated ? 100 : undefined}
          className="graph-edge-parent-child"
          opacity={isRemoving ? undefined : 1}
          style={hoverBrighten}
        >
          {gated && (
            <>
              <animate attributeName="stroke-width" values={`0;${EDGE_STROKE_DEFAULT}`} keyTimes="0;1" begin={`${budScale2Id}.end`} dur={`${PHASE_SPLIT_END_MS - PHASE_BUD_END_MS}ms`} calcMode="spline" keySplines={EASE_IN_OUT_SPLINE} fill="freeze" />
              <animate attributeName="stroke-dashoffset" values="100;0" keyTimes="0;1" begin={`${budScale2Id}.end`} dur={`${PHASE_SPLIT_END_MS - PHASE_BUD_END_MS}ms`} calcMode="spline" keySplines={EASE_IN_OUT_SPLINE} fill="freeze" />
            </>
          )}
        </path>
        <path d={path} fill="none" stroke="transparent" strokeWidth={Math.max(EDGE_STROKE_HOVER, 10)} />
        {!reducedMotion && (
          <circle r={2} className="graph-edge-pulse" style={{ fill: renderEdge.targetColor }} opacity={gated ? 0 : undefined}>
            <animateMotion begin={gated ? `${budScale2Id}.end+${PHASE_SPLIT_END_MS - PHASE_BUD_END_MS}ms` : '0s'} dur="3s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
              <mpath href={`#${pathId}`} />
            </animateMotion>
            {gated && <set attributeName="opacity" to="0.85" begin={`${budScale2Id}.end+${PHASE_SPLIT_END_MS - PHASE_BUD_END_MS}ms`} fill="freeze" />}
          </circle>
        )}
      </g>
    )
  } else {
    const gated = animateSpawn && renderEdge.laterSid !== null && !isSpawnSettled(edge.source) && !isSpawnSettled(edge.target)
    const finalOpacity = edge.kind === 'cross' ? 0.4 : 1
    const stroke = edge.kind === 'cross' ? ACCENT_PURPLE : BORDER_MEDIUM
    const strokeWidth = isConnectedToHover ? EDGE_STROKE_HOVER : 1
    const base: ReactElement<{ opacity?: number }> =
      edge.kind === 'cross' ? (
        <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} style={hoverBrighten} />
      ) : (
        <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="4 3" style={hoverBrighten} />
      )
    const wrapperStyle = { opacity: interactionOpacity, transition: OPACITY_TRANSITION }
    if (!gated) {
      core = cloneOpacity(base, finalOpacity, wrapperStyle)
    } else {
      // interaction opacity (CSS, outer) and spawn fade-in (SMIL, inner,
      // attribute-based) MUST stay on separate elements — CSS opacity on the
      // same element an <animate attributeName="opacity"> targets would win
      // over (and break) the SMIL animation, the same base/animated-value
      // precedence issue 8.7's own scale/translate work already ran into.
      core = (
        <g style={wrapperStyle}>
          <g opacity={0}>
            {base}
            <animate attributeName="opacity" values={`0;${finalOpacity}`} keyTimes="0;1" begin={`bud-scale3-${renderEdge.laterSid}.end`} dur={`${FADE_IN_DUR_MS}ms`} fill="freeze" />
          </g>
        </g>
      )
    }
  }

  return <g style={{ opacity: auxOpacity, filter: desaturate ? 'saturate(0)' : undefined, transition: AUX_TRANSITION }}>{core}</g>
}

function cloneOpacity(el: ReactElement<{ opacity?: number }>, opacity: number, wrapperStyle: { opacity: number; transition: string }): ReactElement {
  return (
    <g style={wrapperStyle}>
      {cloneElement(el, { opacity })}
    </g>
  )
}

interface NodeShapeProps {
  node: GraphNode
  pos: Point
  /** 8.12: the position this node is actually DRAWN at — equal to `pos` unless "by country" has pushed it toward the edges. `pos` itself stays the TRUE position, still used for bud/spawn math below. */
  displayPos: Point
  parentNode: GraphNode | undefined
  parentPos: Point | undefined
  rollup: ReadonlyMap<string, GraphNodeStatus>
  timing: SpawnTiming | undefined
  childIds: string[]
  suppressAnimation: boolean
  isRemoving: boolean
  isHovered: boolean
  isConnectedToHover: boolean
  isSelected: boolean
  interactionOpacity: number
  /** 8.12: search/filter combined dim factor, its own wrapping layer (300ms) separate from interactionOpacity (200ms). */
  auxOpacity: number
  desaturate: boolean
  /** 8.12: 1.2x when this node matches the active filter; 1 otherwise. Hover's own 1.3x wins if both apply (see the scale <g> below). */
  filterScale: number
  tabIndex: number
  onHoverEnter: () => void
  onHoverLeave: () => void
  onSelect: (additive: boolean) => void
  triggerRef: (el: SVGElement | null) => void
  childTriggerRef: (childId: string, el: SVGElement | null) => void
  searchTriggerRef: (el: SVGElement | null) => void
  shapeRef: (el: SVGElement | null) => void
  driftRef: (el: SVGGElement | null) => void
}

function NodeShape({
  node,
  pos,
  displayPos,
  parentNode,
  parentPos,
  rollup,
  timing,
  childIds,
  suppressAnimation,
  isRemoving,
  isHovered,
  isConnectedToHover,
  isSelected,
  interactionOpacity,
  auxOpacity,
  desaturate,
  filterScale,
  tabIndex,
  onHoverEnter,
  onHoverLeave,
  onSelect,
  triggerRef,
  childTriggerRef,
  searchTriggerRef,
  shapeRef,
  driftRef,
}: NodeShapeProps) {
  const radius = RADIUS_BY_TIER[node.tier]
  const sid = sanitizeId(node.id)
  const canAnimate = !suppressAnimation
  const isDivider = canAnimate && !!timing?.animated

  let restX = 0
  let restY = 0
  let parentColorHex = ''
  let budPathD = ''
  if (isDivider && parentNode && parentPos) {
    const parentRadius = RADIUS_BY_TIER[parentNode.tier]
    const angle = Math.atan2(pos.y - parentPos.y, pos.x - parentPos.x)
    restX = parentPos.x + Math.cos(angle) * parentRadius - pos.x
    restY = parentPos.y + Math.sin(angle) * parentRadius - pos.y
    parentColorHex = resolvedHexColorFor(parentNode)
    budPathD = quadraticSvgPath(parentChildCurve(`${node.id}:bud`, { x: 0, y: 0 }, { x: -restX, y: -restY }))
  }
  const childColorHex = resolvedHexColorFor(node)
  const finalFill = node.tier === 'root' ? 'url(#graph-root-gradient)' : node.tier === 'parent' ? 'url(#graph-parent-gradient)' : baseColorFor(node)
  const fill = isDivider ? parentColorHex : finalFill

  const shapeCommon = { fill, stroke: 'white' as const }
  // 8.10 HOVER: "connected nodes glow subtly" — layered onto whichever
  // shadow filter this node already had, so a connected root doesn't lose
  // its own medium-shadow just because it's also glowing.
  const softGlow = isConnectedToHover ? ` drop-shadow(0 0 5px ${ACCENT_CYAN})` : ''
  // 8.13-ui: "membrane glows" on select, per the redesign spec's own
  // interaction-state table — the SAME `url(#glow)` filter defined once in
  // <defs>, appended to whatever shadow/hover filter this shape already has.
  const selectedGlow = isSelected ? ' url(#glow)' : ''
  const shape =
    node.tier === 'leaf' ? (
      <path
        ref={(el) => shapeRef(el)}
        d={`M 0 ${-NODE_DIAMETER_LEAF / 2} L ${NODE_DIAMETER_LEAF / 2} 0 L 0 ${NODE_DIAMETER_LEAF / 2} L ${-NODE_DIAMETER_LEAF / 2} 0 Z`}
        {...shapeCommon}
        strokeWidth={1}
        style={{ filter: `var(--shadow-soft-filter)${softGlow}${selectedGlow}`, transition: 'filter 150ms ease-out' }}
      >
        {isDivider && <animate attributeName="fill" values={`${parentColorHex};${childColorHex}`} keyTimes="0;1" begin={`bud-scale2-${sid}.end`} dur={`${PHASE_SPLIT_END_MS - PHASE_BUD_END_MS}ms`} calcMode="linear" fill="freeze" />}
      </path>
    ) : (
      <circle
        ref={(el) => shapeRef(el)}
        r={radius}
        {...shapeCommon}
        strokeWidth={2}
        style={{ filter: `${node.tier === 'root' ? 'var(--shadow-medium-filter)' : 'var(--shadow-soft-filter)'}${softGlow}${selectedGlow}`, transition: 'filter 150ms ease-out' }}
      >
        {isDivider && <animate attributeName="fill" values={`${parentColorHex};${childColorHex}`} keyTimes="0;1" begin={`bud-scale2-${sid}.end`} dur={`${PHASE_SPLIT_END_MS - PHASE_BUD_END_MS}ms`} calcMode="linear" fill="freeze" />}
      </circle>
    )

  const organelles = (node.tier === 'root' || node.tier === 'parent') && !isDivider ? organelleOffsets(node.id, radius) : []

  const rollupStatus = rollup.get(node.id)
  let badge: ReactElement | null = null
  if (node.tier === 'root' && isCritical(node.id, rollup)) {
    badge = <circle {...badgeCenter(radius)} r={BADGE_RADIUS_PX} fill="var(--accent-red)" stroke="white" strokeWidth={1} />
  } else if (node.tier === 'parent' && rollupStatus) {
    badge = <circle {...badgeCenter(radius)} r={BADGE_RADIUS_PX} fill={STATUS_COLOR[rollupStatus]} stroke="white" strokeWidth={1} />
  }

  const fadeableRoot = canAnimate && !timing?.animated // roots/orphans: the one exception, a plain fade

  const inner = (
    <g transform={isDivider ? `translate(${restX}, ${restY})` : undefined}>
      <g transform={isDivider ? 'scale(0)' : undefined} opacity={fadeableRoot ? 0 : undefined}>
        {isDivider && (
          <>
            <animateTransform
              attributeName="transform"
              type="scale"
              values={`0;${BUD_PHASE2_SCALE * 1.2};${BUD_PHASE2_SCALE}`}
              keyTimes={BUD_OVERSHOOT_KEYTIMES}
              begin={`ring-r-${sid}.begin+${PHASE_PULSE_END_MS}ms`}
              dur={`${PHASE_BUD_END_MS - PHASE_PULSE_END_MS}ms`}
              calcMode="spline"
              keySplines={BUD_OVERSHOOT_SPLINES}
              fill="freeze"
              id={`bud-scale2-${sid}`}
            />
            <animateTransform
              attributeName="transform"
              type="scale"
              values={`${BUD_PHASE2_SCALE};1`}
              keyTimes="0;1"
              begin={`bud-scale2-${sid}.end`}
              dur={`${PHASE_SPLIT_END_MS - PHASE_BUD_END_MS}ms`}
              calcMode="spline"
              keySplines={EASE_IN_OUT_SPLINE}
              fill="freeze"
              id={`bud-scale3-${sid}`}
            />
            <animateMotion path={budPathD} keyPoints="0;1" keyTimes="0;1" begin={`bud-scale2-${sid}.end`} dur={`${PHASE_SPLIT_END_MS - PHASE_BUD_END_MS}ms`} calcMode="spline" keySplines={EASE_IN_OUT_SPLINE} fill="freeze" />
            <animateTransform
              attributeName="transform"
              type="translate"
              additive="sum"
              values="0,0;2,-2;-1.3,1.3;0.7,-0.7;0,0"
              keyTimes="0;0.3;0.6;0.85;1"
              begin={`bud-scale3-${sid}.end`}
              dur={`${WOBBLE_DUR_MS}ms`}
              fill="freeze"
            />
          </>
        )}
        {fadeableRoot && <animate ref={triggerRef} id={`root-fade-${sid}`} attributeName="opacity" values="0;1" keyTimes="0;1" begin="indefinite" dur={`${ROOT_FADE_DUR_MS}ms`} fill="freeze" />}
        {shape}
        {organelles.map((o, i) => (
          <circle key={i} cx={o.x} cy={o.y} r={o.r} fill="white" opacity={o.opacity} style={{ pointerEvents: 'none' }} />
        ))}
        {badge}
      </g>
    </g>
  )

  // 8.10: two SEPARATE wrapping layers, deliberately not combined onto one
  // element — opacity (CSS, React-state-driven) and the hover scale (ALSO
  // CSS) each need their own transition timing (200ms vs 150ms per spec),
  // and neither may share an element with anything SMIL already animates
  // via that same attribute (the scale(0)/translate spawn machinery one
  // level further in) for the exact reason 8.7/8.8's own work already
  // found the hard way: a CSS declaration on an element wins over an
  // attribute-based SMIL animation targeting the same property.
  // 8.12: a THIRD reason for "one concern, one wrapping <g>" — auxOpacity
  // (search/filter dim+desaturate, 300ms) sits outside interactionOpacity
  // (hover/select, 200ms), and filterScale sits on the SAME element hover
  // scale already owned rather than a fourth wrapper, because the two are
  // mutually exclusive in practice (hover wins outright when both would
  // apply) and only one `transform` can be "in force" on one element at a
  // time regardless. The outermost position <g> itself now also carries a
  // transition (600ms, "by country" only) — still safe, nothing SMIL
  // touches ever targets THIS element's transform, only descendants further
  // in do.
  const effectiveScale = isHovered ? CELL_HOVER_SCALE : isSelected ? CELL_SELECTED_SCALE : filterScale
  const scaleTransition = isHovered || isSelected ? HOVER_TRANSITION : FILTER_SCALE_TRANSITION
  return (
    <g
      className="graph-node-group"
      transform={`translate(${displayPos.x}, ${displayPos.y})`}
      data-node-id={node.id}
      tabIndex={tabIndex}
      role="button"
      aria-label={node.label}
      aria-pressed={isSelected}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(e.shiftKey)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation()
          onSelect(e.shiftKey)
        }
      }}
      style={{ cursor: 'pointer', transition: COUNTRY_PUSH_TRANSITION }}
    >
      <g style={{ opacity: isRemoving ? undefined : auxOpacity, filter: desaturate ? 'saturate(0)' : undefined, transition: AUX_TRANSITION }}>
        <g style={{ opacity: isRemoving ? undefined : interactionOpacity, transition: OPACITY_TRANSITION }}>
          <g style={{ transform: `scale(${effectiveScale})`, transition: scaleTransition, transformOrigin: '0 0' }}>
            {isSelected && (
              <circle
                className="graph-selection-ring"
                r={radius + SELECTION_RING_GAP}
                fill="none"
                stroke={ACCENT_BLUE}
                strokeWidth={SELECTION_RING_WIDTH}
                style={{ transition: OPACITY_TRANSITION }}
              />
            )}
            <g ref={driftRef}>
              {inner}
              {canAnimate && childIds.length > 0 && <HostPulses hostRadius={radius} hostNode={node} childIds={childIds} childTriggerRef={childTriggerRef} />}
              <SearchPulseRing radius={radius} color={baseColorFor(node)} sid={sid} triggerRef={searchTriggerRef} />
            </g>
          </g>
        </g>
      </g>
    </g>
  )
}

/** 8.12: SEARCH's own pulse — "a ring expands and fades," retriggerable (unlike the spawn ring pulse, which fires once). `begin="indefinite"`, fired imperatively via `searchTriggerRef`'s `beginElement()` whenever this node newly matches a search. */
function SearchPulseRing({ radius, color, sid, triggerRef }: { radius: number; color: string; sid: string; triggerRef: (el: SVGElement | null) => void }) {
  const ringId = `search-ring-${sid}`
  return (
    <circle r={radius} fill="none" stroke={color} strokeWidth={1.5} opacity={0}>
      <animate
        ref={triggerRef}
        id={ringId}
        attributeName="r"
        values={`${radius};${radius * RING_GROWTH_FACTOR}`}
        keyTimes="0;1"
        begin="indefinite"
        dur={`${SEARCH_PULSE_DUR_MS}ms`}
        calcMode="spline"
        keySplines={EASE_OUT_SPLINE}
        fill="freeze"
      />
      <animate attributeName="opacity" values="0.9;0" keyTimes="0;1" begin={`${ringId}.begin`} dur={`${SEARCH_PULSE_DUR_MS}ms`} calcMode="spline" keySplines={EASE_OUT_SPLINE} fill="freeze" />
    </circle>
  )
}

/** PHASE 1, hosted on the PARENT — a ring shockwave plus a brief white flash, once per child. Each child gets its OWN uniquely-id'd ring/flash pair so the centralised scheduler can target exactly one child's pulse without disturbing its siblings'. */
function HostPulses({ hostRadius, hostNode, childIds, childTriggerRef }: { hostRadius: number; hostNode: GraphNode; childIds: string[]; childTriggerRef: (childId: string, el: SVGElement | null) => void }) {
  const ringColor = baseColorFor(hostNode)
  return (
    <>
      {childIds.map((childId) => {
        const csid = sanitizeId(childId)
        return (
          <g key={childId}>
            <circle r={hostRadius} fill="none" stroke={ringColor} strokeWidth={1.5} opacity={0}>
              <animate ref={(el) => childTriggerRef(childId, el)} id={`ring-r-${csid}`} attributeName="r" values={`${hostRadius};${hostRadius * RING_GROWTH_FACTOR}`} keyTimes="0;1" begin="indefinite" dur={`${PHASE_PULSE_END_MS}ms`} calcMode="spline" keySplines={EASE_OUT_SPLINE} fill="freeze" />
              <animate attributeName="opacity" values="0.9;0" keyTimes="0;1" begin={`ring-r-${csid}.begin`} dur={`${PHASE_PULSE_END_MS}ms`} calcMode="spline" keySplines={EASE_OUT_SPLINE} fill="freeze" />
            </circle>
            <circle r={hostRadius} fill={BADGE_TEXT_COLOR} opacity={0}>
              <animate attributeName="opacity" values={`0;${FLASH_OPACITY_PEAK};0`} keyTimes="0;0.5;1" begin={`ring-r-${csid}.begin`} dur={`${PHASE_PULSE_END_MS}ms`} fill="freeze" />
            </circle>
          </g>
        )
      })}
    </>
  )
}

function badgeCenter(radius: number) {
  const o = badgeOffset(radius)
  return { cx: o.x, cy: o.y }
}

interface MinimapProps {
  nodes: readonly GraphNode[]
  positions: ReadonlyMap<string, Point>
  bbox: { minX: number; minY: number; width: number; height: number }
  rectRef: (el: SVGRectElement | null) => void
  onRectPointerDown: (e: React.PointerEvent<SVGRectElement>) => void
  onRectPointerMove: (e: React.PointerEvent<SVGRectElement>) => void
  onRectPointerUp: (e: React.PointerEvent<SVGRectElement>) => void
}

/** 8.9: bottom-right, 150px wide, the full graph in miniature with a draggable viewport rectangle — a fixed presentational scale computed once from the same bbox zoom-to-fit uses, so "what you see in the minimap" and "what fit-to-view frames" always agree. */
function Minimap({ nodes, positions, bbox, rectRef, onRectPointerDown, onRectPointerMove, onRectPointerUp }: MinimapProps) {
  const scale = MINIMAP_WIDTH_PX / bbox.width
  const height = Math.min(220, Math.max(60, bbox.height * scale))
  return (
    <div
      className="absolute overflow-hidden"
      style={{
        bottom: SPACE_16,
        right: SPACE_16,
        width: MINIMAP_WIDTH_PX,
        height,
        background: BG_SECONDARY,
        border: `1px solid ${BORDER_MEDIUM}`,
        borderRadius: RADIUS_CARD,
      }}
    >
      <svg width={MINIMAP_WIDTH_PX} height={height} style={{ display: 'block' }}>
        {nodes.map((n) => {
          const pos = positions.get(n.id)
          if (!pos) return null
          return <circle key={n.id} cx={(pos.x - bbox.minX) * scale} cy={(pos.y - bbox.minY) * scale} r={1.2} fill={baseColorFor(n)} />
        })}
        <rect ref={rectRef} fill={ACCENT_BLUE} fillOpacity={0.12} stroke={ACCENT_BLUE} strokeWidth={1} style={{ cursor: 'move' }} onPointerDown={onRectPointerDown} onPointerMove={onRectPointerMove} onPointerUp={onRectPointerUp} />
      </svg>
    </div>
  )
}
