// S8.5: NETWORK VIEW — orchestrates the canvas+SVG split, the real
// dendritic dataset (S8.3), spawn, drift and the reduced-motion path. This
// is what GraphNext.tsx now mounts in place of S8.2's flat-ring proof
// canvas.
//
// S8.8 adds: pan/zoom (a single CSS transform wrapping both layers, driven
// by graphStore.viewport — screenPos = worldPos*zoom + (cx,cy), the same
// convention graph/viewport.ts's math uses), dbl-click focus mode (eases
// the SAME transform to a two-hop neighbourhood's bounding box), sub-node
// hover hit-testing (the canvas has no DOM nodes of its own to hover, so
// this container does the hit-test against positions NetworkCanvasLayer
// writes every draw frame), RESET VIEW, and viewport persistence.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CORE_VIGNETTE, GRAPH_BLACK } from '../../graph/tokens'
import { graphStore } from '../../graph/graphStore'
import { CURRENT_DATASET as GRAPH_DATASET } from '../../graph/currentDataset'
import { DRIFT_AMPLITUDE_BY_TIER, ENVIRONMENT_DRIFT_AMPLITUDE, SUBNODE_DRIFT_AMPLITUDE } from '../../graph/sizes'
import { isDomainEntity, isEnvironmentNode } from '../../graph/domain'
import { buildHoverChainIndex } from '../../graph/hoverChain'
import { buildSearchIndex, computeSearchMatches } from '../../graph/search'
import { computeFilterVisible } from '../../graph/filters'
import { buildTooltipIndex } from '../../graph/tooltipInfo'
import { computeWatchIds } from '../../graph/watchStatus'
import { boundingBoxOf, computeTwoHopNeighbourhood, viewportToFit } from '../../graph/focusMode'
import { createRafLoop } from '../../graph/rafLoop'
import { DEFAULT_VIEWPORT, NETWORK_ZOOM_MAX, NETWORK_ZOOM_MIN, savePersistedViewport, zoomAt } from '../../graph/viewport'
import { buildSpawnPlan, getHasEverSpawned, markHasSpawned } from '../../graph/spawnStages'
import { environmentStore } from '../../graph/environmentStore'
import { HAIRLINE, PANEL, TEXT_SECONDARY } from '../../ase/tokens'
import { NetworkCanvasLayer } from './NetworkCanvasLayer'
import { NetworkSvgLayer } from './NetworkSvgLayer'
import { EntityTooltip } from './EntityTooltip'
import { SpawnTicker } from './SpawnTicker'
import type { EmphasisContext } from '../../graph/emphasis'
import type { GraphId, Point, Viewport } from '../../graph/types'

// S8.6: the SAME dataset instance StrataView renders (graph/currentDataset.ts)
// — not a second, separately-generated (if deterministically-equal) one.
// A Map, not dataset.entities.find() per node — buildDriftParams calls the
// amplitude function once per entity (~2,700 of them), and .find() there
// would be O(n^2) for no reason.
const NODE_BY_ID = new Map(GRAPH_DATASET.entities.map((e) => [e.id, e]))

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const SUBNODE_HIT_RADIUS_SCREEN_PX = 9
const SUBNODE_HOVER_ZOOM_THRESHOLD = 2 // S8.8: "sub-node labels appear above 2x"
const PAN_MOVE_THRESHOLD_PX = 4
const MOMENTUM_DECAY_PER_MS = 0.004
const WHEEL_ZOOM_SENSITIVITY = 0.0016
const FOCUS_EASE_MS = 550

