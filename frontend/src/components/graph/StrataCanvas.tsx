// 8.13.2: Strata — the mountain in cross-section under a microscope.
// Altitude bands are tissue layers (graph/strataLayout.ts, generated from
// the real expedition camp/altitude sequence, never hardcoded to five).
// Climbers are cells inside them, binned by their own real altitude
// reading. Cell anatomy (membrane + cytoplasm + organelles) is the SAME
// construction Network uses (graph/nodeVisuals.ts's organelleOffsets) —
// this file adds only what's genuinely Strata-specific: the layer stack
// itself, organic noise boundaries, internal texture, and the
// stress-encoded breathing pulse (graph/strataVisuals.ts).
//
// Mounts independently of NetworkView — its own useDataset()+
// buildGraphView() call, the same shape NetworkView.tsx already uses, so
// switching to Strata never shows stale or empty data regardless of
// whether Network happens to be mounted.
//
// Pan/zoom/minimap/zoom-stack/reset mirror GraphCanvas.tsx's own
// imperative-ref, no-React-state-per-frame pattern, biased for a vertical
// stack: default zoom fits all layers vertically with 10% padding; zoom
// range 0.6x-2.5x; pan is vertically free but horizontal is clamped to
// ±15% of the canvas's own width around centre, since there's little
// reason to pan far sideways into empty space either side of the stack.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from 'react'
import { useDataset } from '../../ase/store'
import { MOVEMENT_ALTITUDES_M, MOVEMENT_CAMPS } from '../../ase/identityCard'
import { buildGraphView, type GraphEdge, type GraphNode, type GraphNodeStatus } from '../../graph/adapter'
import { contributingSourceIds, nearestAncestorOfType, READABLE_READINESS, ropePartnerOf } from '../../graph/panelFields'
import { altitudeTicks, buildStrataLayers, expandedLayerBounds, layerForAltitude, totalSpanM, type StrataLayer } from '../../graph/strataLayout'
import { propertiesChanged, type LiveGraphEvent } from '../../graph/liveGraphState'
import {
  isAllCriticalLayer,
  strataAllCriticalFill,
  strataBandAccentColor,
  strataBandGradientStops,
  strataBandTintHex,
  strataBoundaryAmplitude,
  strataBoundaryPoints,
  strataCellRadiusPx,
  strataEmptyLayerFill,
  strataLayerFillColor,
  strataStressTierFor,
  strataTextureDensity,
  strataTextureFamily,
  pointsToPath,
  CELL_PULSE_BY_STATUS,
  MEMBRANE_BY_STATUS,
  MEMBRANE_UNKNOWN,
  STRESS_TIER_CYCLE_MS,
  STRESS_TIER_LABEL,
  STRESS_TIER_STROKE_WIDTH,
  type StrataStressTier,
} from '../../graph/strataVisuals'
import {
  densityTierForTotalClimbers,
  evenSpreadX,
  isTeamStretched,
  layoutLeaves,
  medianAltitudeM,
  organicEdgeCurve,
  routeAccentColor,
  shouldClusterTeam,
  teamAccentColor,
  teamAltitudeSpanM,
  CLUSTER_SIZE_MULTIPLIER,
  type DensityTier,
  type LeafPlacementInput,
} from '../../graph/descentTree'
import { averageReadinessWord, predictionSplitForLayer, sourcesForLayer, degradedSourceCount } from '../../graph/strataPanelFields'
import { computeVisibleLabels, type LabelCandidate } from '../../graph/labelCollision'
import { STATUS_COLOR, truncateLabel } from '../../graph/nodeVisuals'
import type { PageLayoutMode, StrataStatusFilter } from '../../graph/types'
import { ZoomControls } from './ZoomControls'
import { StrataLegend } from './StrataLegend'
import {
  ACCENT_BLUE,
  ACCENT_PURPLE,
  ACCENT_RED,
  BADGE_TEXT_COLOR,
  BG_PRIMARY,
  BG_SECONDARY,
  BG_TERTIARY,
  BORDER_LIGHT,
  BORDER_MEDIUM,
  CELL_VESICLE,
  RADIUS_BUTTON,
  RADIUS_CARD,
  SHADOW_MEDIUM,
  SHADOW_SOFT_FILTER,
  SPACE_8,
  SPACE_16,
  STRATA_BOUNDARY,
  STRATA_BOUNDARY_HOVER,
  STRATA_TINT_SELECT,
  STRATA_TINT_STRESS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  TYPE_ANCHOR_NAME,
  TYPE_ANCHOR_RANGE,
  TYPE_BODY_ROW,
  TYPE_GUTTER_TICK,
  TYPE_PANEL_HEADING,
  TYPE_PANEL_SUBHEADING,
  TYPE_RESET_VIEW,
  TYPE_STAT_LABEL,
  TYPE_STAT_VALUE,
  TYPE_TIMESTAMP,
} from '../../graph/tokens'

const ZOOM_MIN = 0.6
const ZOOM_MAX = 2.5
const ZOOM_ANIMATION_MS = 400
const FIT_PADDING_FRACTION = 0.1
// 8.13-V.1: "120px, canvas-left, fixed... the gutter does not [move when the
// window widens]." Horizontal panning was removed entirely — the main
// canvas's own horizontal scale is now a plain "fill whatever's left of the
// gutter" computation (see applyTransform), so there is never any
// horizontal overflow to pan into and never a dead white margin either
// side.
const GUTTER_WIDTH_PX = 120
const ALTITUDE_TICK_STEP_M = 500
const TEXTURE_ZOOM_THRESHOLD = 1.2
const MINIMAP_WIDTH_PX = 180
const MINIMAP_HEIGHT_PX = 130
const CELL_BASE_RADIUS_PX = 8 // 8.13-V.2: base 16px diameter (was 14) — strataCellRadiusPx scales this by real sensor-count tier: 16/19/22px
const HARD_CELL_CAP = 200 // 8.13.5 PERFORMANCE: past this many cells on screen at once, simplify — circles only, organelles dropped first
const CELL_LABEL_FONT_PX = 10 // "10px/500 --text-secondary" per the 1.0-1.5x label tier
const WORLD_WIDTH = 900
const PX_PER_METER = 0.42

// -- 8.13-V.2 THE DESCENT TREE ------------------------------------------
const ROOT_RADIUS_PX = 17 // 34px diameter
const ROUTE_RADIUS_PX = 13 // 26px
const TEAM_RADIUS_PX = 10 // 20px
const ROOT_MARGIN_ABOVE_STACK_PX = 44 // "single node at the top of the canvas" — sits above the topmost real layer
const ROUTE_FALLBACK_Y_FRACTION = 0.12 // "12% down the canvas if it has none" — no route in this dataset carries a real base altitude
const TEAM_LANE_WIDTH_PX = 130 // how wide a route's own teams may spread around it
const NUTRIENT_PULSE_CYCLE_MS = 4000
const NUTRIENT_PULSE_SEGMENT_PX = 40

// -- 8.13.4: live-update animation timings — the ENTRY (800ms) and
// boundary-wipe (600ms) durations live only in graph/interactions.css
// (`.graph-strata-cell-enter-wrap`/`.graph-strata-boundary-enter-wrap`),
// since JS only ever toggles the class, never drives those durations
// itself — no JS constant would be referenced, so none is declared here.
const CELL_REMOVE_DURATION_MS = 500 // 300ms shrink + 200ms overlapping fade
const NEW_CELL_SETTLE_MS = 600
const LAYER_FLASH_MS = 200

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

interface LaidOutLayer extends StrataLayer {
  yTop: number
  yBottom: number
}

interface Cell {
  node: GraphNode
  /** 8.13-V.2: the real team (operator) this leaf hangs from — drives its stem's colour gradient and lets a click/hover reach back to the team branch. Null only in the disclosed edge case of a climber with no real operator parent at all. */
  teamId: string | null
  x: number
  /** 8.13-V.1/V.2: exactly f(real altitude) via the SAME altitudeToY the bands themselves use — "non-negotiable," never adjusted for layout. */
  y: number
  radiusPx: number
  status: GraphNodeStatus | null
  /** 8.13.4: "cell spawns at the layer centre, drifts to its force-directed position over 600ms." True for CELL_NEW_SETTLE_MS after a real 'added' live event. 8.13-V.2: the spawn origin is now the climber's own real team branch, not a layer centre. */
  isNew: boolean
  /** 8.13.4: "cell shrinks to 0 over 300ms, fading over the overlapping final 200ms." Still rendered (at its last real position) purely to play this exit animation, then dropped. */
  removing: boolean
}

/** ≤1.0x: no labels, hover-tooltip only. 1.0-1.5x: REQUIRES_DESCENT labelled, others hover-only. >1.5x: everyone labelled, REQUIRES_DESCENT gets the full name + badge. */
type LabelZoomTier = 'far' | 'mid' | 'near'
function labelTierForZoom(zoom: number): LabelZoomTier {
  return zoom <= 1.0 ? 'far' : zoom <= 1.5 ? 'mid' : 'near'
}

export interface StrataCanvasHandle {
  resetView: () => void
  /** Same "detail panel drives graph selection from outside" shape GraphCanvasHandle already offers — no-ops if the id isn't a real climber (Strata has nothing else to select). */
  selectNodeExternally: (nodeId: string) => void
  deselectAllExternally: () => void
  /** "Clicking Camp III from a cell returns to layer selection without collapsing the layer" — clears the cell only. */
  deselectCellKeepLayer: () => void
}

export interface StrataCanvasProps {
  onViewChanged?: (isDefault: boolean) => void
  onSelectionChanged?: (selectedNodes: GraphNode[]) => void
  onLayerSelectionChanged?: (layer: StrataLayer | null) => void
  onGraphDataChanged?: (nodes: GraphNode[], edges: GraphEdge[]) => void
  /** 8.13.3: "ONE filter system, in the left panel... persists across layer selection and across a view switch" — owned by GraphNext.tsx, applied here to real cell opacity/pulse/desaturation. Retired from the UI (the left panel no longer has a control that sets this away from 'all' — see the Country -> Status -> Climbers browser instead), kept only so this prop's own dormant plumbing doesn't need ripping out of every cell render below. */
  statusFilter?: StrataStatusFilter
  /** 8.13.4: real added/statusChanged/removed events, same shape NetworkView.tsx already reports — feeds the SAME left-panel Recent Activity feed, no new plumbing on the GraphNext side. */
  onLiveEventsChanged?: (events: readonly LiveGraphEvent[]) => void
  /** 8.13.5 RESPONSIVE: 'sheet'/'mobile' hide the legend + minimap ("steal no canvas width" at a width that can't afford them) and reduce boundary wobble at 'mobile' ("layers stack with reduced boundary wobble"). Defaults to 'full' so every existing call site keeps working unchanged. */
  layoutMode?: PageLayoutMode
  /** 8.13-ui: real country id from the left panel's own Country -> Status -> Climbers browser (GlobalDashboard.tsx). Nothing selected -> the descent tree doesn't render at all, only the altitude bands/gutter ("layers of levels," not every climber on every route at once); selecting a country renders ONLY that country's real routes/expeditions/climbers. */
  selectedCountryId?: string | null
}

