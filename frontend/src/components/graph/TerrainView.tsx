// S8.7: TERRAIN — the mountain. A real height field (route elevation
// profile + seeded ridge texture), rendered as ~15,000 points with a
// hand-written isometric projection. No mesh, no fill, no shading: the
// density of points IS the shading, same as the reference. Climbers plot
// on top at their actual position/altitude — white nominal, amber watch,
// red anomaly — and clicking one writes to the SAME graphStore selection
// NETWORK and STRATA already read, so this is a third projection of one
// selection, not a fourth independent widget.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { graphStore } from '../../graph/graphStore'
import { CURRENT_DATASET as GRAPH_DATASET } from '../../graph/currentDataset'
import {
  buildClimberPlacements,
  buildRouteConditions,
  buildRouteProfiles,
  CAMPS,
  defaultRouteId,
  summarizeRouteClimbers,
} from '../../graph/terrainProfile'
import { computeHeightField, noiseSeedForRoute, surfaceHeightAt } from '../../graph/terrainHeightField'
import { toWorldX, toWorldZ, WORLD_HALF_WIDTH_UNITS, WORLD_LENGTH_UNITS } from '../../graph/terrainWorld'
import {
  clampElevation,
  DEFAULT_ELEVATION_DEG,
  depthRangeForWorld,
  ISO_COS30,
  ISO_SIN30,
  loadPersistedCamera,
  projectPoint,
  rubberBandElevation,
  savePersistedCamera,
} from '../../graph/terrainCamera'
import { createRafLoop } from '../../graph/rafLoop'
import { isFilterVisible } from '../../graph/emphasis'
import { nextEntity, siblingInTier } from '../../graph/keyboardNav'
import { computeFilterVisible } from '../../graph/filters'
import { buildSearchIndex, computeSearchMatches } from '../../graph/search'
import { buildTooltipIndex } from '../../graph/tooltipInfo'
import { EntityTooltip } from './EntityTooltip'
import { ANOMALY_RED, CLIMBER_WHITE, GRAPH_BLACK, WATCH_AMBER } from '../../graph/tokens'
import { NOMINAL, PANEL, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY } from '../../ase/tokens'
import type { Camera } from '../../graph/terrainCamera'
import type { GraphId, Size } from '../../graph/types'

// -- data derived once from the shared dataset, not per mount ---------------
const ROUTE_PROFILES = buildRouteProfiles(GRAPH_DATASET)
const CLIMBER_PLACEMENTS = buildClimberPlacements(GRAPH_DATASET, ROUTE_PROFILES)
const DEFAULT_ROUTE_ID = defaultRouteId(GRAPH_DATASET, CLIMBER_PLACEMENTS)
const ROUTE_LIST = GRAPH_DATASET.domainEntities.filter((e) => e.tier === 'route')
const CLIMBER_BY_ID = new Map(GRAPH_DATASET.domainEntities.filter((e) => e.tier === 'climber').map((e) => [e.id, e]))
const TOOLTIP_INDEX = buildTooltipIndex(GRAPH_DATASET)
const SEARCH_INDEX = buildSearchIndex(GRAPH_DATASET)

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const AUTO_ROTATE_PERIOD_MS = 4 * 60 * 1000
const AZIMUTH_SENSITIVITY = 0.006 // rad per px — 1:1-ish drag tracking
const ELEVATION_SENSITIVITY = 0.22 // deg per px
const ZOOM_SENSITIVITY = 0.0016
const MIN_SCALE = 2.5
const MAX_SCALE = 14
const INITIAL_SCALE = 5.2
const VERTICAL_SCALE_RATIO = 0.055 // verticalScale = scale * this — fixes the mountain's height:footprint ratio across zoom levels
const MOMENTUM_DECAY_PER_MS = 0.0035
const CLICK_MOVE_THRESHOLD_PX = 5
const CLICK_MAX_MS = 400
const BUCKET_COUNT = 96
const ZOOM_LABEL_THRESHOLD = 6.5
const CLIMBER_HIT_RADIUS_PX = 14

// A fixed grey palette, computed once — avoids allocating a new `rgb(...)`
// string per point per frame (~15,000/frame); see NetworkCanvasLayer's own
// "measured, not assumed" note on canvas hot-loop cost for why this kind of
// per-frame allocation is worth avoiding here too.
const GREY_LEVELS = 40
const GREY_PALETTE: string[] = Array.from({ length: GREY_LEVELS }, (_, i) => {
  const v = Math.round(120 + (i / (GREY_LEVELS - 1)) * 135)
  return `rgb(${v}, ${v}, ${v})`
})