export function NetworkView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const reduced = useRef(prefersReducedMotion()).current
  // S8.4b: "ONCE PER DATASET" — hasEverSpawned is a module-level flag
  // (graph/spawnStages.ts), so a view switch or remount after the reveal
  // has already played once this session starts straight at renderFinal,
  // never replaying and never blank. Captured once at mount, same pattern
  // as `reduced` above.
  const [renderFinal, setRenderFinal] = useState(() => reduced || getHasEverSpawned())
  const spawnPlan = useMemo(() => buildSpawnPlan(GRAPH_DATASET), [])
  const snapshot = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot)
  const environmentSnapshot = useSyncExternalStore(environmentStore.subscribe, environmentStore.getSnapshot)

  const subNodePosRef = useRef(new Map<GraphId, Point>())
  const hoveredSubNodeRef = useRef<GraphId | null>(null)
  const [subNodeTooltipPos, setSubNodeTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const draggingRef = useRef(false)
  const panEligibleRef = useRef(false)
  const pointerDownRef = useRef({ x: 0, y: 0, t: 0 })
  const lastPointerRef = useRef({ x: 0, y: 0, t: 0 })
  const velocityRef = useRef({ x: 0, y: 0 })
  const momentumLoopRef = useRef<ReturnType<typeof createRafLoop> | null>(null)
  const lastMomentumTRef = useRef<number | null>(null)
  const preFocusViewportRef = useRef<Viewport | null>(null)
  const tweenGenRef = useRef(0)

  useEffect(() => {
    graphStore.setViewMode('network')
    graphStore.setDriftAmplitudeFn((id: GraphId) => {
      const node = NODE_BY_ID.get(id)
      if (!node) return SUBNODE_DRIFT_AMPLITUDE
      if (isEnvironmentNode(node)) return ENVIRONMENT_DRIFT_AMPLITUDE
      return isDomainEntity(node) ? DRIFT_AMPLITUDE_BY_TIER[node.tier] : SUBNODE_DRIFT_AMPLITUDE
    })
    graphStore.setDataset(GRAPH_DATASET)
    graphStore.start()
    // S8.4b: the environment nodes are "always live", ticking for as long
    // as NETWORK is mounted — owned and started/stopped here, same as
    // graphStore itself, never by a deeper consumer.
    environmentStore.start(GRAPH_DATASET)
    return () => {
      graphStore.stop()
      environmentStore.stop()
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      graphStore.setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // S8.4b: the reveal's own completion clock — when it runs out the reveal
  // has finished naturally, so mark it done for the rest of the session and
  // flip this mount to the same final, static picture a later remount would
  // start on. A mid-reveal click (handleSkipReveal, wired into
  // handlePointerDown below) does the exact same two calls early.
  useEffect(() => {
    if (renderFinal) return
    const timer = setTimeout(() => {
      markHasSpawned()
      setRenderFinal(true)
    }, spawnPlan.totalDurationMs)
    return () => clearTimeout(timer)
  }, [renderFinal, spawnPlan])

  function handleSkipReveal() {
    if (renderFinal) return
    markHasSpawned()
    setRenderFinal(true)
  }

  // -- S8.8: momentum-decayed pan, its own tiny rAF loop -----------------
  useEffect(() => {
    function frame(now: number) {
      const dt = lastMomentumTRef.current === null ? 16 : Math.min(64, now - lastMomentumTRef.current)
      lastMomentumTRef.current = now
      const decay = Math.exp(-MOMENTUM_DECAY_PER_MS * dt)
      velocityRef.current.x *= decay
      velocityRef.current.y *= decay
      if (Math.hypot(velocityRef.current.x, velocityRef.current.y) < 0.01) {
        momentumLoopRef.current?.stop()
        lastMomentumTRef.current = null
        savePersistedViewport(graphStore.getSnapshot().viewport)
        return
      }
      const vp = graphStore.getSnapshot().viewport
      graphStore.setViewport({ cx: vp.cx + velocityRef.current.x * dt, cy: vp.cy + velocityRef.current.y * dt, zoom: vp.zoom })
    }
    momentumLoopRef.current = createRafLoop(frame)
    return () => momentumLoopRef.current?.stop()
  }, [])

  function easeViewportTo(from: Viewport, to: Viewport, durationMs: number) {
    const gen = ++tweenGenRef.current
    const start = performance.now()
    function step(now: number) {
      if (tweenGenRef.current !== gen) return
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      graphStore.setViewport({
        cx: from.cx + (to.cx - from.cx) * eased,
        cy: from.cy + (to.cy - from.cy) * eased,
        zoom: from.zoom + (to.zoom - from.zoom) * eased,
      })
      if (t < 1) requestAnimationFrame(step)
      else savePersistedViewport(graphStore.getSnapshot().viewport)
    }
    requestAnimationFrame(step)
  }

  // Escape (graphStore.clearInteraction(), wired globally in GraphNext.tsx)
  // clears focusChain — when it transitions back to null while a pre-focus
  // viewport is stashed, ease back to it. Reactive, not a second Escape
  // listener, so there's exactly one place Escape is handled.
  useEffect(() => {
    if (snapshot.focusChain === null && preFocusViewportRef.current) {
      const to = preFocusViewportRef.current
      preFocusViewportRef.current = null
      easeViewportTo(graphStore.getSnapshot().viewport, to, FOCUS_EASE_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.focusChain])

  function handleFocusEntity(id: GraphId) {
    const chain = computeTwoHopNeighbourhood(GRAPH_DATASET, id)
    const box = boundingBoxOf(snapshot.layout, chain.nodeIds)
    if (!box) return
    preFocusViewportRef.current = graphStore.getSnapshot().viewport
    graphStore.setFocusChain(chain)
    graphStore.setSelection(id)
    easeViewportTo(graphStore.getSnapshot().viewport, viewportToFit(box, snapshot.size, NETWORK_ZOOM_MIN, NETWORK_ZOOM_MAX), FOCUS_EASE_MS)
  }

  // S8.5N: the detail panel's own FOCUS action — graphStore.focusRequest is
  // a one-shot signal (the panel can't compute a viewport itself, it has no
  // size/layout of its own), consumed here via the SAME two-hop-ease logic
  // dbl-click already uses, then cleared immediately.
  useEffect(() => {
    if (snapshot.focusRequest === null) return
    handleFocusEntity(snapshot.focusRequest)
    graphStore.clearFocusRequest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.focusRequest])

  function handleResetView() {
    preFocusViewportRef.current = null
    graphStore.setFocusChain(null)
    velocityRef.current = { x: 0, y: 0 }
    momentumLoopRef.current?.stop()
    graphStore.setViewport(DEFAULT_VIEWPORT)
    savePersistedViewport(DEFAULT_VIEWPORT)
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // S8.4b: "click anywhere during reveal jumps to final state" — the
    // first click's ONLY job while the reveal is still running is to skip
    // it; it must not also pan or select, so this returns before any of
    // that logic runs.
    if (!renderFinal) {
      handleSkipReveal()
      return
    }
    // Pointer capture on the container is only for panning — capturing it
    // when the press actually started ON an entity would redirect the
    // subsequent `click` event to the container too (pointer capture
    // redirects compat mouse events along with pointer events), so the
    // entity's own onClick would never fire. Caught live: clicking a
    // climber silently selected nothing until this guard was added.
    if ((e.target as HTMLElement).closest?.('[data-entity-id]')) {
      panEligibleRef.current = false
      return
    }
    panEligibleRef.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    momentumLoopRef.current?.stop()
    draggingRef.current = false
    const t = performance.now()
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t }
    lastPointerRef.current = { x: e.clientX, y: e.clientY, t }
    velocityRef.current = { x: 0, y: 0 }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const t = performance.now()
    if (e.buttons === 1 && panEligibleRef.current) {
      const dx = e.clientX - lastPointerRef.current.x
      const dy = e.clientY - lastPointerRef.current.y
      const dist = Math.hypot(e.clientX - pointerDownRef.current.x, e.clientY - pointerDownRef.current.y)
      if (dist > PAN_MOVE_THRESHOLD_PX) draggingRef.current = true
      if (draggingRef.current) {
        const dt = Math.max(1, t - lastPointerRef.current.t)
        velocityRef.current = { x: dx / dt, y: dy / dt }
        const vp = graphStore.getSnapshot().viewport
        graphStore.setViewport({ cx: vp.cx + dx, cy: vp.cy + dy, zoom: vp.zoom })
      }
      lastPointerRef.current = { x: e.clientX, y: e.clientY, t }
      return
    }

    if ((e.target as HTMLElement).closest?.('[data-entity-id]')) {
      if (hoveredSubNodeRef.current) {
        hoveredSubNodeRef.current = null
        setSubNodeTooltipPos(null)
      }
      return
    }

    const zoom = graphStore.getSnapshot().viewport.zoom
    if (zoom < SUBNODE_HOVER_ZOOM_THRESHOLD) {
      if (hoveredSubNodeRef.current) {
        graphStore.setHover(null)
        hoveredSubNodeRef.current = null
        setSubNodeTooltipPos(null)
      }
      return
    }

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const vp = graphStore.getSnapshot().viewport
    const worldX = (e.clientX - rect.left - vp.cx) / vp.zoom
    const worldY = (e.clientY - rect.top - vp.cy) / vp.zoom
    const hitRadiusWorld = SUBNODE_HIT_RADIUS_SCREEN_PX / vp.zoom

    let nearestId: GraphId | null = null
    let nearestDist = hitRadiusWorld
    for (const [id, p] of subNodePosRef.current) {
      const d = Math.hypot(p.x - worldX, p.y - worldY)
      if (d < nearestDist) {
        nearestDist = d
        nearestId = id
      }
    }

    if (nearestId !== hoveredSubNodeRef.current) {
      graphStore.setHover(nearestId)
      hoveredSubNodeRef.current = nearestId
    }
    setSubNodeTooltipPos(nearestId ? { x: e.clientX, y: e.clientY } : null)
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingRef.current) {
      lastMomentumTRef.current = null
      momentumLoopRef.current?.start()
    } else {
      const dist = Math.hypot(e.clientX - pointerDownRef.current.x, e.clientY - pointerDownRef.current.y)
      if (dist < PAN_MOVE_THRESHOLD_PX && !(e.target as HTMLElement).closest?.('[data-entity-id]')) {
        graphStore.setSelection(null)
      }
    }
    draggingRef.current = false
  }

  function handlePointerLeave() {
    if (hoveredSubNodeRef.current) {
      graphStore.setHover(null)
      hoveredSubNodeRef.current = null
      setSubNodeTooltipPos(null)
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const factor = Math.min(1.15, Math.max(0.85, 1 - e.deltaY * WHEEL_ZOOM_SENSITIVITY))
    const next = zoomAt(graphStore.getSnapshot().viewport, e.clientX - rect.left, e.clientY - rect.top, factor)
    graphStore.setViewport(next)
    savePersistedViewport(next)
  }

  const { hoverChainIndex, searchIndex, tooltipIndex, watchIds } = useMemo(
    () => ({
      hoverChainIndex: buildHoverChainIndex(GRAPH_DATASET),
      searchIndex: buildSearchIndex(GRAPH_DATASET),
      tooltipIndex: buildTooltipIndex(GRAPH_DATASET),
      watchIds: computeWatchIds(GRAPH_DATASET),
    }),
    [],
  )
  const hoverChain = hoverChainIndex.get(snapshot.hover ?? snapshot.selection ?? '') ?? null
  const searchMatches = useMemo(() => computeSearchMatches(searchIndex, snapshot.searchQuery), [searchIndex, snapshot.searchQuery])
  const filterVisible = useMemo(() => computeFilterVisible(GRAPH_DATASET, snapshot.filter), [snapshot.filter])
  const emphasisCtx: EmphasisContext = { hoverChain, hoveredTier: snapshot.hoveredTier, focusChain: snapshot.focusChain, searchMatches }

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
        style={{ background: GRAPH_BLACK, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      >
        {/* A very faint radial vignette brightening toward the core (S8.5) — helps the density read without competing with the filaments the way a grid would. */}
        <div className="pointer-events-none absolute inset-0" style={{ background: CORE_VIGNETTE }} />
        {snapshot.size.width > 0 && snapshot.size.height > 0 && (
          <div className="absolute inset-0" style={{ transform: `translate(${snapshot.viewport.cx}px, ${snapshot.viewport.cy}px) scale(${snapshot.viewport.zoom})`, transformOrigin: '0 0' }}>
            <NetworkCanvasLayer
              dataset={GRAPH_DATASET}
              size={snapshot.size}
              reduced={reduced}
              spawnPlan={spawnPlan}
              renderFinal={renderFinal}
              filterVisible={filterVisible}
              emphasisCtx={emphasisCtx}
              subNodePosRef={subNodePosRef}
            />
            <NetworkSvgLayer
              dataset={GRAPH_DATASET}
              size={snapshot.size}
              reduced={reduced}
              spawnPlan={spawnPlan}
              renderFinal={renderFinal}
              filterVisible={filterVisible}
              emphasisCtx={emphasisCtx}
              hoverChainIndex={hoverChainIndex}
              tooltipIndex={tooltipIndex}
              watchIds={watchIds}
              environmentReadings={environmentSnapshot.readings}
              onFocusEntity={handleFocusEntity}
            />
          </div>
        )}
        <SpawnTicker spawnPlan={spawnPlan} renderFinal={renderFinal} />
      </div>

      {subNodeTooltipPos && snapshot.hover && (
        <EntityTooltip info={tooltipIndex.get(snapshot.hover) ?? null} x={subNodeTooltipPos.x} y={subNodeTooltipPos.y} watch={false} />
      )}

      <button
        type="button"
        onClick={handleResetView}
        className="pressable absolute right-2 top-2 font-mono"
        style={{ fontSize: 10, letterSpacing: '0.05em', color: TEXT_SECONDARY, background: PANEL, border: `1px solid ${HAIRLINE}`, borderRadius: 4, padding: '4px 8px' }}
        title="Reset pan/zoom to the layout bounds"
      >
        RESET VIEW
      </button>
    </div>
  )
}