export const StrataCanvas = forwardRef<StrataCanvasHandle, StrataCanvasProps>(function StrataCanvas(
  { onViewChanged, onSelectionChanged, onLayerSelectionChanged, onGraphDataChanged, statusFilter = 'all', onLiveEventsChanged, layoutMode = 'full', selectedCountryId = null },
  ref,
) {
  const { dataset, tick } = useDataset()
  // `tick` drives recomputation on the real live-tick, same reasoning as NetworkView.tsx's own memo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { nodes, edges } = useMemo(() => buildGraphView(dataset), [dataset, tick])

  useEffect(() => {
    onGraphDataChanged?.(nodes, edges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  const [reducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [legendExpanded, setLegendExpanded] = useState(false)
  const [labelZoomTier, setLabelZoomTier] = useState<LabelZoomTier>('far')

  // 8.13.4: "ENTRY FROM NETWORK / ENTRY FROM TERRAIN — 800ms." Both origins
  // converge on the SAME Strata-side arrival: cells flatten + colour-shift
  // + settle, layer boundaries wipe in from the bottom. This view mounts
  // fresh every time a user switches TO Strata (Network/StrataCanvas are
  // separately-mounted components, not a shared persistent canvas), so
  // "entering" starts true on every mount and clears once, 800ms later —
  // real, disclosed simplification: it does not literally carry a cell's
  // last on-screen Network/Terrain pixel position across the component
  // boundary (that would need new cross-component position plumbing this
  // block doesn't add); it plays the SAME settle motion regardless of
  // which view was showing a moment ago.
  // Standard CSS-enter-transition trick: paint ONCE with the "entering"
  // (flattened/desaturated/clipped) class applied, then remove it on the
  // very next frame — the CSS `transition: 800ms`/`600ms` declarations
  // themselves provide the real duration from there. (Removing the class
  // only after an 800ms setTimeout would mean the transition doesn't even
  // START until 800ms in, finishing at 1600ms — the opposite of what's
  // wanted.)
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    if (reducedMotion) {
      setEntering(false)
      return
    }
    const raf = requestAnimationFrame(() => setEntering(false))
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion])

  // 8.13-V.3 ENTRY: "the tree grows downward from the root: root fades in,
  // then routes, then teams, then leaves, each generation staggered 200ms
  // ... bands and gutter are already present before the tree starts." The
  // band wipe above already owns 0-600ms; the tree's own four generations
  // start only once that's done, each firing 200ms after the last —
  // 600/800/1000/1200ms — so the whole sequence (the last generation's own
  // 400-600ms reveal included) lands under 2s total, with a skip control
  // mirroring GraphCanvas.tsx's own established pattern for its intro.
  // Reduced motion replaces the whole staged sequence with a single flat
  // 300ms fade of the entire tree (treeReducedMotionVisible) — stage still
  // jumps straight to fully-settled underneath so no edge is left
  // mid-draw, only invisible until that one fade finishes.
  const TREE_ENTRY_STAGE_TIMES_MS = [600, 800, 1000, 1200]
  const [treeEntryStage, setTreeEntryStage] = useState(0)
  const [treeReducedMotionVisible, setTreeReducedMotionVisible] = useState(false)
  useEffect(() => {
    if (reducedMotion) {
      setTreeReducedMotionVisible(false)
      setTreeEntryStage(4)
      const raf = requestAnimationFrame(() => setTreeReducedMotionVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    // Selecting a different country swaps in a whole new tree — replay the
    // staged grow-in for it, same as the very first mount, rather than
    // leaving it sitting at whatever stage the PREVIOUS country's tree
    // finished at.
    setTreeEntryStage(0)
    // Monotonic max: a timer firing after the user has already clicked
    // "Skip animation" (stage 4) must never regress the stage back down —
    // it was still pending, not cancelled, when the click resolved.
    const timers = TREE_ENTRY_STAGE_TIMES_MS.map((ms, i) => window.setTimeout(() => setTreeEntryStage((s) => Math.max(s, i + 1)), ms))
    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, selectedCountryId])
  const skipTreeEntry = useCallback(() => setTreeEntryStage(4), [])

  // -- real layer stack + real climber binning ---------------------------
  // altitudeToY is exposed alongside `layers` (not just baked into each
  // layer's own yTop/yBottom) so 8.13-V.1's altitude gutter can map its own
  // 500m tick marks — which don't fall on any layer boundary — through the
  // exact same real altitude->pixel function, never a second one.
  const { base: baseLayers, worldHeight, altitudeToY } = useMemo(() => {
    const base = buildStrataLayers(MOVEMENT_CAMPS, MOVEMENT_ALTITUDES_M)
    const span = totalSpanM(base)
    const height = span * PX_PER_METER
    const fn = (m: number) => height - (m - (base[0]?.floorM ?? 0)) * PX_PER_METER
    return { base, worldHeight: height, altitudeToY: fn }
  }, [])
  const layers: LaidOutLayer[] = useMemo(
    () => baseLayers.map((l) => ({ ...l, yTop: altitudeToY(l.ceilingM), yBottom: altitudeToY(l.floorM) })),
    [baseLayers, altitudeToY],
  )

  const climberNodes = useMemo(() => nodes.filter((n) => n.type === 'climber'), [nodes])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  // 8.13-ui: the descent tree's own real climber set — scoped to the
  // selected country (real country->route->operator->climber ancestry, the
  // same chain every drill-down in this app already walks), EMPTY (not
  // "everyone") when nothing is selected. `climbersByLayer` below stays on
  // the unscoped `climberNodes` — band/gutter counts are a real, separate
  // altitude-only fact that doesn't change just because the tree is hidden.
  const treeClimberNodes = useMemo(
    () => (selectedCountryId ? climberNodes.filter((c) => nearestAncestorOfType(c, 'country', nodeById)?.id === selectedCountryId) : []),
    [climberNodes, nodeById, selectedCountryId],
  )

  // 8.13-V.1 ALTITUDE GUTTER: real 500m ticks across the WHOLE stack's real
  // span, generic over stepM (altitudeTicks itself is; this call just uses
  // the spec's own 500m cadence).
  const altitudeTickValues = useMemo(
    () => (baseLayers.length === 0 ? [] : altitudeTicks(baseLayers[0].floorM, baseLayers[baseLayers.length - 1].ceilingM, ALTITUDE_TICK_STEP_M)),
    [baseLayers],
  )

  // -- selection + hover state (declared ahead of layout so `cells` can
  // depend on the SELECTED layer's expanded bounds) ------------------------
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | null>(null)
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null)
  const [hoveredLayerIndex, setHoveredLayerIndex] = useState<number | null>(null)

  // -- layer tooltip: 200ms hover delay, follows the cursor ----------------
  const [layerTooltip, setLayerTooltip] = useState<{ x: number; y: number } | null>(null)
  const layerTooltipTimerRef = useRef<number | null>(null)

  function handleLayerMouseEnter(index: number) {
    setHoveredLayerIndex(index)
  }
  function handleLayerMouseMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    const x = e.clientX - (rect?.left ?? 0)
    const y = e.clientY - (rect?.top ?? 0)
    if (layerTooltip) {
      setLayerTooltip({ x, y })
    } else if (layerTooltipTimerRef.current === null) {
      layerTooltipTimerRef.current = window.setTimeout(() => {
        layerTooltipTimerRef.current = null
        setLayerTooltip({ x, y })
      }, 200)
    }
  }
  function handleLayerMouseLeave() {
    setHoveredLayerIndex(null)
    if (layerTooltipTimerRef.current !== null) {
      window.clearTimeout(layerTooltipTimerRef.current)
      layerTooltipTimerRef.current = null
    }
    setLayerTooltip(null)
  }

  // 8.13.3: "the layer expands vertically 20%, pushing adjacent layers
  // rather than overlapping them." targetLayers is the CURRENT real bounds
  // (rest, or expanded when a layer is selected) — cells lay out against
  // these directly, so their positions are always real, recomputed
  // coordinates ("redistribute via the force simulation, not by scaling"),
  // never a scaled copy of their rest position. The layer's own fill/
  // boundary visual, rendered separately below, animates the DIFFERENCE
  // between rest and target via a CSS transform — see the render section.
  const targetLayers = useMemo(() => expandedLayerBounds(layers, selectedLayerIndex, 0.2), [layers, selectedLayerIndex])

  function radiusOf(node: GraphNode): number {
    return strataCellRadiusPx(CELL_BASE_RADIUS_PX, contributingSourceIds(node).length)
  }
  function realAltitudeOf(node: GraphNode): number | null {
    const v = node.properties.currentAltitudeM?.value
    return typeof v === 'number' ? v : null
  }

  // -- 8.13-V.2 THE DESCENT TREE: real route/team(operator)/climber data ---
  // "TEAM" maps onto the real operator tier (graph/adapter.ts's own
  // country -> route -> operator -> climber chain) — the closest real
  // grouping this dataset has between a route and an individual climber,
  // not a fabricated concept. See graph/descentTree.ts's own header.
  const climberCountByParentId = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of treeClimberNodes) {
      if (!c.parentId) continue
      map.set(c.parentId, (map.get(c.parentId) ?? 0) + 1)
    }
    return map
  }, [treeClimberNodes])
  // "one node per ACTIVE route" / active team — real climbers currently on it, never every route the ontology happens to define.
  const activeTeams = useMemo(() => nodes.filter((n) => n.type === 'operator' && (climberCountByParentId.get(n.id) ?? 0) > 0), [nodes, climberCountByParentId])
  const activeRouteIds = useMemo(() => new Set(activeTeams.map((t) => t.parentId).filter((id): id is string => !!id)), [activeTeams])
  const activeRoutes = useMemo(() => nodes.filter((n) => n.type === 'route' && activeRouteIds.has(n.id)), [nodes, activeRouteIds])

  const routeBranches = useMemo(() => {
    const sorted = [...activeRoutes].sort((a, b) => (a.id < b.id ? -1 : 1))
    const xs = evenSpreadX(sorted.length, WORLD_WIDTH / 2, WORLD_WIDTH * 0.86)
    // "the route's base altitude, or 12% down the canvas if it has none" —
    // no route in this dataset carries a real base-altitude TracedValue
    // (altitude is a per-CLIMBER fact, not a per-route one), so every route
    // honestly takes the disclosed fallback the spec itself anticipates.
    const y = worldHeight * ROUTE_FALLBACK_Y_FRACTION
    return new Map(sorted.map((route, i) => [route.id, { id: route.id, label: route.label, x: xs[i], y, hue: routeAccentColor(route.id) }]))
  }, [activeRoutes, worldHeight])

  const teamBranches = useMemo(() => {
    const byRoute = new Map<string, GraphNode[]>()
    for (const team of activeTeams) {
      const routeId = team.parentId ?? ''
      if (!byRoute.has(routeId)) byRoute.set(routeId, [])
      byRoute.get(routeId)!.push(team)
    }
    const out = new Map<string, { id: string; label: string; routeId: string; x: number; y: number; hue: string; spanM: number; stretched: boolean; highestY: number; lowestY: number }>()
    for (const routeBranch of routeBranches.values()) {
      const teams = (byRoute.get(routeBranch.id) ?? []).sort((a, b) => (a.id < b.id ? -1 : 1))
      const xs = evenSpreadX(teams.length, routeBranch.x, TEAM_LANE_WIDTH_PX)
      teams.forEach((team, i) => {
        const teamClimberAltitudes = treeClimberNodes.filter((c) => c.parentId === team.id).map(realAltitudeOf).filter((a): a is number => a !== null)
        const median = medianAltitudeM(teamClimberAltitudes)
        const y = median !== null ? altitudeToY(median) : routeBranch.y + ROUTE_RADIUS_PX * 3
        const spanM = teamAltitudeSpanM(teamClimberAltitudes)
        const altitudesY = teamClimberAltitudes.map(altitudeToY)
        out.set(team.id, {
          id: team.id,
          label: team.label,
          routeId: routeBranch.id,
          x: xs[i],
          y,
          hue: teamAccentColor(routeBranch.id, team.id),
          spanM,
          stretched: isTeamStretched(spanM),
          highestY: altitudesY.length ? Math.min(...altitudesY) : y,
          lowestY: altitudesY.length ? Math.max(...altitudesY) : y,
        })
      })
    }
    return out
  }, [activeTeams, routeBranches, treeClimberNodes, altitudeToY])

  const rootBranch = useMemo(() => {
    const summitLayer = baseLayers[baseLayers.length - 1]
    const y = -ROOT_MARGIN_ABOVE_STACK_PX
    return { x: WORLD_WIDTH / 2, y, label: summitLayer?.name ?? 'Summit', altitudeM: summitLayer?.altitudeM ?? null }
  }, [baseLayers])

  const leafPositions = useMemo(() => {
    const inputs: LeafPlacementInput[] = treeClimberNodes.map((node) => {
      const team = node.parentId ? teamBranches.get(node.parentId) : undefined
      const altitude = realAltitudeOf(node)
      const y = altitude !== null ? altitudeToY(altitude) : (team?.y ?? worldHeight / 2)
      return { id: node.id, teamId: node.parentId ?? 'no-team', teamX: team?.x ?? WORLD_WIDTH / 2, altitudeY: y, radiusPx: radiusOf(node) }
    })
    return new Map(layoutLeaves(inputs).map((p) => [p.id, p]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeClimberNodes, teamBranches, altitudeToY, worldHeight])

  // 8.13-V.2: real live-tick diffing. Tree positions are now a PURE,
  // deterministic function of (id, real team, real altitude, real sensor
  // count) — none of which a live tick ever changes (tickOnce only ever
  // mutates source sync-age) — so, unlike the old per-layer scatter this
  // replaces, there is nothing to cache: recomputing leafPositions fresh
  // every render always reproduces the SAME coordinates. What still needs
  // tracking across renders is purely the LIVE-EVENT side: detecting a
  // real add/status-change/removal, and remembering a removed climber's
  // last real position long enough to play its exit animation (it's no
  // longer in climberNodes by the time it needs to shrink away).
  const prevClimberByIdRef = useRef<Map<string, GraphNode> | null>(null)
  const lastKnownPositionRef = useRef<Map<string, { x: number; y: number; radiusPx: number }>>(new Map())
  const removingCellsRef = useRef<Map<string, { node: GraphNode; x: number; y: number; radiusPx: number; removedAt: number }>>(new Map())
  const newCellIdsRef = useRef<Set<string>>(new Set())
  const prevSelectedCountryIdRef = useRef<string | null>(selectedCountryId)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  const { cells, liveEvents } = useMemo(() => {
    const currentById = new Map(treeClimberNodes.map((n) => [n.id, n]))
    const events: LiveGraphEvent[] = []
    // 8.13-ui: switching WHICH country's tree is showing is a UI-navigation
    // change, not a real backend add/remove — treated as a fresh start
    // (same as first mount) so it never floods Recent Activity with
    // spurious "removed"/"appeared" events for climbers who simply
    // scrolled out of the selected country, and never plays their
    // exit/entry animations for a change that isn't real.
    const countryChanged = prevSelectedCountryIdRef.current !== selectedCountryId
    prevSelectedCountryIdRef.current = selectedCountryId
    if (countryChanged) {
      removingCellsRef.current.clear()
      newCellIdsRef.current.clear()
    }
    const prev = countryChanged ? null : prevClimberByIdRef.current
    if (prev) {
      for (const [id, node] of currentById) {
        const p = prev.get(id)
        if (!p) {
          events.push({ kind: 'added', nodeId: id, at: Date.now() })
          newCellIdsRef.current.add(id)
        } else if (p.status !== node.status) {
          events.push({ kind: 'statusChanged', nodeId: id, fromStatus: p.status, toStatus: node.status, at: Date.now() })
        }
      }
      for (const [id, node] of prev) {
        if (!currentById.has(id) && !removingCellsRef.current.has(id)) {
          events.push({ kind: 'removed', nodeId: id, at: Date.now() })
          const lastPos = lastKnownPositionRef.current.get(id)
          if (lastPos) removingCellsRef.current.set(id, { node, x: lastPos.x, y: lastPos.y, radiusPx: lastPos.radiusPx, removedAt: performance.now() })
        }
      }
    }
    prevClimberByIdRef.current = currentById

    const out: Cell[] = []
    for (const node of treeClimberNodes) {
      const pos = leafPositions.get(node.id)
      if (!pos) continue
      lastKnownPositionRef.current.set(node.id, { x: pos.x, y: pos.y, radiusPx: radiusOf(node) })
      out.push({ node, teamId: node.parentId, x: pos.x, y: pos.y, radiusPx: radiusOf(node), status: node.status, isNew: newCellIdsRef.current.has(node.id), removing: false })
    }
    for (const entry of removingCellsRef.current.values()) {
      out.push({ node: entry.node, teamId: entry.node.parentId, x: entry.x, y: entry.y, radiusPx: entry.radiusPx, status: entry.node.status, isNew: false, removing: true })
    }
    return { cells: out, liveEvents: events }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeClimberNodes, leafPositions, selectedCountryId])

  // 8.13-ui: Recent Activity needs to keep flowing regardless of which
  // country is selected (or whether one is at all) — the diff above only
  // ever watches this country's own climbers, on purpose (it drives the
  // TREE's own spawn/removal animations, which have nothing to show for a
  // climber outside the current view). This is a SEPARATE, broader diff —
  // every real node, same "touched" detection NetworkView's own
  // useLiveGraphState already uses (propertiesChanged: did ANY property's
  // recordedAt move, e.g. a source's real 5s sync-age tick) — whose only
  // job is feeding the real activity feed, so it stays "ever changing"
  // even while parked on Strata with a single country open.
  const prevAllNodesByIdRef = useRef<Map<string, GraphNode> | null>(null)
  const activityEvents = useMemo(() => {
    const currentById = new Map(nodes.map((n) => [n.id, n]))
    const events: LiveGraphEvent[] = []
    const prev = prevAllNodesByIdRef.current
    if (prev) {
      for (const [id, n] of currentById) {
        const p = prev.get(id)
        if (!p) {
          events.push({ kind: 'added', nodeId: id, at: Date.now() })
        } else if (p.status !== n.status) {
          events.push({ kind: 'statusChanged', nodeId: id, fromStatus: p.status, toStatus: n.status, at: Date.now() })
        } else if (propertiesChanged(p, n)) {
          events.push({ kind: 'touched', nodeId: id, at: Date.now() })
        }
      }
      for (const [id] of prev) {
        if (!currentById.has(id)) events.push({ kind: 'removed', nodeId: id, at: Date.now() })
      }
    }
    prevAllNodesByIdRef.current = currentById
    return events
  }, [nodes])

  // Cleans up cells whose removal animation has finished — same pattern as
  // graph/liveGraphState.ts's own removal-cleanup effect.
  useEffect(() => {
    if (removingCellsRef.current.size === 0) return
    const timers: number[] = []
    for (const [id, entry] of removingCellsRef.current) {
      const elapsed = performance.now() - entry.removedAt
      const remaining = Math.max(0, CELL_REMOVE_DURATION_MS - elapsed)
      timers.push(
        window.setTimeout(() => {
          removingCellsRef.current.delete(id)
          forceUpdate()
        }, remaining),
      )
    }
    return () => timers.forEach((t) => window.clearTimeout(t))
  })

  // Clears the "still spawning" flag once the 600ms settle animation has had time to play.
  useEffect(() => {
    if (newCellIdsRef.current.size === 0) return
    const ids = [...newCellIdsRef.current]
    const t = window.setTimeout(() => {
      for (const id of ids) newCellIdsRef.current.delete(id)
      forceUpdate()
    }, NEW_CELL_SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [cells])

  // "Receiving layer flashes white, 200ms" on a real 'added' event — layer
  // resolved fresh from the new climber's own real altitude (positions no
  // longer carry a cached layerIndex the way the old scatter system did).
  const [flashingLayerIndices, setFlashingLayerIndices] = useState<ReadonlySet<number>>(new Set())
  useEffect(() => {
    const added = liveEvents.filter((e) => e.kind === 'added')
    if (added.length === 0) return
    const toFlash = new Set<number>()
    for (const e of added) {
      const node = climberNodes.find((n) => n.id === e.nodeId)
      const layer = node ? layerForAltitude(realAltitudeOf(node), layers) : null
      if (layer) toFlash.add(layer.index)
    }
    if (toFlash.size === 0) return
    setFlashingLayerIndices(toFlash)
    const t = window.setTimeout(() => setFlashingLayerIndices(new Set()), LAYER_FLASH_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvents])

  // Keeping a currently-selected cell's panel content fresh across a status
  // change + falling a removed selection back to layer detail (not the
  // dashboard) per 8.13.4's own rule — stays on the narrow, tree-scoped
  // diff, since "the selected cell" only ever exists within it.
  useEffect(() => {
    if (liveEvents.length === 0) return
    for (const e of liveEvents) {
      if (e.kind === 'statusChanged' && selectedCellId === e.nodeId) {
        const node = climberNodes.find((n) => n.id === e.nodeId)
        if (node) onSelectionChanged?.([node])
      }
      if (e.kind === 'removed' && selectedCellId === e.nodeId) {
        setSelectedCellId(null)
        onSelectionChanged?.([])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvents])

  // Real Recent Activity rows — the broad, whole-dataset diff above, so the
  // feed keeps flowing (real source syncs, any climber anywhere changing
  // status) regardless of which single country the tree currently shows.
  useEffect(() => {
    if (activityEvents.length === 0) return
    onLiveEventsChanged?.(activityEvents)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityEvents])

  // "which real climbers fall in this band" — for band-level aggregates
  // (stress tier, empty/all-critical detection, tooltip roster, gutter
  // counts) ONLY. Independent of the tree's own leaf positions (8.13-V.2:
  // a climber's rendered x/y no longer has anything to do with which band
  // it's binned into for these purposes — real altitude drives both,
  // separately).
  const climbersByLayer = useMemo(() => {
    const map = new Map<number, GraphNode[]>()
    for (const layer of layers) map.set(layer.index, [])
    for (const node of climberNodes) {
      const layer = layerForAltitude(realAltitudeOf(node), layers)
      if (layer) map.get(layer.index)?.push(node)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [climberNodes, layers])

  // 8.13.5 PERFORMANCE: "hard cap 200 cells at once. Past that... simplify
  // — circles only, no irregular outlines, organelles dropped first." This
  // expedition's real 50 climbers never approach the cap; real, dormant
  // handling, unchanged by the 8.13-V.2 tree rewrite.
  const simplifyCells = cells.filter((c) => !c.removing).length > HARD_CELL_CAP
  // 8.13-V.3 DENSITY: "never solve density by shrinking the cells" — keyed
  // off the tree's own real climber count (one country at a time now, so
  // even smaller than the old all-countries total); this expedition's real
  // per-country counts always land in the 'full' tier, the other two are
  // real, dormant handling (see graph/descentTree.ts's own header).
  const densityTier = densityTierForTotalClimbers(treeClimberNodes.length)

  const stressTierByLayer = useMemo(() => {
    const map = new Map<number, StrataStressTier>()
    for (const layer of layers) {
      const statuses = (climbersByLayer.get(layer.index) ?? []).map((c) => c.status)
      map.set(layer.index, strataStressTierFor(statuses))
    }
    return map
  }, [layers, climbersByLayer])

  // 8.13.5 ALL CRITICAL: "the only state in which Strata looks alarming" —
  // every real, currently-live climber in the layer is REQUIRES_DESCENT.
  const allCriticalByLayer = useMemo(() => {
    const map = new Map<number, boolean>()
    for (const layer of layers) {
      const statuses = (climbersByLayer.get(layer.index) ?? []).map((c) => c.status)
      map.set(layer.index, isAllCriticalLayer(statuses))
    }
    return map
  }, [layers, climbersByLayer])

  // -- cell labels: zoom-tier eligibility, then the SAME collision-avoidance
  // pass Network's own labels already use (graph/labelCollision.ts) so
  // "no label collision at 1.6x in the densest layer" is a reused
  // guarantee, not a second bespoke implementation.
  const visibleLabelIds = useMemo(() => {
    if (labelZoomTier === 'far') return new Set<string>()
    const eligible = labelZoomTier === 'mid' ? cells.filter((c) => c.status === 'REQUIRES_DESCENT') : cells
    const candidates: LabelCandidate[] = eligible.map((c) => ({
      id: c.node.id,
      label: cellLabelText(c, labelZoomTier),
      anchorX: c.x,
      anchorY: c.y + c.radiusPx + 4,
      fontSize: CELL_LABEL_FONT_PX,
      priority: c.status === 'REQUIRES_DESCENT' ? 2 : 1,
    }))
    return computeVisibleLabels(candidates)
  }, [cells, labelZoomTier])

  // 8.13.3: hover a cell -> its real rope partner (the only real "connected
  // cell" relationship this dataset has — "team members," plural, has no
  // real backend concept, so only the one genuine 1:1 relationship pulses)
  // pulses once, if that partner is itself rendered as a cell somewhere in
  // the stack.
  const hoveredNode = hoveredCellId ? cells.find((c) => c.node.id === hoveredCellId)?.node ?? null : null
  const connectedCellId = useMemo(() => {
    if (!hoveredNode) return null
    const partner = ropePartnerOf(hoveredNode, nodes, edges)
    if (!partner) return null
    return cells.some((c) => c.node.id === partner.id) ? partner.id : null
  }, [hoveredNode, nodes, edges, cells])

  function cellMatchesFilter(status: GraphNodeStatus | null): boolean {
    if (statusFilter === 'all') return true
    if (statusFilter === 'UNKNOWN') return status === null
    return status === statusFilter
  }

  const selectCell = useCallback(
    (node: GraphNode) => {
      const altitudeVal = node.properties.currentAltitudeM?.value
      const altitude = typeof altitudeVal === 'number' ? altitudeVal : null
      const layer = layerForAltitude(altitude, layers)
      if (!layer) return
      setSelectedLayerIndex(layer.index)
      setSelectedCellId(node.id)
      onLayerSelectionChanged?.(layer)
      onSelectionChanged?.([node])
    },
    [layers, onLayerSelectionChanged, onSelectionChanged],
  )

  const selectLayer = useCallback(
    (index: number) => {
      // "Clicking the same layer again... returns everything to rest."
      if (selectedLayerIndex === index) {
        setSelectedLayerIndex(null)
        setSelectedCellId(null)
        onLayerSelectionChanged?.(null)
        onSelectionChanged?.([])
        return
      }
      setSelectedLayerIndex(index)
      setSelectedCellId(null)
      onLayerSelectionChanged?.(layers[index] ?? null)
      onSelectionChanged?.([])
    },
    [layers, selectedLayerIndex, onLayerSelectionChanged, onSelectionChanged],
  )

  const deselectAll = useCallback(() => {
    setSelectedLayerIndex(null)
    setSelectedCellId(null)
    onLayerSelectionChanged?.(null)
    onSelectionChanged?.([])
  }, [onLayerSelectionChanged, onSelectionChanged])

  // "Clicking the same layer again, clicking empty canvas, or Escape
  // returns everything to rest." A document-level listener, same reasoning
  // as GraphCanvas.tsx's own Escape handler — a dispatchEvent-driven click
  // (used to work around a Playwright/SVG pointer-capture quirk) doesn't
  // trigger native click-to-focus, so a React onKeyDown scoped to this
  // container could miss Escape entirely depending on where focus landed.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') deselectAll()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [deselectAll])

  const deselectCellKeepLayer = useCallback(() => {
    setSelectedCellId(null)
    onSelectionChanged?.([])
  }, [onSelectionChanged])

  // -- pan/zoom (imperative, mirrors GraphCanvas.tsx's own pattern) --------
  // 8.13-ui FIX: this used to render `scale(scaleX, zoom)` — INDEPENDENT
  // X/Y factors, X permanently stretched to fill whatever width was left
  // of the gutter, Y driven by the interactive zoom. That was invisible
  // while every shape here was an organic blob, but the node-link redesign
  // (real circles for Node, real squares for Leaf) made it obvious: any
  // time those two factors differed, circles rendered as ellipses and
  // squares as rectangles — "squished." Zoom is now ALWAYS uniform.
  // `scaleXRef` keeps its old job — a live "fill the real pixel width left
  // of the 120px gutter" base scale, recomputed from the container's
  // actual width on every transform — but it's now the BASE the
  // interactive `zoom` multiplies from (1 = exactly fills the width, same
  // as before), applied identically to both axes: `effectiveScale =
  // scaleXRef.current * zoom`. Panning is genuinely 2D now (x added
  // alongside y) — a uniform zoom that only ever fit the WIDTH would leave
  // no way to reach content that scrolls past the right/left edge once
  // zoomed in past 1x, the same reason vertical panning already existed
  // for content taller than the viewport.
  const containerRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<SVGGElement>(null)
  const panZoomRef = useRef({ x: 0, y: 0, zoom: 1 })
  const scaleXRef = useRef(1)
  const isDefaultRef = useRef(true)
  const draggingRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const zoomAnimRafRef = useRef<number | null>(null)
  const minimapRectRef = useRef<SVGRectElement>(null)
  const gutterElementsRef = useRef<Map<string, SVGGElement>>(new Map())
  const [zoomedInPast1_2, setZoomedInPast1_2] = useState(false)

  function computeScaleX(containerWidthPx: number): number {
    return Math.max(0.01, (containerWidthPx - GUTTER_WIDTH_PX) / WORLD_WIDTH)
  }

  function currentEffectiveScale(): number {
    return scaleXRef.current * panZoomRef.current.zoom
  }

  const applyTransform = useCallback(() => {
    const g = groupRef.current
    const container = containerRef.current
    if (g && container) {
      const { x, y, zoom } = panZoomRef.current
      scaleXRef.current = computeScaleX(container.getBoundingClientRect().width)
      const effectiveScale = scaleXRef.current * zoom
      g.setAttribute('transform', `translate(${GUTTER_WIDTH_PX + x}, ${y}) scale(${effectiveScale})`)
    }
    updateMinimapRect()
    updateGutterPositions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateMinimapRect() {
    const rectEl = minimapRectRef.current
    const container = containerRef.current
    if (!rectEl || !container || worldHeight === 0) return
    const { y } = panZoomRef.current
    const { height: ch } = container.getBoundingClientRect()
    const effectiveScale = currentEffectiveScale()
    const scaleY = MINIMAP_HEIGHT_PX / worldHeight
    const vy = (-y / effectiveScale) * scaleY
    const vh = (ch / effectiveScale) * scaleY
    // Deliberately vertical-only, same scope this minimap has always had —
    // horizontal panning is real now (zooming in past 1x needs somewhere
    // to pan), but this small a strip has no real room to also show a
    // horizontal viewport slice without becoming unreadable.
    rectEl.setAttribute('x', '0')
    rectEl.setAttribute('y', String(vy))
    rectEl.setAttribute('width', String(MINIMAP_WIDTH_PX))
    rectEl.setAttribute('height', String(Math.max(1, vh)))
  }

  /** 8.13-V.1 ALTITUDE GUTTER: ticks/camp-anchors are NOT nested inside the zoom-scaled `groupRef` (their text would stretch vertically along with the layer stack) — each is its own ref'd `<g>`, translated (never scaled) to its current real screen Y, kept in sync here alongside the minimap on every pan/zoom frame. Mirrors updateMinimapRect's own imperative-DOM-write pattern exactly. */
  function updateGutterPositions() {
    const { y } = panZoomRef.current
    const effectiveScale = currentEffectiveScale()
    for (const el of gutterElementsRef.current.values()) {
      const worldY = Number(el.dataset.worldY)
      if (Number.isNaN(worldY)) continue
      el.setAttribute('transform', `translate(0, ${y + worldY * effectiveScale})`)
    }
  }

  /** Registers a gutter tick/anchor `<g>` for the imperative position sync above — a stable key (so the same real altitude/camp keeps the same DOM node across renders) plus its own fixed world Y (real altitude, mapped through the SAME altitudeToY the layer stack itself uses). */
  function gutterRef(key: string, worldY: number) {
    return (el: SVGGElement | null) => {
      if (el) {
        el.dataset.worldY = String(worldY)
        gutterElementsRef.current.set(key, el)
        el.setAttribute('transform', `translate(0, ${panZoomRef.current.y + worldY * currentEffectiveScale()})`)
      } else {
        gutterElementsRef.current.delete(key)
      }
    }
  }

  function checkDefaultChanged() {
    const { x, y, zoom } = panZoomRef.current
    const fit = computeFitTransform()
    const nowDefault = Math.abs(x - fit.x) < 0.5 && Math.abs(y - fit.y) < 0.5 && Math.abs(zoom - fit.zoom) < 0.001
    if (nowDefault !== isDefaultRef.current) {
      isDefaultRef.current = nowDefault
      onViewChanged?.(nowDefault)
    }
  }

  function computeFitTransform(): { x: number; y: number; zoom: number } {
    const container = containerRef.current
    if (!container || worldHeight === 0) return { x: 0, y: 0, zoom: 1 }
    const { width: cw, height: ch } = container.getBoundingClientRect()
    // The root sits ABOVE y=0 (rootBranch.y is negative) — fitting only
    // [0, worldHeight] crops the root's own square off the top the moment
    // a country is selected. Fit the real span that includes it instead.
    const spanTop = Math.min(0, rootBranch.y - ROOT_RADIUS_PX - 20)
    const span = worldHeight - spanTop
    // `zoom` is a MULTIPLIER on the width-filling base scale (see the pan/
    // zoom header comment above) — 1 means "exactly fills the width, real
    // vertical scale whatever that naturally is." Solve for the multiplier
    // that makes the EFFECTIVE (base * zoom) scale fit the real vertical
    // span, not an absolute scale value directly.
    const desiredScale = (ch * (1 - FIT_PADDING_FRACTION * 2)) / span
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scaleXRef.current > 0 ? desiredScale / scaleXRef.current : 1))
    const effectiveScale = scaleXRef.current * zoom
    // TOP-anchored, not centred: this dataset's real altitude range is
    // usually taller than ZOOM_MIN can shrink to fit whole — centring the
    // full span means "the peaks... top" (root/routes, the headline of the
    // per-country tree) land off the top edge exactly as often as the
    // bottom camps run off the bottom. Anchoring the top of the real span
    // to a small screen margin instead means the root and every route are
    // ALWAYS on screen the moment a country is selected; only the lowest
    // camps may need a scroll, which is the honest trade real content of
    // this height requires.
    const y = FIT_PADDING_FRACTION * ch - spanTop * effectiveScale
    // At zoom=1 (multiplier), the base scale fills the real width exactly
    // and no horizontal offset is needed. Below 1 — the common case, since
    // a tall real altitude span usually needs to shrink past 1x to fit
    // vertically, and shrinking is now uniform on both axes — the tree
    // no longer reaches the right edge on its own; centre it in the real
    // available width rather than leaving it jammed against the gutter.
    const availableWidth = Math.max(0, cw - GUTTER_WIDTH_PX)
    const contentWidth = WORLD_WIDTH * effectiveScale
    const x = Math.max(0, (availableWidth - contentWidth) / 2)
    return { x, y, zoom }
  }

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
      if (t < 1) {
        zoomAnimRafRef.current = requestAnimationFrame(step)
      } else {
        zoomAnimRafRef.current = null
        setZoomedInPast1_2(panZoomRef.current.zoom > TEXTURE_ZOOM_THRESHOLD)
        setLabelZoomTier(labelTierForZoom(panZoomRef.current.zoom))
        checkDefaultChanged()
      }
    }
    zoomAnimRafRef.current = requestAnimationFrame(step)
  }

  /** Zooms toward the viewport centre, in BOTH axes (uniform scale means a real world point under the centre before the step must land back under it after — same "anchor a real point, don't just change scale" rule the wheel handler below already follows). */
  function computeZoomStepTransform(stepFactor: number): { x: number; y: number; zoom: number } {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0, zoom: 1 }
    const { width: cw, height: ch } = container.getBoundingClientRect()
    const current = panZoomRef.current
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current.zoom * stepFactor))
    const oldScale = scaleXRef.current * current.zoom
    const newScale = scaleXRef.current * newZoom
    const dataX = (cw / 2 - GUTTER_WIDTH_PX - current.x) / oldScale
    const dataY = (ch / 2 - current.y) / oldScale
    return { zoom: newZoom, x: cw / 2 - GUTTER_WIDTH_PX - dataX * newScale, y: ch / 2 - dataY * newScale }
  }

  function zoomIn() {
    animatePanZoomTo(computeZoomStepTransform(1.3))
  }
  function zoomOut() {
    animatePanZoomTo(computeZoomStepTransform(1 / 1.3))
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const { x, y, zoom } = panZoomRef.current
    // Plain vertical scroll (or pinch, which browsers report as wheel+deltaY)
    // zooms; a trackpad's two-finger horizontal swipe (deltaX) pans without
    // zooming — the same split any normal map/canvas view uses.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
      panZoomRef.current = { x: x - e.deltaX, y, zoom }
      applyTransform()
      checkDefaultChanged()
      return
    }
    const factor = Math.min(1.15, Math.max(0.85, 1 - e.deltaY * 0.0016))
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor))
    const oldScale = scaleXRef.current * zoom
    const newScale = scaleXRef.current * nextZoom
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const worldX = (cx - GUTTER_WIDTH_PX - x) / oldScale
    const worldY = (cy - y) / oldScale
    panZoomRef.current = { zoom: nextZoom, x: cx - GUTTER_WIDTH_PX - worldX * newScale, y: cy - worldY * newScale }
    applyTransform()
    checkDefaultChanged()
    setZoomedInPast1_2(nextZoom > TEXTURE_ZOOM_THRESHOLD)
    setLabelZoomTier(labelTierForZoom(nextZoom))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // no-op — capture is an optimisation, not a correctness requirement
    }
    draggingRef.current = { startX: e.clientX, startY: e.clientY, originX: panZoomRef.current.x, originY: panZoomRef.current.y }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = draggingRef.current
    if (!drag) return
    panZoomRef.current.x = drag.originX + (e.clientX - drag.startX)
    panZoomRef.current.y = drag.originY + (e.clientY - drag.startY)
    applyTransform()
  }

  function handlePointerUp() {
    if (draggingRef.current) checkDefaultChanged()
    draggingRef.current = null
  }

  // "Reset: double-click empty canvas returns to default fit" — layers
  // fill nearly the entire canvas (unlike Network's scattered dot nodes),
  // so "empty" here means "not on a cell" (the thing double-click has a
  // DIFFERENT, more specific job for — selecting it), not "not on a
  // layer's own fill." A double-click on layer tissue with no cell under
  // the cursor always resets.
  function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as Element
    if (target.closest('[data-cell-id]')) return
    animatePanZoomTo(computeFitTransform())
  }

  const resetView = useCallback(() => {
    if (zoomAnimRafRef.current !== null) {
      cancelAnimationFrame(zoomAnimRafRef.current)
      zoomAnimRafRef.current = null
    }
    animatePanZoomTo(computeFitTransform())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldHeight])

  // 8.13-ui: selecting (or switching) a country swaps in a whole new tree —
  // auto-frame it the same way "Reset view" does, so the real routes/teams/
  // climbers that just appeared (and the root square above them, "the
  // peaks... top, in a square") are actually on screen, not left wherever
  // the camera happened to be sitting from a previous country or the
  // page's own initial {y:0, zoom:1}.
  useEffect(() => {
    if (selectedCountryId) resetView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountryId])

  useImperativeHandle(
    ref,
    () => ({
      resetView,
      selectNodeExternally(nodeId: string) {
        const node = climberNodes.find((n) => n.id === nodeId)
        if (node) selectCell(node)
      },
      deselectAllExternally: deselectAll,
      deselectCellKeepLayer,
    }),
    [resetView, climberNodes, selectCell, deselectAll, deselectCellKeepLayer],
  )

  useEffect(() => {
    const t = computeFitTransform()
    panZoomRef.current = t
    applyTransform()
    isDefaultRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldHeight])

  // 8.13-V.1 WIDTH: "if the window widens, the tree spreads" — scaleX is
  // live container width, not a value computed once at mount, so a real
  // resize (not just a zoom/pan gesture) has to explicitly re-apply the
  // transform too. y/zoom are left untouched — only the horizontal fill
  // recomputes.
  useEffect(() => {
    function onResize() {
      applyTransform()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [applyTransform])

  // -- minimap interaction (vertical only — see the WIDTH comment above) --
  const minimapDragRef = useRef<{ startY: number; originY: number; moved: boolean } | null>(null)

  function handleMinimapPointerDown(e: React.PointerEvent<SVGRectElement | SVGSVGElement>) {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    minimapDragRef.current = { startY: e.clientY, originY: panZoomRef.current.y, moved: false }
  }

  function handleMinimapPointerMove(e: React.PointerEvent<SVGRectElement | SVGSVGElement>) {
    const drag = minimapDragRef.current
    if (!drag) return
    const dy = e.clientY - drag.startY
    if (Math.abs(dy) > 2) drag.moved = true
    const scaleY = MINIMAP_HEIGHT_PX / worldHeight
    panZoomRef.current.y = drag.originY - (dy / scaleY) * currentEffectiveScale()
    applyTransform()
  }

  function handleMinimapPointerUp() {
    if (minimapDragRef.current) checkDefaultChanged()
    minimapDragRef.current = null
  }

  function handleMinimapClick(e: React.MouseEvent<SVGSVGElement>) {
    if (minimapDragRef.current?.moved) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const my = e.clientY - rect.top
    const scaleY = MINIMAP_HEIGHT_PX / worldHeight
    const worldY = my / scaleY
    const container = containerRef.current
    if (!container) return
    const { height: ch } = container.getBoundingClientRect()
    const { x, zoom } = panZoomRef.current
    animatePanZoomTo({ x, zoom, y: ch / 2 - worldY * currentEffectiveScale() })
  }

  // 8.13.5 NO ROUTE DEFINITION: "the canvas shows the message; the left
  // panel still shows the global dashboard" — layers.length === 0 is real,
  // general handling (buildStrataLayers([], []) === [] is unit-tested in
  // strataLayout.test.ts), currently dormant since the one real expedition
  // this app has always has a real 6-camp route defined.
  if (layers.length === 0) {
    return (
      <div ref={containerRef} className="relative flex h-full w-full items-center justify-center" style={{ background: BG_PRIMARY }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <p style={{ ...TYPE_PANEL_HEADING, marginBottom: SPACE_8 }}>No altitude data available.</p>
          <p style={{ ...TYPE_PANEL_SUBHEADING, marginBottom: SPACE_16 }}>Define route in expedition settings.</p>
          <div className="flex items-center justify-center" style={{ gap: SPACE_8, marginBottom: SPACE_8 }}>
            <button type="button" style={noRouteButtonStyle(true)} onClick={() => {}}>
              Import Route from GPS
            </button>
            <button type="button" style={noRouteButtonStyle(false)} onClick={() => {}}>
              Define Manually
            </button>
          </div>
          <p style={{ ...TYPE_TIMESTAMP }}>Not wired to a destination yet — no route-import flow exists in this build.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden graph-strata-canvas-draggable"
      style={{ background: BG_PRIMARY, touchAction: 'none' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => {
        if (!(e.target as Element).closest('[data-cell-id],[data-layer-index]')) deselectAll()
      }}
    >
      <svg width="100%" height="100%" role="img" aria-label="Strata — altitude cross-section">
        <StrataDefs />

        {/* 8.13-V.1 ALTITUDE GUTTER — 120px, canvas-left, fixed. Deliberately
            OUTSIDE groupRef: it never pans/zooms horizontally, and its own
            text must never be vertically stretched by the layer stack's
            zoom scale, so every element in here is either unscaled (the
            axis line, sized off the real SVG viewport) or individually
            translate-synced to the current pan/zoom via gutterRef/
            updateGutterPositions — never nested inside a scaled <g>. */}
        <rect x={0} y={0} width={GUTTER_WIDTH_PX} height="100%" fill={BG_PRIMARY} />
        <line x1={GUTTER_WIDTH_PX - 1} y1={0} x2={GUTTER_WIDTH_PX - 1} y2="100%" stroke={BORDER_MEDIUM} strokeWidth={1} />
        {altitudeTickValues.map((m) => (
          <g key={`tick-${m}`} ref={gutterRef(`tick-${m}`, altitudeToY(m))}>
            <line x1={GUTTER_WIDTH_PX - 9} y1={0} x2={GUTTER_WIDTH_PX - 1} y2={0} stroke={BORDER_LIGHT} strokeWidth={1} />
            <text x={GUTTER_WIDTH_PX - 13} y={0} dy={3} textAnchor="end" style={{ ...TYPE_GUTTER_TICK, fill: TEXT_TERTIARY }}>
              {m.toLocaleString()}m
            </text>
          </g>
        ))}
        {layers.map((layer) => {
          const anchorAccentBase = strataBandAccentColor(layer.index, layers.length)
          const anchorCells = climbersByLayer.get(layer.index) ?? []
          const anchorIsEmpty = anchorCells.length === 0
          const anchorIsAllCritical = allCriticalByLayer.get(layer.index) ?? false
          const anchorAccent = anchorIsEmpty ? strataEmptyLayerFill(anchorAccentBase) : anchorIsAllCritical ? strataAllCriticalFill(anchorAccentBase) : anchorAccentBase
          const anchorHovered = hoveredLayerIndex === layer.index
          const anchorStressTier = stressTierByLayer.get(layer.index) ?? 'calm'
          const rangeLabel = layer.isOpenEnded ? `${layer.floorM.toLocaleString()}m+` : `${layer.floorM.toLocaleString()}–${layer.ceilingM.toLocaleString()}m`
          return (
            <g
              key={`anchor-${layer.index}`}
              ref={gutterRef(`anchor-${layer.index}`, layer.yTop)}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => handleLayerMouseEnter(layer.index)}
              onMouseLeave={handleLayerMouseLeave}
              onClick={(e) => {
                e.stopPropagation()
                selectLayer(layer.index)
              }}
            >
              {anchorHovered && <rect x={0} y={0} width={GUTTER_WIDTH_PX} height={48} fill={BG_SECONDARY} />}
              <rect x={0} y={0} width={GUTTER_WIDTH_PX} height={anchorHovered ? 4 : 3} fill={anchorAccent} style={{ transition: 'height 150ms ease-out' }} />
              <text x={SPACE_8} y={16} style={{ ...TYPE_ANCHOR_NAME }}>
                {layer.name}
              </text>
              <text x={SPACE_8} y={28} style={{ ...TYPE_ANCHOR_RANGE }}>
                {rangeLabel}
              </text>
              <g transform={`translate(${GUTTER_WIDTH_PX - 26}, 6)`}>
                <rect x={0} y={0} width={20} height={16} rx={8} fill={BG_TERTIARY} />
                <text x={10} y={11} textAnchor="middle" style={{ ...TYPE_STAT_LABEL, fill: TEXT_SECONDARY }}>
                  {anchorCells.length}
                </text>
              </g>
              {/* 8.13-V.3 REDUCED MOTION: "static per-band stress labels in the gutter, exactly as 8.13.1 specified" — moved out of the band itself (V.1/V.2 already retired the in-band camp name the same way) into the one real anchor every band already has here. */}
              {reducedMotion && (
                <text x={SPACE_8} y={40} style={{ ...TYPE_STAT_LABEL, fill: TEXT_SECONDARY }}>
                  {STRESS_TIER_LABEL[anchorStressTier]}
                </text>
              )}
            </g>
          )
        })}

        <g ref={groupRef} data-strata-world="true">
          <rect x={0} y={0} width={WORLD_WIDTH} height={Math.max(worldHeight, 1)} fill={BG_PRIMARY} />
          {layers.map((layer, i) => {
            const lowerBoundarySeed = i === 0 ? null : `${layers[i - 1].name}->${layer.name}`
            const upperBoundarySeed = i === layers.length - 1 ? null : `${layer.name}->${layers[i + 1].name}`
            // 8.13.5 RESPONSIVE: "<768px: layers stack with reduced boundary
            // wobble" — same deterministic curve, smaller amplitude, so a
            // narrow mobile stack doesn't read as chaotic.
            const wobbleScale = layoutMode === 'mobile' ? 0.5 : 1
            const lowerAmp = lowerBoundarySeed ? strataBoundaryAmplitude(lowerBoundarySeed, wobbleScale) : 0
            const upperAmp = upperBoundarySeed ? strataBoundaryAmplitude(upperBoundarySeed, wobbleScale) : 0
            const upperPoints = upperBoundarySeed
              ? strataBoundaryPoints({ seed: upperBoundarySeed, widthPx: WORLD_WIDTH, baseY: layer.yTop, amplitudePx: upperAmp })
              : [
                  [0, layer.yTop],
                  [WORLD_WIDTH, layer.yTop],
                ]
            const lowerPoints = lowerBoundarySeed
              ? strataBoundaryPoints({ seed: lowerBoundarySeed, widthPx: WORLD_WIDTH, baseY: layer.yBottom, amplitudePx: lowerAmp })
              : [
                  [0, layer.yBottom],
                  [WORLD_WIDTH, layer.yBottom],
                ]
            const fillPath = pointsToPath(upperPoints as [number, number][]) + ' ' + pointsToPath([...lowerPoints].reverse() as [number, number][]).replace('M', 'L') + ' Z'
            const isHoveredLayer = hoveredLayerIndex === layer.index
            const isEmpty = (climbersByLayer.get(layer.index) ?? []).length === 0
            const isAllCritical = allCriticalByLayer.get(layer.index) ?? false
            // 8.13-V.1 BANDS: "the bands are now background, and background
            // has to be quiet and still visible." The band's own accent
            // (strataBandAccentColor — the SAME saturated hue camp anchors
            // use, never the near-white pastel that made the original bands
            // unreadable) composes with the existing empty/all-critical
            // edge cases exactly as it did before this block, then blends
            // into a real two-stop gradient — full strength at the gutter
            // edge, fading to 40% by 35% width, flat thereafter. Hover
            // boosts the alpha fraction rather than lightness (there's no
            // "lightness" left to brighten on an already-white-blended
            // tint) — "the anchor and its band highlight together."
            const bandAccent = strataBandAccentColor(layer.index, layers.length)
            const layerAccent = isEmpty ? strataEmptyLayerFill(bandAccent) : isAllCritical ? strataAllCriticalFill(bandAccent) : bandAccent
            const bandAlpha = (isEmpty ? 0.06 : 0.1) * (isHoveredLayer ? 1.3 : 1)
            const bandGradientId = `strata-band-gradient-${layer.index}`
            const { full: bandFillFull, faded: bandFillFaded } = strataBandGradientStops(layerAccent, bandAlpha)
            const fill = `url(#${bandGradientId})`
            const stressTier = stressTierByLayer.get(layer.index) ?? 'calm'
            const isSelected = selectedLayerIndex === layer.index
            const isDimmedByExpansion = selectedLayerIndex !== null && !isSelected
            const isStressed = stressTier === 'danger'
            const textureFamily = strataTextureFamily(layer.index, layers.length)
            const textureDensity = strataTextureDensity(layer.index, layers.length)

            // 8.13.3: "the layer expands vertically 20%, pushing adjacent
            // layers rather than overlapping them" — the VISUAL (fill/
            // boundary/texture) group animates via a CSS transform between
            // its rest geometry and the current targetLayers geometry;
            // cells (siblings, not inside this transformed group) already
            // carry their own real recomputed coordinates so they're never
            // scaled/distorted by it.
            const target = targetLayers[i]
            let visualTransform = 'none'
            if (selectedLayerIndex !== null) {
              if (i === selectedLayerIndex) {
                const restHeight = layer.yBottom - layer.yTop
                const targetHeight = target.yBottom - target.yTop
                visualTransform = `scaleY(${(targetHeight / Math.max(1, restHeight)).toFixed(4)})`
              } else if (i < selectedLayerIndex) {
                visualTransform = `translateY(${(target.yTop - layer.yTop).toFixed(2)}px)`
              }
            }

            return (
              <g
                key={layer.name}
                data-layer-index={layer.index}
                style={{ opacity: isDimmedByExpansion ? 0.6 : 1, transition: 'opacity 400ms ease-out' }}
                onClick={(e) => {
                  e.stopPropagation()
                  selectLayer(layer.index)
                }}
                onMouseEnter={() => handleLayerMouseEnter(layer.index)}
                onMouseMove={handleLayerMouseMove}
                onMouseLeave={handleLayerMouseLeave}
              >
                <g
                  className={reducedMotion ? undefined : 'graph-strata-layer'}
                  style={{
                    ...(reducedMotion
                      ? {}
                      : ({
                          // 8.13.5 ALL CRITICAL: "pulse amplitude ±6px" — the
                          // one escalation past the existing 8.13.1 danger
                          // tier's own 4px, reserved for every real climber
                          // in the layer being REQUIRES_DESCENT at once.
                          ['--strata-amplitude' as string]: isAllCritical ? '6px' : isStressed ? '4px' : '2px',
                          animationDuration: `${STRESS_TIER_CYCLE_MS[stressTier]}ms`,
                          animationDelay: `${layer.index * 300}ms`,
                        } as React.CSSProperties)),
                    transform: visualTransform,
                    transformBox: 'view-box',
                    transformOrigin: `0px ${layer.yTop}px`,
                    // 8.13.4 ENTRY: boundaries "materialise, wiping in from
                    // the bottom over 600ms" — clip-path sweeps from fully
                    // hidden to fully visible on mount, composed with the
                    // 8.13.3 expansion transform already here. Reduced-motion
                    // renders permanently unclipped and skips the transition
                    // entirely — `entering` still flips true->false under the
                    // hood (see the mount effect above) but must never be
                    // allowed to animate, only to settle instantly.
                    clipPath: reducedMotion ? 'none' : entering ? 'inset(100% -20% -20% -20%)' : 'inset(-20% -20% -20% -20%)',
                    transition: reducedMotion ? 'transform 400ms ease-out' : 'transform 400ms ease-out, clip-path 600ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <defs>
                    <linearGradient id={bandGradientId} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={bandFillFull} />
                      <stop offset="35%" stopColor={bandFillFaded} />
                      <stop offset="100%" stopColor={bandFillFaded} />
                    </linearGradient>
                  </defs>
                  <path d={fillPath} fill={fill} stroke="none" style={{ transition: 'fill 150ms ease-out' }} />
                  {isSelected && <path d={fillPath} fill={STRATA_TINT_SELECT} stroke="none" />}
                  {isStressed && (
                    <path
                      d={fillPath}
                      fill={STRATA_TINT_STRESS}
                      stroke="none"
                      className={reducedMotion ? undefined : 'graph-strata-stress-wash'}
                      style={reducedMotion ? { opacity: 0 } : { animationDuration: `${STRESS_TIER_CYCLE_MS[stressTier]}ms`, animationDelay: `${layer.index * 300}ms` }}
                    />
                  )}
                  {/* 8.13.5 ALL CRITICAL: "5% red alarm haze" — a flat, static overlay (not animated — the pulse amplitude already carries the escalation) on top of the already-shifted fill. */}
                  {isAllCritical && <path d={fillPath} fill={ACCENT_RED} fillOpacity={0.05} stroke="none" />}
                  {zoomedInPast1_2 && !reducedMotion && (
                    <path d={fillPath} fill={`url(#strata-texture-${textureFamily})`} opacity={textureDensity * 10} stroke="none" />
                  )}
                  {upperBoundarySeed && (
                    <path
                      d={pointsToPath(upperPoints as [number, number][])}
                      fill="none"
                      stroke={isHoveredLayer ? STRATA_BOUNDARY_HOVER : STRATA_BOUNDARY}
                      strokeWidth={reducedMotion ? STRESS_TIER_STROKE_WIDTH[stressTier] : isHoveredLayer ? 2.5 : 1.5}
                      strokeOpacity={0.55}
                      filter="url(#strata-rough)"
                      style={{ transition: 'stroke-width 150ms ease-out, stroke 150ms ease-out' }}
                    />
                  )}
                  {/* between-layer medium: a subtle gradient wash just above the lower boundary, reading as "stacked" rather than floating */}
                  {lowerBoundarySeed && (
                    <path d={pointsToPath(lowerPoints as [number, number][])} fill="none" stroke="url(#strata-medium-gradient)" strokeWidth={10} strokeOpacity={0.5} />
                  )}

                  {/* 8.13.4 NEW CLIMBER: "receiving layer flashes white, 200ms." */}
                  {flashingLayerIndices.has(layer.index) && <path d={fillPath} fill="white" className="graph-strata-layer-flash" style={reducedMotion ? { opacity: 0 } : undefined} />}
                </g>

                {/* 8.13-V.1: the camp name used to float here at 10px grey — "effectively invisible." It now lives in the altitude gutter as a real anchor (name/range/count), not inside the band at all. */}

                {/* 8.13.5 EMPTY LAYER: "centred label — the layer is still alive." Selecting an empty layer still fills the left panel with real (zeroed) stat grids — LayerDetailPanel.tsx already renders "0" rather than falling back to an empty-state view, so no panel-side change was needed for this. */}
                {isEmpty && (
                  <text x={WORLD_WIDTH / 2} y={(target.yTop + target.yBottom) / 2} textAnchor="middle" style={{ ...TYPE_STAT_LABEL, fill: TEXT_TERTIARY }}>
                    No climbers at this altitude
                  </text>
                )}
              </g>
            )
          })}

          {/* 8.13-ui: "if Nepal isn't selected the map should only show
              layers of levels" — the descent tree only renders once a real
              country is selected from the left panel's own Country ->
              Status -> Climbers browser. Nothing selected means nothing
              here at all, not even the symbolic root — just the altitude
              bands above/below this block. */}
          {selectedCountryId && (
            <DescentTree
              rootBranch={rootBranch}
              routeBranches={[...routeBranches.values()]}
              teamBranches={[...teamBranches.values()]}
              cells={cells}
              nodes={nodes}
              edges={edges}
              reducedMotion={reducedMotion}
              entryStage={treeEntryStage}
              treeReducedMotionVisible={treeReducedMotionVisible}
              simplifyCells={simplifyCells}
              densityTier={densityTier}
              selectedCellId={selectedCellId}
              hoveredCellId={hoveredCellId}
              connectedCellId={connectedCellId}
              labelZoomTier={labelZoomTier}
              visibleLabelIds={visibleLabelIds}
              cellMatchesFilter={cellMatchesFilter}
              onHoverCell={setHoveredCellId}
              onSelectCell={(node) => {
                selectCell(node)
              }}
            />
          )}
        </g>
      </svg>

      {/* "never an empty state" — a bare band stack with no direction reads
          as broken, not clean. Fixed screen-space (unlike the tree itself,
          this hint has no real position to pan/zoom to — it always centres
          on whatever's currently in view), non-interactive. */}
      {!selectedCountryId && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `calc(50% + ${GUTTER_WIDTH_PX / 2}px)`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            ...TYPE_STAT_LABEL,
            color: TEXT_TERTIARY,
          }}
        >
          Select a country on the left to view its climbers
        </div>
      )}

      {hoveredLayerIndex !== null && layerTooltip && (
        <LayerTooltip
          layer={layers[hoveredLayerIndex]}
          climbers={climbersByLayer.get(hoveredLayerIndex) ?? []}
          allNodes={nodes}
          x={layerTooltip.x}
          y={layerTooltip.y}
        />
      )}

      {/* 8.13.5 RESPONSIVE: "legend hidden, minimap hidden" at sheet/mobile widths — they float over the canvas and steal no layout width even today, but at these widths there isn't room to read them without covering real cells. */}
      {layoutMode !== 'sheet' && layoutMode !== 'mobile' && (
        <StrataLegend
          expanded={legendExpanded}
          onToggle={() => setLegendExpanded((v) => !v)}
          layerRows={layers.map((l) => ({ name: l.name, tier: stressTierByLayer.get(l.index) ?? 'calm' }))}
          reducedMotion={reducedMotion}
        />
      )}
      {/* 8.13-V.3 ENTRY: "total under 2s, with the existing skip control" — mirrors GraphCanvas.tsx's own established skip-the-intro button. */}
      {!reducedMotion && treeEntryStage < 4 && (
        <button
          type="button"
          onClick={skipTreeEntry}
          style={{
            ...TYPE_RESET_VIEW,
            position: 'absolute',
            bottom: SPACE_16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: BG_SECONDARY,
            border: `1px solid ${BORDER_MEDIUM}`,
            borderRadius: RADIUS_BUTTON,
            padding: `${SPACE_8}px ${SPACE_16}px`,
            cursor: 'pointer',
          }}
        >
          Skip animation
        </button>
      )}
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
      {layoutMode !== 'sheet' && layoutMode !== 'mobile' && (
        <StrataMinimap
          layers={layers}
          worldHeight={worldHeight}
          rectRef={minimapRectRef}
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
          onPointerUp={handleMinimapPointerUp}
          onClick={handleMinimapClick}
        />
      )}
    </div>
  )
})

interface RouteBranch {
  id: string
  label: string
  x: number
  y: number
  hue: string
}

interface TeamBranch {
  id: string
  label: string
  routeId: string
  x: number
  y: number
  hue: string
  spanM: number
  stretched: boolean
  highestY: number
  lowestY: number
}

/** 8.13-V.2 THE DESCENT TREE — root/route/team/leaf, drawn together because
 * their edges connect them: rope-partner arcs first (furthest back), then
 * the three real edge tiers (root->route, route->team, team->leaf), then
 * nodes on top. Leaves reuse StrataCell verbatim (its shape/pulse/spasm/
 * entry/cross-fade logic is unchanged by this block — only WHERE a leaf
 * sits changed, not how it's drawn); root/route/team are new, simpler
 * "branch" nodes sharing one TierBranchNode shell.
 */
function DescentTree({
  rootBranch,
  routeBranches,
  teamBranches,
  cells,
  nodes,
  edges,
  reducedMotion,
  entryStage,
  treeReducedMotionVisible,
  simplifyCells,
  densityTier,
  selectedCellId,
  hoveredCellId,
  connectedCellId,
  labelZoomTier,
  visibleLabelIds,
  cellMatchesFilter,
  onHoverCell,
  onSelectCell,
}: {
  rootBranch: { x: number; y: number; label: string; altitudeM: number | null }
  routeBranches: RouteBranch[]
  teamBranches: TeamBranch[]
  cells: Cell[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  reducedMotion: boolean
  /** 8.13-V.3 ENTRY: 0 = nothing yet, 1 = root, 2 = +routes, 3 = +teams, 4 = +leaves/fully settled. Ignored under reducedMotion (see treeReducedMotionVisible instead). */
  entryStage: number
  /** 8.13-V.3 REDUCED MOTION: "the entry sequence becomes a 300ms fade of the whole tree" — entryStage is already forced to 4 by the caller when reducedMotion is true, so every generation is structurally "settled"; this is the one remaining visible transition. */
  treeReducedMotionVisible: boolean
  simplifyCells: boolean
  densityTier: DensityTier
  selectedCellId: string | null
  hoveredCellId: string | null
  connectedCellId: string | null
  labelZoomTier: LabelZoomTier
  visibleLabelIds: Set<string>
  cellMatchesFilter: (status: GraphNodeStatus | null) => boolean
  onHoverCell: (id: string | null) => void
  onSelectCell: (node: GraphNode) => void
}) {
  const teamById = useMemo(() => new Map(teamBranches.map((t) => [t.id, t])), [teamBranches])
  const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null)
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null)

  // 8.13-V.3 DENSITY: real, dormant against this expedition's live 50
  // climbers (see graph/descentTree.ts's own header) — click-to-expand
  // overrides for both tiers, mirroring 8.13.5's already-established
  // cluster-expand pattern.
  const [expandedClusterTeamIds, setExpandedClusterTeamIds] = useState<ReadonlySet<string>>(new Set())
  const [expandedRouteIds, setExpandedRouteIds] = useState<ReadonlySet<string>>(new Set())
  const cellsByTeamId = useMemo(() => {
    const map = new Map<string, Cell[]>()
    for (const cell of cells) {
      if (!cell.teamId || cell.removing) continue
      if (!map.has(cell.teamId)) map.set(cell.teamId, [])
      map.get(cell.teamId)!.push(cell)
    }
    return map
  }, [cells])
  const clusteredTeamIds = useMemo(() => {
    if (densityTier === 'full') return new Set<string>()
    const set = new Set<string>()
    for (const [teamId, teamCells] of cellsByTeamId) {
      if (!expandedClusterTeamIds.has(teamId) && shouldClusterTeam(teamCells.length)) set.add(teamId)
    }
    return set
  }, [cellsByTeamId, densityTier, expandedClusterTeamIds])
  const collapsedRouteIds = useMemo(() => {
    if (densityTier !== 'route-collapse') return new Set<string>()
    return new Set(routeBranches.filter((r) => !expandedRouteIds.has(r.id)).map((r) => r.id))
  }, [routeBranches, densityTier, expandedRouteIds])
  const climberCountByRouteId = useMemo(() => {
    const map = new Map<string, number>()
    for (const team of teamBranches) map.set(team.routeId, (map.get(team.routeId) ?? 0) + (cellsByTeamId.get(team.id)?.length ?? 0))
    return map
  }, [teamBranches, cellsByTeamId])

  // "rope partner: wide arc... this is the connection the current view has
  // no way to show at all." Dedupe each real pair to one arc (draw only
  // from the lexicographically-first id) — ropePartnerOf is symmetric, so
  // without this both directions would draw the same arc twice.
  // 8.13-V.3 DENSITY: a rope pair only draws when BOTH real leaves are
  // actually rendered — a partner hidden behind a team cluster or a
  // collapsed route has no visible endpoint to arc to, and an arc with a
  // dangling end is worse than no arc at all.
  const isLeafRendered = useMemo(
    () => (cell: Cell) => {
      if (!cell.teamId) return false
      const team = teamById.get(cell.teamId)
      if (!team) return false
      return !collapsedRouteIds.has(team.routeId) && !clusteredTeamIds.has(cell.teamId)
    },
    [teamById, collapsedRouteIds, clusteredTeamIds],
  )
  const ropePairs = useMemo(() => {
    const cellById = new Map(cells.filter((c) => !c.removing && isLeafRendered(c)).map((c) => [c.node.id, c]))
    const pairs: { a: Cell; b: Cell }[] = []
    for (const cell of cellById.values()) {
      const partner = ropePartnerOf(cell.node, nodes, edges)
      if (!partner) continue
      const partnerCell = cellById.get(partner.id)
      if (!partnerCell || cell.node.id >= partner.id) continue
      pairs.push({ a: cell, b: partnerCell })
    }
    return pairs
  }, [cells, nodes, edges, isLeafRendered])
  const ropePartnerIdByLeafId = useMemo(() => {
    const map = new Map<string, string>()
    for (const { a, b } of ropePairs) {
      map.set(a.node.id, b.node.id)
      map.set(b.node.id, a.node.id)
    }
    return map
  }, [ropePairs])

  // "A nutrient pulse travels root -> leaves every 4s, one branch at a
  // time, cycling." Cycles through the real root->route edges — the
  // topmost, always-present tier every real route has, so the cycle never
  // depends on how many teams/climbers a given route happens to have.
  const [pulseRouteIndex, setPulseRouteIndex] = useState(0)
  useEffect(() => {
    if (reducedMotion || routeBranches.length === 0) return
    const t = window.setInterval(() => setPulseRouteIndex((i) => (i + 1) % routeBranches.length), NUTRIENT_PULSE_CYCLE_MS)
    return () => window.clearInterval(t)
  }, [reducedMotion, routeBranches.length])

  // 8.13-V.3 HOVER/SELECT: "leaf: ...its full ancestor path — team, route,
  // root — stays bright, everything else dims to 0.25. team/route: its
  // entire subtree stays bright... select: the ancestor path holds bright."
  // Hover takes precedence over selection while active (a live pointer
  // beats a held state); falls back to the selection's own path once
  // nothing is hovered. ONE computed set drives every dim/bright decision
  // below — never a second, divergent notion of "related."
  const teamIdToRouteId = useMemo(() => new Map(teamBranches.map((t) => [t.id, t.routeId])), [teamBranches])
  const activeHighlight = useMemo(() => {
    if (hoveredCellId) {
      const cell = cells.find((c) => c.node.id === hoveredCellId)
      const routeId = cell?.teamId ? teamIdToRouteId.get(cell.teamId) : undefined
      return { leafIds: new Set([hoveredCellId]), teamIds: new Set(cell?.teamId ? [cell.teamId] : []), routeIds: new Set(routeId ? [routeId] : []) }
    }
    if (hoveredTeamId) {
      const leafIds = new Set(cells.filter((c) => c.teamId === hoveredTeamId).map((c) => c.node.id))
      const routeId = teamIdToRouteId.get(hoveredTeamId)
      return { leafIds, teamIds: new Set([hoveredTeamId]), routeIds: new Set(routeId ? [routeId] : []) }
    }
    if (hoveredRouteId) {
      const teamIds = new Set(teamBranches.filter((t) => t.routeId === hoveredRouteId).map((t) => t.id))
      const leafIds = new Set(cells.filter((c) => c.teamId && teamIds.has(c.teamId)).map((c) => c.node.id))
      return { leafIds, teamIds, routeIds: new Set([hoveredRouteId]) }
    }
    if (selectedCellId) {
      const cell = cells.find((c) => c.node.id === selectedCellId)
      const routeId = cell?.teamId ? teamIdToRouteId.get(cell.teamId) : undefined
      return { leafIds: new Set([selectedCellId]), teamIds: new Set(cell?.teamId ? [cell.teamId] : []), routeIds: new Set(routeId ? [routeId] : []) }
    }
    return null
  }, [hoveredCellId, hoveredTeamId, hoveredRouteId, selectedCellId, cells, teamBranches, teamIdToRouteId])
  const DIM_OPACITY = 0.25
  const dimmed = (inPath: boolean) => (activeHighlight !== null && !inPath ? DIM_OPACITY : 1)

  return (
    <g style={reducedMotion ? { opacity: treeReducedMotionVisible ? 1 : 0, transition: 'opacity 300ms ease-out' } : undefined}>
      <g aria-hidden="true" style={{ opacity: entryStage >= 4 ? 1 : 0, transition: 'opacity 200ms ease-out' }}>
        {ropePairs.map(({ a, b }) => {
          const dist = Math.hypot(b.x - a.x, b.y - a.y)
          const curve = organicEdgeCurve(a.x, a.y, b.x, b.y, `rope:${a.node.id}:${b.node.id}`, Math.max(24, dist * 0.35))
          const inPath = activeHighlight !== null && (activeHighlight.leafIds.has(a.node.id) || activeHighlight.leafIds.has(b.node.id))
          const isSelectedPair = selectedCellId === a.node.id || selectedCellId === b.node.id
          return (
            <path
              key={`rope-${a.node.id}-${b.node.id}`}
              d={curve.d}
              fill="none"
              stroke={ACCENT_PURPLE}
              strokeWidth={isSelectedPair ? 2 : 1}
              strokeOpacity={isSelectedPair ? 0.8 : 0.45}
              style={{ opacity: dimmed(inPath), transition: 'opacity 150ms ease-out, stroke-width 150ms ease-out, stroke-opacity 150ms ease-out' }}
            />
          )
        })}
      </g>

      <g aria-hidden="true">
        {routeBranches.map((route, i) => {
          const curve = organicEdgeCurve(rootBranch.x, rootBranch.y, route.x, route.y, `root->${route.id}`, 30)
          const gradId = `edge-root-route-${route.id}`
          const dist = Math.hypot(route.x - rootBranch.x, route.y - rootBranch.y)
          const drawn = entryStage >= 2
          const inPath = activeHighlight === null || activeHighlight.routeIds.has(route.id)
          return (
            <g key={route.id}>
              <defs>
                <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={rootBranch.x} y1={rootBranch.y} x2={route.x} y2={route.y}>
                  <stop offset="0%" stopColor={ACCENT_BLUE} />
                  <stop offset="100%" stopColor={route.hue} />
                </linearGradient>
              </defs>
              <path
                d={curve.d}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={3}
                strokeLinecap="round"
                pathLength={1}
                style={{
                  opacity: dimmed(inPath),
                  strokeDasharray: 1,
                  strokeDashoffset: drawn ? 0 : 1,
                  transition: 'stroke-dashoffset 400ms ease-out, opacity 150ms ease-out',
                }}
              />
              {!reducedMotion && entryStage >= 4 && pulseRouteIndex === i && <NutrientPulse pathD={curve.d} approxLength={dist} color={route.hue} />}
            </g>
          )
        })}
        {teamBranches.map((team) => {
          if (collapsedRouteIds.has(team.routeId)) return null
          const route = routeBranches.find((r) => r.id === team.routeId)
          if (!route) return null
          const curve = organicEdgeCurve(route.x, route.y, team.x, team.y, `${route.id}->${team.id}`, 20)
          const drawn = entryStage >= 3
          const inPath = activeHighlight === null || activeHighlight.teamIds.has(team.id)
          return (
            <path
              key={team.id}
              d={curve.d}
              fill="none"
              stroke={route.hue}
              strokeWidth={2.5}
              strokeOpacity={0.7}
              strokeLinecap="round"
              pathLength={1}
              style={{
                opacity: dimmed(inPath),
                strokeDasharray: 1,
                strokeDashoffset: drawn ? 0 : 1,
                transition: 'stroke-dashoffset 400ms ease-out, opacity 150ms ease-out',
              }}
            />
          )
        })}
        {cells.map((cell) => {
          const team = cell.teamId ? teamById.get(cell.teamId) : null
          if (!team) return null
          if (collapsedRouteIds.has(team.routeId) || (cell.teamId && clusteredTeamIds.has(cell.teamId))) return null
          const statusColor = cell.status ? STATUS_COLOR[cell.status] : CELL_VESICLE
          const gradId = `edge-leaf-${cell.node.id}`
          const isSelected = selectedCellId === cell.node.id
          const isFilteredOut = !cellMatchesFilter(cell.status)
          const inPath = activeHighlight === null || activeHighlight.leafIds.has(cell.node.id)
          // 8.13-V.3 REMOVAL: "leaf shrinks, stem retracts toward the team
          // node" — the stem's own END point animates from the leaf's last
          // real position back to the team's, over the SAME window the
          // leaf itself shrinks in (CELL_REMOVE_DURATION_MS), instead of
          // just vanishing the instant removal starts. A CSS `d` transition
          // between two paths is only reliable when both share the same
          // command structure — "M Q" before and after here, always, since
          // only the numbers change — unlike the circle<->star SHAPE morph
          // elsewhere in this file, which genuinely can't be interpolated
          // this way and uses a disclosed cross-fade instead.
          const endX = cell.removing ? team.x : cell.x
          const endY = cell.removing ? team.y : cell.y
          const curve = organicEdgeCurve(team.x, team.y, endX, endY, `stem:${cell.node.id}`, cell.removing ? 0 : 14)
          const drawn = entryStage >= 4
          return (
            <g
              key={cell.node.id}
              style={{
                opacity: cell.removing ? (dimmed(inPath) as number) * 1 : isFilteredOut ? 0.15 * dimmed(inPath) : dimmed(inPath),
                transition: cell.removing ? `opacity ${CELL_REMOVE_DURATION_MS}ms ease-in` : 'opacity 300ms ease',
              }}
            >
              <defs>
                <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={team.x} y1={team.y} x2={endX} y2={endY}>
                  <stop offset="0%" stopColor={team.hue} />
                  <stop offset="100%" stopColor={statusColor} />
                </linearGradient>
              </defs>
              <path
                d={curve.d}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={isSelected ? 3.5 : 2}
                strokeOpacity={isSelected ? 1 : 0.85}
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: drawn ? 0 : 1,
                  transition: cell.removing
                    ? `d ${CELL_REMOVE_DURATION_MS}ms ease-in, stroke-width 150ms ease-out, stroke-opacity 150ms ease-out`
                    : 'stroke-dashoffset 400ms ease-out, stroke-width 150ms ease-out, stroke-opacity 150ms ease-out',
                }}
              />
            </g>
          )
        })}
      </g>

      {/* "a team whose leaves span >600m gets a thin dashed vertical guide from its highest to its lowest leaf." */}
      {teamBranches
        .filter((t) => t.stretched)
        .map((team) => (
          <line key={`stretch-${team.id}`} x1={team.x} y1={team.highestY} x2={team.x} y2={team.lowestY} stroke={BORDER_MEDIUM} strokeWidth={1} strokeDasharray="4 3" />
        ))}

      <g style={{ opacity: entryStage >= 1 ? 1 : 0, transition: 'opacity 200ms ease-out' }}>
        <RootNode branch={rootBranch} />
      </g>
      {routeBranches.map((route) => (
        <g key={route.id} style={{ opacity: dimmed(activeHighlight === null || activeHighlight.routeIds.has(route.id)) * (entryStage >= 2 ? 1 : 0), transition: 'opacity 200ms ease-out' }}>
          <RouteNode branch={route} onHover={() => setHoveredRouteId(route.id)} onLeave={() => setHoveredRouteId(null)} />
        </g>
      ))}
      {teamBranches.map((team) => {
        if (collapsedRouteIds.has(team.routeId)) return null
        return (
          <g key={team.id} style={{ opacity: dimmed(activeHighlight === null || activeHighlight.teamIds.has(team.id)) * (entryStage >= 3 ? 1 : 0), transition: 'opacity 200ms ease-out' }}>
            <TeamNode branch={team} isHovered={hoveredTeamId === team.id} onHover={() => setHoveredTeamId(team.id)} onLeave={() => setHoveredTeamId(null)} />
          </g>
        )
      })}

      {/* 8.13-V.3 DENSITY: "teams with more than 8 climbers collapse to a cluster leaf sized x1.8... expanding on click." One cluster leaf stands in for the WHOLE team's real roster (not sub-grouped by status, unlike 8.13.5's now-superseded per-layer clustering). */}
      {[...clusteredTeamIds].map((teamId) => {
        const team = teamById.get(teamId)
        const teamCells = cellsByTeamId.get(teamId) ?? []
        if (!team || teamCells.length === 0) return null
        if (collapsedRouteIds.has(team.routeId)) return null
        const inPath = activeHighlight === null || activeHighlight.teamIds.has(teamId)
        return (
          <g key={`cluster-${teamId}`} style={{ opacity: dimmed(inPath) * (entryStage >= 4 ? 1 : 0), transition: 'opacity 200ms ease-out' }}>
            <ClusterLeaf team={team} count={teamCells.length} onExpand={() => setExpandedClusterTeamIds((prev) => new Set(prev).add(teamId))} />
          </g>
        )
      })}

      {/* 8.13-V.3 DENSITY: ">150: routes collapse; only the root, routes and cluster counts render until the user zooms or selects." A real per-route climber count badge, click to reveal that route's own teams/leaves again. */}
      {[...collapsedRouteIds].map((routeId) => {
        const route = routeBranches.find((r) => r.id === routeId)
        if (!route) return null
        const count = climberCountByRouteId.get(routeId) ?? 0
        return (
          <g
            key={`route-count-${routeId}`}
            data-route-count-badge={routeId}
            transform={`translate(${route.x + ROUTE_RADIUS_PX + 4}, ${route.y - ROUTE_RADIUS_PX - 4})`}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              setExpandedRouteIds((prev) => new Set(prev).add(routeId))
            }}
          >
            <rect x={0} y={0} width={Math.max(20, String(count).length * 8 + 12)} height={16} rx={8} fill={BG_TERTIARY} stroke={BORDER_MEDIUM} strokeWidth={1} />
            <text x={Math.max(20, String(count).length * 8 + 12) / 2} y={11} textAnchor="middle" style={{ ...TYPE_STAT_LABEL, fill: TEXT_SECONDARY }}>
              {count}
            </text>
          </g>
        )
      })}

      {cells.map((cell) => {
        const team = cell.teamId ? teamById.get(cell.teamId) : null
        if (team && (collapsedRouteIds.has(team.routeId) || (cell.teamId && clusteredTeamIds.has(cell.teamId)))) return null
        // 8.13-V.3 SELECT: "a selected leaf also brightens its rope-partner
        // arc and the partner node" — the partner gets the SAME persistent
        // glow hover-of-its-partner already gives it (isConnectedPulse),
        // never the scale-lock isSelected reserves for the ONE truly
        // selected leaf (two "selected-looking" cells at once would lie
        // about which one actually owns the open panel).
        const isPartnerOfSelected = selectedCellId !== null && ropePartnerIdByLeafId.get(selectedCellId) === cell.node.id
        const inPath = activeHighlight === null || activeHighlight.leafIds.has(cell.node.id)
        return (
          <StrataCell
            key={cell.node.id}
            cell={cell}
            isSelected={selectedCellId === cell.node.id}
            isHovered={hoveredCellId === cell.node.id}
            isConnectedPulse={connectedCellId === cell.node.id || isPartnerOfSelected}
            dimForOtherHover={!inPath}
            isFilteredOut={!cellMatchesFilter(cell.status)}
            showLabel={labelZoomTier === 'near' ? visibleLabelIds.has(cell.node.id) : labelZoomTier === 'mid' && cell.status === 'REQUIRES_DESCENT' ? visibleLabelIds.has(cell.node.id) : false}
            showHoverLabel={labelZoomTier === 'mid' && cell.status !== 'REQUIRES_DESCENT'}
            labelText={cellLabelText(cell, labelZoomTier)}
            showBadge={labelZoomTier === 'near' && cell.status === 'REQUIRES_DESCENT'}
            reducedMotion={reducedMotion}
            entering={entryStage < 4}
            simplify={simplifyCells}
            spawnOffset={cell.isNew && team ? { dx: team.x - cell.x, dy: team.y - cell.y } : null}
            onHover={onHoverCell}
            onSelect={(e) => {
              e.stopPropagation()
              onSelectCell(cell.node)
            }}
          />
        )
      })}
    </g>
  )
}