interface PointerState {
  x: number
  y: number
  t: number
}

export function TerrainView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useRef(prefersReducedMotion()).current

  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [selectedRouteId, setSelectedRouteId] = useState<GraphId>(DEFAULT_ROUTE_ID)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [hoverTooltipPos, setHoverTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const snapshot = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot)

  const sizeRef = useRef<Size>({ width: 0, height: 0 })
  const defaultCamera: Camera = { azimuthRad: -0.5, elevationDeg: DEFAULT_ELEVATION_DEG, scale: INITIAL_SCALE, verticalScale: INITIAL_SCALE * VERTICAL_SCALE_RATIO }
  const cameraRef = useRef<Camera>(loadPersistedCamera(defaultCamera, MIN_SCALE, MAX_SCALE))
  const draggingRef = useRef(false)
  const dragModeRef = useRef<'azimuth' | 'elevation'>('azimuth')
  const lastPointerRef = useRef<PointerState>({ x: 0, y: 0, t: 0 })
  const pointerDownRef = useRef<PointerState>({ x: 0, y: 0, t: 0 })
  const velocityRef = useRef({ azimuth: 0, elevation: 0 })
  const hasInteractedRef = useRef(false)
  const climberScreenPosRef = useRef(new Map<GraphId, { sx: number; sy: number }>())
  const hoveredClimberRef = useRef<GraphId | null>(null)

  useEffect(() => {
    graphStore.setViewMode('terrain')
  }, [])

  // S8.8 acceptance: "select a climber in Network, switch to Terrain, and
  // they are still selected and visible on the mountain." Selection
  // persisting was already true (one shared graphStore field) — visibility
  // wasn't, since TERRAIN only ever draws climbers on ONE route at a time.
  // Jump the route selector to match whenever selection lands on a climber
  // this route isn't already showing.
  useEffect(() => {
    if (!snapshot.selection) return
    const placement = CLIMBER_PLACEMENTS.get(snapshot.selection)
    if (placement && placement.routeId !== selectedRouteId) setSelectedRouteId(placement.routeId)
  }, [snapshot.selection, selectedRouteId])

  useEffect(() => {
    // Deliberately reads cameraRef.current INSIDE the cleanup, not a copy
    // captured at mount — this is a plain mutable data ref (not a DOM node
    // ref), so "the value read at unmount time" is exactly the latest
    // camera state we want persisted, not a staleness bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => savePersistedCamera(cameraRef.current)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height }
      sizeRef.current = next
      setSize(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const routeProfile = ROUTE_PROFILES.get(selectedRouteId) ?? ROUTE_PROFILES.get(DEFAULT_ROUTE_ID)!
  const conditions = useMemo(() => buildRouteConditions(routeProfile.routeId), [routeProfile.routeId])
  const climbersOnRoute = useMemo(
    () => [...CLIMBER_PLACEMENTS.values()].filter((p) => p.routeId === routeProfile.routeId),
    [routeProfile.routeId],
  )
  const anomalyMarkers = useMemo(
    () => climbersOnRoute.filter((p) => CLIMBER_BY_ID.get(p.climberId)?.status === 'anomaly').map((p) => ({ progress: p.progress, lateral: p.lateral })),
    [climbersOnRoute],
  )
  const heightField = useMemo(() => computeHeightField(routeProfile, anomalyMarkers), [routeProfile, anomalyMarkers])
  const summary = useMemo(() => summarizeRouteClimbers(GRAPH_DATASET, CLIMBER_PLACEMENTS, routeProfile.routeId), [routeProfile.routeId])
  const densityPerKm2 = useMemo(() => {
    const areaKm2 = Math.max(0.05, routeProfile.lengthKm * (routeProfile.corridorWidthM / 1000))
    return Math.round(heightField.count / areaKm2)
  }, [routeProfile, heightField.count])

  // S8.8: filtering "changes what is drawn" — a filtered-out climber is
  // skipped entirely (not just dimmed, and not hit-testable). Search dims
  // instead, via a per-marker opacity multiplier in the draw loop below.
  const filterVisible = useMemo(() => computeFilterVisible(GRAPH_DATASET, snapshot.filter), [snapshot.filter])
  const searchMatches = useMemo(() => computeSearchMatches(SEARCH_INDEX, snapshot.searchQuery), [snapshot.searchQuery])
  const visibleClimbers = useMemo(() => climbersOnRoute.filter((p) => isFilterVisible(p.climberId, filterVisible)), [climbersOnRoute, filterVisible])

  function markInteracted() {
    if (!hasInteractedRef.current) {
      hasInteractedRef.current = true
      setHasInteracted(true)
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    containerRef.current?.focus()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    draggingRef.current = true
    dragModeRef.current = e.shiftKey ? 'elevation' : 'azimuth'
    const t = performance.now()
    lastPointerRef.current = { x: e.clientX, y: e.clientY, t }
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t }
    velocityRef.current = { azimuth: 0, elevation: 0 }
    markInteracted()
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) {
      // not rotating the camera — this is a hover pass over the climber markers
      const hit = hitTestClimber(e.clientX, e.clientY)
      if (hit !== hoveredClimberRef.current) {
        hoveredClimberRef.current = hit
        graphStore.setHover(hit)
      }
      setHoverTooltipPos(hit ? { x: e.clientX, y: e.clientY } : null)
      return
    }
    const t = performance.now()
    const dx = e.clientX - lastPointerRef.current.x
    const dy = e.clientY - lastPointerRef.current.y
    const dt = Math.max(1, t - lastPointerRef.current.t)
    const camera = cameraRef.current
    if (dragModeRef.current === 'elevation') {
      camera.elevationDeg = rubberBandElevation(camera.elevationDeg - dy * ELEVATION_SENSITIVITY)
      velocityRef.current.elevation = reduced ? 0 : (-dy * ELEVATION_SENSITIVITY) / dt
    } else {
      camera.azimuthRad += dx * AZIMUTH_SENSITIVITY
      velocityRef.current.azimuth = reduced ? 0 : (dx * AZIMUTH_SENSITIVITY) / dt
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY, t }
  }

  function hitTestClimber(clientX: number, clientY: number): GraphId | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    let hitId: GraphId | null = null
    let hitDist = CLIMBER_HIT_RADIUS_PX
    for (const [id, p] of climberScreenPosRef.current) {
      const d = Math.hypot(p.sx - localX, p.sy - localY)
      if (d < hitDist) {
        hitDist = d
        hitId = id
      }
    }
    return hitId
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const wasDragging = draggingRef.current
    draggingRef.current = false
    const t = performance.now()
    const dx = e.clientX - pointerDownRef.current.x
    const dy = e.clientY - pointerDownRef.current.y
    const dist = Math.hypot(dx, dy)
    const elapsed = t - pointerDownRef.current.t
    if (dist < CLICK_MOVE_THRESHOLD_PX && elapsed < CLICK_MAX_MS) {
      const hit = hitTestClimber(e.clientX, e.clientY)
      // S8.9: a plain click on the mountain itself (not a marker) closes
      // the investigation panel, the same "background click clears
      // selection" NETWORK/STRATA already do.
      graphStore.setSelection(hit)
    }
    if (wasDragging) savePersistedCamera(cameraRef.current)
  }

  // S8.8 KEYBOARD: TERRAIN's climbers are canvas-drawn, not DOM nodes, so
  // there's nothing for native Tab to land on the way NETWORK/STRATA's
  // entity <g> elements do — this container traps Tab/Arrow/Enter itself
  // while focused (containerRef.current.focus() below, on pointerdown) and
  // drives the SAME graphStore.hover/selection every other view reads.
  // Scope is the full 127-entity order (nextEntity/siblingInTier), not just
  // this route's climbers, so cycling here is consistent with what Tab
  // does in NETWORK/STRATA — a non-climber id simply won't render a ring
  // here, the same as any hover that doesn't apply to the current view.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      if (snapshot.hover) graphStore.setSelection(snapshot.hover)
      return
    }
    const arrowDirection = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : null
    if (arrowDirection !== null) {
      e.preventDefault()
      const next = snapshot.hover ? siblingInTier(GRAPH_DATASET, snapshot.hover, arrowDirection) : nextEntity(GRAPH_DATASET, null, arrowDirection)
      if (next) graphStore.setHover(next, true)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const next = nextEntity(GRAPH_DATASET, snapshot.hover, e.shiftKey ? -1 : 1)
      if (next) graphStore.setHover(next, true)
    }
  }

  function handlePointerLeave() {
    if (hoveredClimberRef.current) {
      hoveredClimberRef.current = null
      graphStore.setHover(null)
    }
    setHoverTooltipPos(null)
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault()
    markInteracted()
    const camera = cameraRef.current
    const factor = Math.min(1.15, Math.max(0.85, 1 - e.deltaY * ZOOM_SENSITIVITY))
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.scale * factor))
    camera.scale = nextScale
    camera.verticalScale = nextScale * VERTICAL_SCALE_RATIO
    savePersistedCamera(camera)
  }

  // -- the draw loop: one rAF loop per mount, stopped/restarted whenever
  // the route (and so the height field + climbers) changes or the canvas
  // resizes — route switches are user-triggered and rare, so re-creating
  // the loop is simpler than threading fresh data into a long-lived one
  // through extra refs, and costs nothing observable.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(size.width * dpr))
    canvas.height = Math.max(1, Math.round(size.height * dpr))
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`

    const n = heightField.count
    const bucketOf = new Int32Array(n)
    const sxArr = new Float32Array(n)
    const syArr = new Float32Array(n)
    const order = new Int32Array(n)
    const bucketCounts = new Int32Array(BUCKET_COUNT)
    const bucketOffsets = new Int32Array(BUCKET_COUNT)
    const cursor = new Int32Array(BUCKET_COUNT)
    const noiseSeed = noiseSeedForRoute(routeProfile.routeId)

    let lastFrameT: number | null = null

    function frame(nowMs: number) {
      if (!ctx) return
      const camera = cameraRef.current
      const dt = lastFrameT === null ? 16 : Math.min(64, nowMs - lastFrameT)
      lastFrameT = nowMs

      if (!draggingRef.current) {
        if (!hasInteractedRef.current && !reduced) {
          camera.azimuthRad += ((2 * Math.PI) / AUTO_ROTATE_PERIOD_MS) * dt
        } else if (velocityRef.current.azimuth !== 0 || velocityRef.current.elevation !== 0 || camera.elevationDeg !== clampElevation(camera.elevationDeg)) {
          const decay = Math.exp(-MOMENTUM_DECAY_PER_MS * dt)
          velocityRef.current.azimuth *= decay
          velocityRef.current.elevation *= decay
          if (Math.abs(velocityRef.current.azimuth) < 1e-5) velocityRef.current.azimuth = 0
          if (Math.abs(velocityRef.current.elevation) < 1e-5) velocityRef.current.elevation = 0

          camera.azimuthRad += velocityRef.current.azimuth * dt
          const dragged = camera.elevationDeg + velocityRef.current.elevation * dt
          const clamped = clampElevation(dragged)
          // spring back toward the hard limit once released past it, rather than snapping instantly
          camera.elevationDeg = velocityRef.current.elevation !== 0 ? rubberBandElevation(dragged) : dragged + (clamped - dragged) * Math.min(1, dt / 180)
        }
      }

      // -- draw ---------------------------------------------------------
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = GRAPH_BLACK
      ctx.fillRect(0, 0, size.width, size.height)

      // Auto-centre on the world box's own projected footprint each frame
      // (8 corners, cheap) rather than a fixed offset — a fixed offset only
      // looks centred at the one azimuth/elevation it was tuned against;
      // this keeps the mountain on-canvas through a full rotation and any
      // elevation angle.
      let boxMinSx = Infinity
      let boxMaxSx = -Infinity
      let boxMinSy = Infinity
      let boxMaxSy = -Infinity
      const reliefM = routeProfile.exitAltitudeM - routeProfile.entryAltitudeM
      for (const bx of [0, WORLD_LENGTH_UNITS]) {
        for (const bz of [-WORLD_HALF_WIDTH_UNITS, WORLD_HALF_WIDTH_UNITS]) {
          for (const by of [0, reliefM]) {
            const c = projectPoint(bx, by, bz, camera)
            if (c.sx < boxMinSx) boxMinSx = c.sx
            if (c.sx > boxMaxSx) boxMaxSx = c.sx
            if (c.sy < boxMinSy) boxMinSy = c.sy
            if (c.sy > boxMaxSy) boxMaxSy = c.sy
          }
        }
      }
      const cx = size.width / 2 - (boxMinSx + boxMaxSx) / 2
      const cy = size.height / 2 - (boxMinSy + boxMaxSy) / 2 + size.height * 0.06

      const [depthMin, depthMax] = depthRangeForWorld(camera, WORLD_LENGTH_UNITS, WORLD_HALF_WIDTH_UNITS)
      const depthSpan = Math.max(1e-6, depthMax - depthMin)

      // Inlines terrainCamera.ts's projectPoint()/depthKey() formula rather
      // than calling them per point — cosA/sinA/elevation factors only need
      // computing ONCE per frame, not 15,000 times. The pure per-call
      // versions in terrainCamera.ts remain the source of truth (used below
      // for the handful of climber markers, and by the unit tests); this is
      // the same "same maths, hand-inlined for the hot loop" trade
      // NetworkCanvasLayer already made for its own per-frame draw.
      const cosA = Math.cos(camera.azimuthRad)
      const sinA = Math.sin(camera.azimuthRad)
      const elevRad = (camera.elevationDeg * Math.PI) / 180
      const depthFactor = Math.sin(elevRad)
      const heightFactor = Math.cos(elevRad)

      // Projected relative to the route's own base (entry altitude), not
      // sea level — a route entering at 3,583m would otherwise carry that
      // whole offset into screenY and push the mountain off-canvas; only
      // the RELIEF (a few hundred to a few thousand metres) needs to show.
      const baseAltitudeM = routeProfile.entryAltitudeM
      const xs = heightField.x
      const ys = heightField.y
      const zs = heightField.z
      bucketCounts.fill(0)
      for (let i = 0; i < n; i++) {
        const xr = xs[i] * cosA - zs[i] * sinA
        const zr = xs[i] * sinA + zs[i] * cosA
        sxArr[i] = (xr - zr) * ISO_COS30 * camera.scale + cx
        syArr[i] = (xr + zr) * ISO_SIN30 * camera.scale * depthFactor - (ys[i] - baseAltitudeM) * camera.verticalScale * heightFactor + cy

        const depth = xr + zr
        let bucket = Math.floor(((depth - depthMin) / depthSpan) * BUCKET_COUNT)
        if (bucket < 0) bucket = 0
        else if (bucket >= BUCKET_COUNT) bucket = BUCKET_COUNT - 1
        bucketOf[i] = bucket
        bucketCounts[bucket]++
      }
      let acc = 0
      for (let b = 0; b < BUCKET_COUNT; b++) {
        bucketOffsets[b] = acc
        acc += bucketCounts[b]
      }
      cursor.set(bucketOffsets)
      for (let i = 0; i < n; i++) {
        const b = bucketOf[i]
        order[cursor[b]++] = i
      }

      const brightness = heightField.brightness
      const ridge = heightField.ridge
      const anomaly = heightField.anomaly
      for (let k = 0; k < n; k++) {
        const i = order[k]
        if (anomaly[i] === 1) {
          ctx.fillStyle = ANOMALY_RED
          ctx.globalAlpha = 0.55 + brightness[i] * 0.45
        } else {
          const idx = Math.min(GREY_LEVELS - 1, Math.floor(brightness[i] * GREY_LEVELS))
          ctx.fillStyle = GREY_PALETTE[idx]
          ctx.globalAlpha = 0.45 + brightness[i] * 0.55
        }
        const s = ridge[i] === 1 ? 1.5 : 1
        ctx.fillRect(sxArr[i] - s / 2, syArr[i] - s / 2, s, s)
      }
      ctx.globalAlpha = 1

      // -- climbers, drawn on top --------------------------------------
      const storeSnapshot = graphStore.getSnapshot()
      const selection = storeSnapshot.selection
      const hoveredId = storeSnapshot.hover
      const showLabels = camera.scale >= ZOOM_LABEL_THRESHOLD
      for (const p of visibleClimbers) {
        const entity = CLIMBER_BY_ID.get(p.climberId)
        if (!entity) continue
        const isHovered = hoveredId === p.climberId
        const isKeyboardFocus = isHovered && storeSnapshot.keyboardActive
        const dimmed = searchMatches !== null && !searchMatches.has(p.climberId)
        const color = entity.status === 'anomaly' ? ANOMALY_RED : p.watch ? WATCH_AMBER : CLIMBER_WHITE
        const markerAlpha = dimmed ? 0.25 : 1
        const radius = isHovered ? 4.8 : 3
        const wx = toWorldX(p.progress)
        const wz = toWorldZ(p.lateral)
        const marker = projectPoint(wx, p.altitudeM - baseAltitudeM, wz, camera)
        const sx = marker.sx + cx
        const sy = marker.sy + cy
        climberScreenPosRef.current.set(p.climberId, { sx, sy })

        const surfaceY = surfaceHeightAt(routeProfile, p.progress, p.lateral, noiseSeed)
        const drop = projectPoint(wx, surfaceY - baseAltitudeM, wz, camera)
        ctx.globalAlpha = 0.3 * markerAlpha
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(drop.sx + cx, drop.sy + cy)
        ctx.stroke()

        ctx.globalAlpha = 0.4 * markerAlpha
        ctx.beginPath()
        p.trail.forEach((t, idx) => {
          const proj = projectPoint(toWorldX(t.progress), t.altitudeM - baseAltitudeM, toWorldZ(t.lateral), camera)
          const px = proj.sx + cx
          const py = proj.sy + cy
          if (idx === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.strokeStyle = color
        ctx.stroke()

        ctx.globalAlpha = markerAlpha
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(sx, sy, radius, 0, Math.PI * 2)
        ctx.fill()

        if (selection === p.climberId) {
          ctx.strokeStyle = CLIMBER_WHITE
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(sx, sy, radius + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
        if (isKeyboardFocus) {
          ctx.strokeStyle = NOMINAL
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(sx, sy, radius + 7, 0, Math.PI * 2)
          ctx.stroke()
        }

        if (showLabels || isHovered) {
          ctx.globalAlpha = 1
          ctx.fillStyle = TEXT_SECONDARY
          ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
          ctx.fillText(p.serial, sx + radius + 3, sy - 6)
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = createRafLoop(frame)
    loop.start()
    return () => loop.stop()
  }, [heightField, visibleClimbers, searchMatches, routeProfile, size.width, size.height, reduced])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative h-full w-full overflow-hidden"
      style={{ background: GRAPH_BLACK }}
    >
      {size.width > 0 && size.height > 0 && (
        <canvas
          ref={canvasRef}
          className="absolute left-0 top-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onWheel={handleWheel}
        />
      )}

      {hoverTooltipPos && snapshot.hover && (
        <EntityTooltip
          info={TOOLTIP_INDEX.get(snapshot.hover) ?? null}
          x={hoverTooltipPos.x}
          y={hoverTooltipPos.y}
          watch={CLIMBER_PLACEMENTS.get(snapshot.hover)?.watch ?? false}
        />
      )}

      <div className="pointer-events-none absolute left-3 top-3 font-mono" style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.6 }}>
        <select
          value={routeProfile.routeId}
          onChange={(e) => setSelectedRouteId(e.target.value)}
          className="pointer-events-auto"
          style={{ background: 'transparent', color: TEXT_SECONDARY, border: 'none', fontSize: 11, letterSpacing: '0.05em', padding: 0, fontFamily: 'inherit' }}
        >
          {ROUTE_LIST.map((r) => (
            <option key={r.id} value={r.id} style={{ background: PANEL, color: TEXT_PRIMARY }}>
              {r.label.toUpperCase()}
            </option>
          ))}
        </select>
        <div>{routeProfile.countryLabel}</div>
        <div>
          ENTRY {routeProfile.entryAltitudeM}m · CRUX {routeProfile.cruxAltitudeM}m · EXIT {routeProfile.exitAltitudeM}m
        </div>
        <div>{routeProfile.lengthKm}km</div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 text-right font-mono" style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.6 }}>
        <div style={{ color: TEXT_SECONDARY, letterSpacing: '0.05em' }}>CONDITIONS</div>
        <div>WIND {conditions.windKph}kph</div>
        <div>TEMP {conditions.tempC}°C</div>
        <div>VIS {conditions.visibilityKm}km</div>
        <div>FREEZING {conditions.freezingLevelM}m</div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 font-mono" style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.6 }}>
        <div style={{ color: TEXT_SECONDARY, letterSpacing: '0.05em' }}>
          CLIMBERS ON ROUTE — {summary.totalOnRoute}
          {summary.anomalyCount > 0 ? ` · ${summary.anomalyCount} IN ANOMALY` : ''}
        </div>
        {CAMPS.filter((c) => summary.byCamp.find((s) => s.camp === c.label && s.count > 0)).map((c) => (
          <div key={c.label}>
            {c.label} — {summary.byCamp.find((s) => s.camp === c.label)?.count}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 text-right font-mono" style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.6 }}>
        <div style={{ color: TEXT_SECONDARY, letterSpacing: '0.05em' }}>ISO 30° PROJECTION</div>
        <div>{heightField.count.toLocaleString()} PTS</div>
        <div>~{densityPerKm2.toLocaleString()} PTS/KM²</div>
      </div>

      {!hasInteracted && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center font-mono" style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: '0.05em' }}>
          DRAG TO ROTATE · SCROLL TO ZOOM · SHIFT-DRAG TO TILT
        </div>
      )}
    </div>
  )
}
