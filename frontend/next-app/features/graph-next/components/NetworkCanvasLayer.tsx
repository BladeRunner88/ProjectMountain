'use client'

// S8.5 CANVAS STRATEGY: SVG cannot hold ~2,600 animated sub-nodes at 60fps
// — this layer is the dense mass (sub-nodes + filament edges), redrawn
// FULLY every frame, entirely outside React state/reconciliation. The SVG
// layer (NetworkSvgLayer) sits above it for entities, structural/
// operational edges, environment nodes, labels and interaction.
//
// S8.5N — STAGE 6, THE SPORE RELEASE: "sub-node sprays bud as a mass, 900ms,
// no per-node stagger at this count. They emerge from their parent and fan
// outward together." One shared eased progress value drives EVERY sub-node
// at once: position lerps from its own parent's CURRENT resolved position
// to its own final position, opacity rises alongside. Filaments (entity ->
// sub-node edges) are drawn between the entity's current position and the
// sub-node's CURRENT (still-migrating) position, so they visibly grow
// outward with the mass rather than snapping in at full length. History
// links still draw last, behind everything, over their own window.
//
// Tried and reverted: batching same-colour filaments/sub-nodes into one
// combined path per colour before a single fill() call. Measured LIVE, not
// assumed — it made things dramatically worse (56fps -> 17fps), not
// better: canvas's rasteriser cost scales with the combined path's total
// complexity regardless of call count, so merging ~400 tapered ribbons into
// one path per colour was strictly worse than 400 small independent
// fill() calls. Per-node/per-edge drawing, below, is the measured-faster
// approach.

import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react'
import { graphStore } from '../stores/graphStore'
import { buildColorResolver } from '../services/color'
import { computeHistoryLinkCurve, computeQuadraticCurve, taperedRibbonPoints } from '../services/edgeGeometry'
import { FILAMENT_WIDTH_END, FILAMENT_WIDTH_START, HISTORY_LINK_WIDTH, buildEdgeAppearanceResolver } from '../services/edgeAppearance'
import { SUBNODE_ALERT_RADIUS_PX, SUBNODE_RADIUS_PX } from '../services/sizes'
import { HISTORY_REST_OPACITY, type SpawnPlan } from '../services/spawnStages'
import { HISTORY_GREEN } from '../types/tokens'
import { isFilterVisible, resolveSubNodeOpacity, type EmphasisContext } from '../services/emphasis'
import type { DomainDataset, HistoryLink } from '../types/domain'
import type { GraphId, Point, Size } from '../types/graph'

interface StaticFilament {
  key: string
  sourceId: GraphId
  targetId: GraphId
  color: string
}
interface StaticSubNode {
  id: GraphId
  parentId: GraphId
  color: string
  radius: number
  glow: boolean
}

const HISTORY_DASH: [number, number] = [3, 2]
const TAPER_SEGMENTS = 3

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Ease-out cubic — a decelerating "release" rather than a linear fan-out. */
function easeOutCubic(t: number): number {
  const mt = 1 - t
  return 1 - mt * mt * mt
}