/** The shared shell every tier (root/route/team) is built from — "membrane white weight by tier, cytoplasm radial gradient light centre -> saturated hue at the edge, organelles 2-3 white dots asymmetric, shadow so cells sit above the bands." Leaves use StrataCell instead (their shape varies by status, which routes/teams never do). */
/** 8.13-ui: "Node" per the reference tree diagram — any branch point (root/route/team, everything with real children below it) is a plain flat circle, one uniform shape family regardless of tier. Flat fill (no gradient shine, no organelle texture) is deliberate: those read as "organic cell," not the clean, high-quality node-link diagram this is now matching. Only CLIMBERS (true leaves — nothing real branches below a climber) get the square treatment, in StrataCell below. */
function TierBranchNode({
  x,
  y,
  radius,
  color,
  membraneWidth,
  seed,
  label,
  onHover,
  onLeave,
  onClick,
}: {
  x: number
  y: number
  radius: number
  color: string
  membraneWidth: number
  seed: string
  label?: React.ReactNode
  onHover?: () => void
  onLeave?: () => void
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <g
      data-branch-id={seed}
      transform={`translate(${x.toFixed(2)}, ${y.toFixed(2)})`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      <circle r={radius} fill={color} stroke="white" strokeWidth={membraneWidth} style={{ filter: SHADOW_SOFT_FILTER }} />
      {label}
    </g>
  )
}

/** "single node at the top of the canvas, horizontally centred over the tree's span... label above: objective name and summit elevation, 13px/600." Symbolic — see graph/descentTree.ts's own header on why (14 real routes across 6 real countries, no single real physical objective to name). */
function RootNode({ branch }: { branch: { x: number; y: number; label: string; altitudeM: number | null } }) {
  return (
    <TierBranchNode
      x={branch.x}
      y={branch.y}
      radius={ROOT_RADIUS_PX}
      color={ACCENT_BLUE}
      membraneWidth={3}
      seed="root"
      label={
        <text y={-ROOT_RADIUS_PX - 10} textAnchor="middle" style={TYPE_STAT_VALUE}>
          {branch.label}
          {branch.altitudeM !== null ? ` · ${branch.altitudeM.toLocaleString()}m` : ''}
        </text>
      }
    />
  )
}

/** "label below the node, 12px/600, --text-primary." */
/** "the peaks in colour, top, in a square... clear node." The tree is now scoped to a single real country at a time (see `treeClimberNodes`), so a route's real label always has room — no collision-hiding needed the way 14-at-once used to require. */
function RouteNode({ branch, onHover, onLeave }: { branch: RouteBranch; onHover: () => void; onLeave: () => void }) {
  return (
    <TierBranchNode
      x={branch.x}
      y={branch.y}
      radius={ROUTE_RADIUS_PX}
      color={branch.hue}
      membraneWidth={2.5}
      seed={`route:${branch.id}`}
      onHover={onHover}
      onLeave={onLeave}
      label={
        <>
          {/* real route names run long ("Manaslu — Normal Route (Northeast Face)") and even a handful of them can crowd a narrow per-country tree — truncated for a clean, non-colliding label; the real full name is still one hover away. */}
          <text y={ROUTE_RADIUS_PX + 16} textAnchor="middle" style={TYPE_ANCHOR_NAME}>
            {truncateLabel(branch.label, 22)}
          </text>
          <title>{branch.label}</title>
        </>
      }
    />
  )
}

/** "label on hover only" — except a stretched team, whose label "becomes permanently visible with the span in metres." */
function TeamNode({ branch, isHovered, onHover, onLeave }: { branch: TeamBranch; isHovered: boolean; onHover: () => void; onLeave: () => void }) {
  const showLabel = isHovered || branch.stretched
  return (
    <TierBranchNode
      x={branch.x}
      y={branch.y}
      radius={TEAM_RADIUS_PX}
      color={branch.hue}
      membraneWidth={2}
      seed={`team:${branch.id}`}
      onHover={onHover}
      onLeave={onLeave}
      label={
        showLabel ? (
          <text y={TEAM_RADIUS_PX + 13} textAnchor="middle" style={{ ...TYPE_STAT_LABEL, fill: TEXT_SECONDARY }}>
            {branch.label}
            {branch.stretched ? ` · ${Math.round(branch.spanM)}m span` : ''}
          </text>
        ) : null
      }
    />
  )
}

/** 8.13-V.3 DENSITY: "teams with more than 8 climbers collapse to a cluster leaf sized x1.8, labelled 'N climbers', expanding on click." Rendered at the team's own position (it stands in for the whole team's real roster), sized off the SAME CELL_BASE_RADIUS_PX every individual leaf uses — "never solve density by shrinking the cells." */
function ClusterLeaf({ team, count, onExpand }: { team: TeamBranch; count: number; onExpand: () => void }) {
  const radius = CELL_BASE_RADIUS_PX * CLUSTER_SIZE_MULTIPLIER
  return (
    <TierBranchNode
      x={team.x}
      y={team.y}
      radius={radius}
      color={team.hue}
      membraneWidth={2}
      seed={`cluster:${team.id}`}
      onClick={(e) => {
        e.stopPropagation()
        onExpand()
      }}
      label={
        <>
          <text textAnchor="middle" dy={5} style={{ ...TYPE_STAT_VALUE, fill: BADGE_TEXT_COLOR, fontWeight: 700 }}>
            {count}
          </text>
          <text y={radius + 14} textAnchor="middle" style={{ ...TYPE_STAT_LABEL, fill: TEXT_SECONDARY }}>
            {count} climbers
          </text>
          <title>{`${count} climbers on ${team.label} — click to expand`}</title>
        </>
      }
    />
  )
}

/** "Subtle: a 40px bright segment moving along the path at 20% added opacity. This is the only motion on the edges." A CSS stroke-dash sweep — approxLength is the real chord distance between the two endpoints (close enough for a quadratic bezier this shallow), so the dash gap is always comfortably longer than the real path regardless of which branch is currently pulsing. */
function NutrientPulse({ pathD, approxLength, color }: { pathD: string; approxLength: number; color: string }) {
  return (
    <path
      d={pathD}
      fill="none"
      stroke={color}
      strokeWidth={5}
      strokeOpacity={0.2}
      strokeLinecap="round"
      strokeDasharray={`${NUTRIENT_PULSE_SEGMENT_PX} 2000`}
      className="graph-strata-nutrient-pulse"
      style={{ ['--nutrient-pulse-start' as string]: `${approxLength + NUTRIENT_PULSE_SEGMENT_PX}px` }}
    />
  )
}

/** mid tier: 8 chars (REQUIRES_DESCENT only). near tier: 12 chars, except REQUIRES_DESCENT gets the FULL name — "shows full name plus status badge." */
function cellLabelText(cell: Cell, tier: LabelZoomTier): string {
  if (tier === 'near' && cell.status === 'REQUIRES_DESCENT') return cell.node.label
  return truncateLabel(cell.node.label, tier === 'mid' ? 8 : 12)
}

function StrataCell({
  cell,
  isSelected,
  isHovered,
  isConnectedPulse,
  dimForOtherHover,
  isFilteredOut,
  showLabel,
  showHoverLabel,
  labelText,
  showBadge,
  reducedMotion,
  entering,
  spawnOffset,
  simplify,
  onHover,
  onSelect,
}: {
  cell: Cell
  isSelected: boolean
  isHovered: boolean
  /** "Connected cells — rope partner, team members — pulse once." Only the real rope-partner relationship this dataset has; "team members" has no real backend equivalent so isn't fabricated. */
  isConnectedPulse: boolean
  /** "All other cells dim to 0.4" while a DIFFERENT cell is hovered. */
  dimForOtherHover: boolean
  /** The one filter system's non-matching state: 0.15 opacity, pulse stopped, desaturated. */
  isFilteredOut: boolean
  /** Always-visible per the current zoom tier + label-collision pass. */
  showLabel: boolean
  /** Mid tier's "others on hover only" — a non-REQUIRES_DESCENT cell's label appears while hovered, uncontested by collision (a single hover target). */
  showHoverLabel: boolean
  labelText: string
  showBadge: boolean
  reducedMotion: boolean
  /** 8.13.4 ENTRY: true only for the brief window right after StrataCanvas itself mounts. */
  entering: boolean
  /** 8.13.4 NEW CLIMBER: real (dx,dy) from the layer's centre to this cell's own seeded position, non-null ONLY on the render where this specific cell first appears — a keyed component mount, read once. */
  spawnOffset: { dx: number; dy: number } | null
  /** 8.13.5 PERFORMANCE: past the 200-cell hard cap, every cell renders as a plain circle with organelles dropped — "circles only, no irregular outlines, organelles dropped first." */
  simplify: boolean
  onHover: (id: string | null) => void
  onSelect: (e: React.MouseEvent) => void
}) {
  // "Irregular outlines are generated per cell from a seed on the
  // climber's serial" — real serial when present, falling back to the
  // node id only for the (real, disclosed) case a climber has none.
  const seed = cell.node.serial ?? cell.node.id
  const radius = cell.radiusPx
  // 8.13-ui: "Leaf" per the reference tree diagram — every climber is a
  // real terminal (nothing branches below a climber in this data model),
  // so they're ALL the same shape family: a flat square. Real per-status
  // colour still carries the same information the old shape variety did
  // (fill = a light tint, border = the full status colour), it just isn't
  // encoded in silhouette anymore — uniform geometry is what "high
  // quality, clean" and a stable hover hit-box both need.
  const squareSide = radius * 1.8
  const status = cell.status
  const fill = status ? strataBandTintHex(STATUS_COLOR[status], 0.22) : strataBandTintHex(CELL_VESICLE, 0.22)
  const membrane = status ? MEMBRANE_BY_STATUS[status] : MEMBRANE_UNKNOWN
  const membraneColor = status ? STATUS_COLOR[status] : CELL_VESICLE
  const pulse = status ? CELL_PULSE_BY_STATUS[status] : null
  // 8.13-V.3: "leaf scales 1.35x, glow in its status colour" (down from
  // 8.13.2's original 1.4x). "Click: scale LOCKS at 1.35x, glow persists."
  const emphasised = isSelected || isHovered
  const scale = emphasised ? 1.35 : 1
  const removing = cell.removing

  const [spasming, setSpasming] = useState(false)
  useEffect(() => {
    if (reducedMotion || status !== 'REQUIRES_DESCENT' || removing) return
    let timeoutId: number
    let cancelled = false
    function scheduleNext() {
      // "Every 8-12 seconds... randomised inside that window so it never
      // becomes rhythmic" — a live jitter effect, deliberately NOT seeded
      // for cross-reload determinism (unlike the static boundary/shape
      // geometry elsewhere in this view).
      const delay = 8000 + Math.random() * 4000
      timeoutId = window.setTimeout(() => {
        if (cancelled) return
        setSpasming(true)
        window.setTimeout(() => {
          if (!cancelled) setSpasming(false)
        }, 300)
        scheduleNext()
      }, delay)
    }
    scheduleNext()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [status, reducedMotion, removing])

  // 8.13.4 NEW CLIMBER: paint once at the layer-centre offset, then remove
  // it next frame — the CSS `transition: transform 600ms` on the wrapper
  // provides the real "drifts to its force-directed position" duration.
  const [spawnDelta, setSpawnDelta] = useState(spawnOffset)
  useEffect(() => {
    if (!spawnDelta) return
    const raf = requestAnimationFrame(() => setSpawnDelta(null))
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showText = showLabel || (showHoverLabel && isHovered)
  // 8.13-V.3 HOVER: "everything else dims to 0.25" (up from 8.13.3's 0.4) —
  // dimForOtherHover is now driven by the ancestor-path/subtree computation
  // in DescentTree, not just "some other cell is hovered."
  const restOpacity = removing ? undefined : isFilteredOut ? 0.15 : dimForOtherHover ? 0.25 : 1
  const sensorCount = contributingSourceIds(cell.node).length
  const altitudeVal = cell.node.properties.currentAltitudeM?.value
  const altitudeText = typeof altitudeVal === 'number' ? `${Math.round(altitudeVal)}m` : 'Not tracked'
  // "ONE status field, not two" — Readiness is the only status word this
  // tooltip carries; there is no separate "Status:" line duplicating it.
  const tooltipText = [
    cell.node.label,
    cell.node.serial ? `Serial ${cell.node.serial}` : 'No serial on record',
    `Readiness: ${status ? READABLE_READINESS[status] : 'Unassessed'}`,
    `Altitude: ${altitudeText}`,
    `Sensors contributing: ${sensorCount}`,
  ].join('\n')

  return (
    <g
      data-cell-id={cell.node.id}
      data-removing={removing ? 'true' : undefined}
      transform={`translate(${cell.x}, ${cell.y}) scale(${scale})`}
      className={removing && !reducedMotion ? 'graph-strata-cell-removing' : undefined}
      style={{
        // BUG FIX: this element's own `transform` attribute already bakes
        // in `translate(cell.x, cell.y)` before the scale — the local
        // origin (0,0) IS the cell's real position. `transform-origin:
        // center` instead resolves against the SVG viewport's own centre
        // (no `transform-box: fill-box` is set), so scaling on hover
        // jumped the shape toward/away from the CANVAS centre rather than
        // growing in place — the further a cell sat from centre, the
        // bigger the jump. That moved the shape's edge out from under the
        // cursor, firing mouseleave, which un-scaled it back under the
        // cursor, firing mouseenter — an infinite hover feedback loop
        // ("shakes back and forth"). `0 0` scales around the position the
        // translate already set, which is correct and stable everywhere.
        transformOrigin: '0px 0px',
        // 8.13.3's own filter system keeps its documented 300ms opacity
        // transition; 8.13-V.3's hover/select ancestor-path dimming is
        // faster, 150ms — both animate the SAME `opacity` property, so
        // which duration applies depends on which is actually driving it.
        transition: `transform 150ms ease-out, opacity ${isFilteredOut ? 300 : 150}ms ease-out`,
        opacity: restOpacity,
        filter: isFilteredOut ? 'grayscale(1)' : undefined,
        cursor: removing ? 'default' : 'pointer',
        pointerEvents: removing ? 'none' : undefined,
      }}
      onMouseEnter={removing ? undefined : () => onHover(cell.node.id)}
      onMouseLeave={removing ? undefined : () => onHover(null)}
      onClick={removing ? undefined : onSelect}
    >
      <title>{tooltipText}</title>
      <g className={!reducedMotion ? 'graph-strata-cell-spawn-wrap' : undefined} style={spawnDelta ? { transform: `translate(${spawnDelta.dx}px, ${spawnDelta.dy}px)` } : undefined}>
        <g className={!reducedMotion ? 'graph-strata-cell-enter-wrap' : undefined} style={undefined} data-entering={entering ? 'true' : undefined}>
          <g className={[!reducedMotion && entering && 'graph-strata-cell-entering'].filter(Boolean).join(' ') || undefined}>
            <g className={[spasming && !reducedMotion && 'graph-strata-cell-spasm', isConnectedPulse && 'graph-strata-cell-connected-pulse'].filter(Boolean).join(' ') || undefined}>
              {emphasised && (
                <rect
                  x={-squareSide * 0.65}
                  y={-squareSide * 0.65}
                  width={squareSide * 1.3}
                  height={squareSide * 1.3}
                  rx={squareSide * 0.28}
                  fill="none"
                  stroke={membraneColor}
                  strokeWidth={2}
                  opacity={0.6}
                  style={{ filter: `drop-shadow(0 0 6px ${membraneColor})`, transition: 'filter 150ms ease-out' }}
                />
              )}
              {isSelected && (
                <rect
                  x={-squareSide * 0.75}
                  y={-squareSide * 0.75}
                  width={squareSide * 1.5}
                  height={squareSide * 1.5}
                  rx={squareSide * 0.3}
                  fill="none"
                  stroke={ACCENT_BLUE}
                  strokeWidth={1.5}
                />
              )}
              <g
                className={!reducedMotion && !simplify && pulse && !isFilteredOut ? 'graph-strata-cell-pulse' : undefined}
                style={
                  !reducedMotion && !simplify && pulse && !isFilteredOut
                    ? ({ ['--cell-pulse-min' as string]: pulse.minOpacity, animationDuration: `${pulse.cycleMs}ms`, animationDelay: `-${(hashUnit(seed + ':pulse') * pulse.cycleMs).toFixed(0)}ms` } as React.CSSProperties)
                    : undefined
                }
              >
                {/* 8.13-ui: "Leaf" — one uniform flat square for every climber, real status carried by fill/border colour, not silhouette. UNKNOWN keeps its dashed border so a grey cell still reads as "no data" rather than a fifth health state. Fill/border transition natively on status change now that shape never varies. */}
                <rect
                  x={-squareSide / 2}
                  y={-squareSide / 2}
                  width={squareSide}
                  height={squareSide}
                  rx={squareSide * 0.22}
                  fill={fill}
                  stroke={membraneColor}
                  strokeWidth={membrane.widthPx + 1}
                  strokeOpacity={membrane.opacity + 0.4}
                  strokeDasharray={status === null ? '3 2' : undefined}
                  className="graph-strata-cell-body"
                />
              </g>
            </g>
          </g>
        </g>
      </g>
      {showText && (
        <text x={0} y={squareSide / 2 + 12} textAnchor="middle" style={{ ...TYPE_STAT_LABEL, fill: TEXT_SECONDARY, fontWeight: status === 'REQUIRES_DESCENT' ? 500 : 400 }}>
          {labelText}
        </text>
      )}
      {showBadge && status && (
        <g transform={`translate(${squareSide * 0.55}, ${-squareSide * 0.55})`}>
          <circle r={4} fill={STATUS_COLOR[status]} />
          <circle r={4} fill="none" stroke="white" strokeWidth={1} />
        </g>
      )}
    </g>
  )
}

function noRouteButtonStyle(primary: boolean): React.CSSProperties {
  return {
    ...TYPE_BODY_ROW,
    padding: `${SPACE_8}px ${SPACE_16}px`,
    borderRadius: RADIUS_BUTTON,
    border: `1px solid ${primary ? ACCENT_BLUE : BORDER_MEDIUM}`,
    background: primary ? ACCENT_BLUE : 'transparent',
    color: primary ? BADGE_TEXT_COLOR : TEXT_PRIMARY,
    cursor: 'pointer',
  }
}

/** A second, differently-salted deterministic hash — used only for animation-delay phase offsets (never for shape/position, which stay on graph/strataVisuals.ts's own stableUnit). Local to this component since it's purely a rendering-timing detail. */
function hashUnit(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return (h % 1000) / 1000
}

function StrataDefs() {
  return (
    <defs>
      <filter id="strata-rough" x="-5%" y="-50%" width="110%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency={0.9} numOctaves={2} seed={7} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale={0.5} />
      </filter>
      <linearGradient id="strata-medium-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={BORDER_MEDIUM} stopOpacity={0.25} />
        <stop offset="100%" stopColor={BORDER_MEDIUM} stopOpacity={0} />
      </linearGradient>
      <StrataTexturePattern family="dot-grid" />
      <StrataTexturePattern family="horizontal-striations" />
      <StrataTexturePattern family="cellular" />
      <StrataTexturePattern family="diagonal-stress" />
      <StrataTexturePattern family="fracture" />
    </defs>
  )
}

function StrataTexturePattern({ family }: { family: 'dot-grid' | 'horizontal-striations' | 'cellular' | 'diagonal-stress' | 'fracture' }) {
  const size = 16
  return (
    <pattern id={`strata-texture-${family}`} width={size} height={size} patternUnits="userSpaceOnUse">
      {family === 'dot-grid' && <circle cx={size / 2} cy={size / 2} r={1} fill={TEXT_TERTIARY} />}
      {family === 'horizontal-striations' && <line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke={TEXT_TERTIARY} strokeWidth={0.75} />}
      {family === 'cellular' && <circle cx={size / 2} cy={size / 2} r={size * 0.32} fill="none" stroke={TEXT_TERTIARY} strokeWidth={0.6} />}
      {family === 'diagonal-stress' && <line x1={0} y1={size} x2={size} y2={0} stroke={TEXT_TERTIARY} strokeWidth={0.75} />}
      {family === 'fracture' && (
        <path d={`M0 ${size * 0.3} L${size * 0.4} ${size * 0.5} L${size * 0.3} ${size * 0.8} M${size * 0.6} 0 L${size * 0.5} ${size * 0.4} L${size} ${size * 0.6}`} stroke={TEXT_TERTIARY} strokeWidth={0.6} fill="none" />
      )}
    </pattern>
  )
}

/** "TOOLTIP, follows cursor, 200ms delay: layer · altitude range · climbers · average readiness · predictions active with outcome split · sources active and degraded. Average readiness is a word, never a number. The prediction split is on its own line so the two enums cannot be read as one distribution." */
function LayerTooltip({ layer, climbers, allNodes, x, y }: { layer: LaidOutLayer; climbers: GraphNode[]; allNodes: GraphNode[]; x: number; y: number }) {
  const avgReadiness = averageReadinessWord(climbers)
  const predictions = predictionSplitForLayer(climbers)
  const sources = sourcesForLayer(climbers, allNodes)
  const degraded = degradedSourceCount(sources)
  const rangeLabel = layer.isOpenEnded ? `${layer.floorM.toLocaleString()}m+` : `${layer.floorM.toLocaleString()}m — ${layer.ceilingM.toLocaleString()}m`
  const OUTCOME_WORD: Record<'requires-descent' | 'requires-review' | 'watch', string> = { 'requires-descent': 'descent', 'requires-review': 'review', watch: 'watch' }
  const outcomeParts = (Object.keys(OUTCOME_WORD) as (keyof typeof OUTCOME_WORD)[])
    .map((key) => ({ key, count: predictions.byOutcome[key] }))
    .filter((p) => p.count > 0)

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x + 14,
        top: y + 14,
        zIndex: 20,
        background: BG_TERTIARY,
        border: `1px solid ${BORDER_LIGHT}`,
        borderRadius: RADIUS_CARD,
        boxShadow: SHADOW_MEDIUM,
        padding: SPACE_8,
        minWidth: 200,
      }}
    >
      <p style={{ ...TYPE_STAT_LABEL, color: TEXT_PRIMARY, fontWeight: 600, marginBottom: 4 }}>{layer.name}</p>
      <p style={TYPE_TIMESTAMP}>{rangeLabel}</p>
      <p style={TYPE_TIMESTAMP}>
        {climbers.length} climber{climbers.length === 1 ? '' : 's'} · avg readiness {avgReadiness}
      </p>
      <p style={TYPE_TIMESTAMP}>
        {predictions.total} prediction{predictions.total === 1 ? '' : 's'} active
        {outcomeParts.length > 0 ? ` (${outcomeParts.map((p) => `${p.count} ${OUTCOME_WORD[p.key]}`).join(', ')})` : ''}
      </p>
      <p style={TYPE_TIMESTAMP}>
        {sources.length} source{sources.length === 1 ? '' : 's'} active, {degraded} degraded
      </p>
    </div>
  )
}

/** "A faint trail connects the cell to its layer centre" — rendered once the cell is SELECTED (locks in with the scale/glow), a real geometric line in the same world space the layer's own cells already live in. */
function StrataMinimap({
  layers,
  worldHeight,
  rectRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
}: {
  layers: LaidOutLayer[]
  worldHeight: number
  rectRef: React.RefObject<SVGRectElement | null>
  onPointerDown: (e: React.PointerEvent<SVGRectElement | SVGSVGElement>) => void
  onPointerMove: (e: React.PointerEvent<SVGRectElement | SVGSVGElement>) => void
  onPointerUp: (e: React.PointerEvent<SVGRectElement | SVGSVGElement>) => void
  onClick: (e: React.MouseEvent<SVGSVGElement>) => void
}) {
  if (worldHeight === 0) return null
  const scaleY = MINIMAP_HEIGHT_PX / worldHeight
  return (
    <div
      className="absolute overflow-hidden"
      style={{ bottom: SPACE_16, right: SPACE_16, width: MINIMAP_WIDTH_PX, height: MINIMAP_HEIGHT_PX, background: BG_SECONDARY, border: `1px solid ${BORDER_MEDIUM}`, borderRadius: RADIUS_CARD }}
    >
      <svg width={MINIMAP_WIDTH_PX} height={MINIMAP_HEIGHT_PX} style={{ display: 'block', cursor: 'pointer' }} onPointerMove={onPointerMove} onClick={onClick}>
        {layers.map((layer) => (
          <rect
            key={layer.name}
            x={0}
            y={layer.yTop * scaleY}
            width={MINIMAP_WIDTH_PX}
            height={Math.max(1, (layer.yBottom - layer.yTop) * scaleY)}
            fill={strataLayerFillColor(layer.index, layers.length)}
          />
        ))}
        <rect
          ref={rectRef}
          fill={ACCENT_BLUE}
          fillOpacity={0.12}
          stroke={ACCENT_BLUE}
          strokeWidth={1}
          style={{ cursor: 'move' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </svg>
    </div>
  )
}