export function NetworkCanvasLayer({
  dataset,
  size,
  reduced,
  spawnPlan,
  renderFinal,
  filterVisible,
  emphasisCtx,
  subNodePosRef,
}: {
  dataset: DomainDataset
  size: Size
  reduced: boolean
  spawnPlan: SpawnPlan
  /** hasEverSpawned || reduced || skip-clicked — sub-nodes and history links render fully landed, no fade-in, no migration. */
  renderFinal: boolean
  filterVisible: ReadonlySet<GraphId> | null
  emphasisCtx: EmphasisContext
  /** S8.8: written every draw frame with each sub-node's current WORLD-space position — NetworkView's own pointermove hit-test (sub-node hover, only active above 2x zoom) reads this instead of re-deriving positions itself. */
  subNodePosRef: RefObject<Map<GraphId, Point>>
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { filaments, subNodes, historyLinks } = useMemo(() => {
    const colors = buildColorResolver(dataset)
    const appearanceFor = buildEdgeAppearanceResolver(dataset, colors)
    // A filament edge is identified by its TARGET being a sub-node, not by
    // `edge.kind === 'filament'` — an alert sub-node's own filament edge is
    // reclassified to kind 'anomaly' in dataset.ts (S8.3's `edgeKind()`), so
    // filtering on kind alone would silently drop every alert sub-node's
    // edge. Checked by reading dataset.ts's own edge-construction code, not
    // assumed.
    const subNodeIdSet = new Set(dataset.subNodes.map((s) => s.id))
    const filamentEdges = dataset.edges.filter((e) => subNodeIdSet.has(e.target))
    const filaments: StaticFilament[] = filamentEdges.map((e) => ({
      key: `${e.source}->${e.target}`,
      sourceId: e.source,
      targetId: e.target,
      color: appearanceFor(e.source, e.target, e.kind).color,
    }))
    const subNodes: StaticSubNode[] = dataset.subNodes.map((s) => ({
      id: s.id,
      parentId: s.parentId,
      color: colors.colorFor(s.id),
      radius: s.status === 'alert' ? SUBNODE_ALERT_RADIUS_PX : SUBNODE_RADIUS_PX,
      glow: colors.glowFor(s.id),
    }))
    return { filaments, subNodes, historyLinks: dataset.historyLinks }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.version])

  // Read fresh every frame via refs, not effect deps — filterVisible and
  // emphasisCtx change on nearly every mouse move (hover) and every
  // keystroke (search), and tearing down/rebuilding the whole draw loop
  // that often would glitch the reveal.
  const filterVisibleRef = useRef(filterVisible)
  const emphasisCtxRef = useRef(emphasisCtx)
  useEffect(() => {
    filterVisibleRef.current = filterVisible
    emphasisCtxRef.current = emphasisCtx
  }, [filterVisible, emphasisCtx])

  const spawnStartRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    spawnStartRef.current = performance.now()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(size.width * dpr))
    canvas.height = Math.max(1, Math.round(size.height * dpr))
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`

    function draw(layout: ReadonlyMap<GraphId, Point>, offsets: ReadonlyMap<GraphId, Point>, nowMs: number) {
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.width, size.height)

      const cx = size.width / 2
      const cy = size.height / 2
      const filterVisible = filterVisibleRef.current
      const emphasis = emphasisCtxRef.current
      const positions = subNodePosRef.current

      function currentPos(id: GraphId): Point | null {
        const base = layout.get(id)
        if (!base) return null
        const off = offsets.get(id)
        return off ? { x: base.x + off.x, y: base.y + off.y } : base
      }

      // -- history links FIRST, behind everything else ---------------------
      const historyProgress = renderFinal ? 1 : clamp01((nowMs - spawnStartRef.current - spawnPlan.historyStartMs) / spawnPlan.historyDurationMs)
      if (historyProgress > 0) {
        const activeMachineId = graphStore.getSnapshot().hover ?? graphStore.getSnapshot().selection
        ctx.setLineDash(HISTORY_DASH)
        for (const link of historyLinks as HistoryLink[]) {
          const a = currentPos(link.machineId)
          const b = currentPos(link.plantId)
          if (!a || !b) continue
          const restOpacity = HISTORY_REST_OPACITY * historyProgress
          const opacity = activeMachineId ? (activeMachineId === link.machineId ? 1 : 0.04) : restOpacity
          if (opacity <= 0) continue
          const curve = computeHistoryLinkCurve(a, b, { x: cx, y: cy })
          ctx.globalAlpha = opacity
          ctx.strokeStyle = HISTORY_GREEN
          ctx.lineWidth = HISTORY_LINK_WIDTH
          ctx.beginPath()
          ctx.moveTo(curve.x1, curve.y1)
          ctx.quadraticCurveTo(curve.cx, curve.cy, curve.x2, curve.y2)
          ctx.stroke()
        }
        ctx.setLineDash([])
      }
      ctx.globalAlpha = 1

      // -- the spore release: one shared eased progress, position lerps FROM the parent --
      const rawProgress = renderFinal ? 1 : clamp01((nowMs - spawnStartRef.current - spawnPlan.subNodeStartMs) / spawnPlan.subNodeDurationMs)
      if (rawProgress <= 0) return
      const eased = renderFinal ? 1 : easeOutCubic(rawProgress)

      function releasedPos(id: GraphId, parentId: GraphId): Point | null {
        const own = currentPos(id)
        if (!own) return null
        if (renderFinal) return own
        const parent = currentPos(parentId)
        if (!parent) return own
        return { x: parent.x + (own.x - parent.x) * eased, y: parent.y + (own.y - parent.y) * eased }
      }

      for (const f of filaments) {
        if (!isFilterVisible(f.sourceId, filterVisible) || !isFilterVisible(f.targetId, filterVisible)) continue
        const a = currentPos(f.sourceId)
        const b = releasedPos(f.targetId, f.sourceId)
        if (!a || !b) continue
        const curve = computeQuadraticCurve(f.key, a, b)
        const poly = taperedRibbonPoints(curve, FILAMENT_WIDTH_START, FILAMENT_WIDTH_END, TAPER_SEGMENTS)
        ctx.globalAlpha = eased * resolveSubNodeOpacity(f.targetId, f.sourceId, emphasis)
        ctx.fillStyle = f.color
        ctx.beginPath()
        poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        ctx.closePath()
        ctx.fill()
      }

      for (const n of subNodes) {
        if (!isFilterVisible(n.parentId, filterVisible)) continue
        const p = releasedPos(n.id, n.parentId)
        if (!p) continue
        positions.set(n.id, p)
        const subOpacity = resolveSubNodeOpacity(n.id, n.parentId, emphasis)

        if (n.glow) {
          ctx.globalAlpha = 0.35 * eased * subOpacity
          ctx.fillStyle = n.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, n.radius * 3.2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = eased * subOpacity
        ctx.fillStyle = n.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, n.radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // draw once immediately with whatever the store already has (covers
    // reduced-motion and the frame before the loop's first tick)
    draw(graphStore.getSnapshot().layout, graphStore.getOffsets(), performance.now())
    // S8.10: a real bug, caught live by the reduced-motion regression check
    // — spawn already branched on `reduced` above, but this layer kept
    // subscribing to the drift frame loop regardless, so sub-nodes and
    // filaments went right on drifting under prefers-reduced-motion even
    // though NetworkSvgLayer's entities correctly froze. One static draw
    // is the whole picture when reduced; never subscribe to frames at all.
    if (reduced) return
    return graphStore.subscribeFrame((offsets, nowMs) => draw(graphStore.getSnapshot().layout, offsets, nowMs))
    // subNodePosRef is a stable ref identity from the parent — omitted deliberately, same as filterVisibleRef/emphasisCtxRef above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filaments, subNodes, historyLinks, spawnPlan, renderFinal, size.width, size.height, reduced])

  return <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" />
}
