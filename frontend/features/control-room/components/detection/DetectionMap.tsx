'use client'

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import {
  ANOMALY,
  BORDER_WIDTH,
  CANVAS,
  HAIRLINE,
  MAP_GRID_LINE,
  MAP_GRID_LINE_HEAVY,
  MAP_HEADER_MACHINE,
  MAP_HEADER_COUNTRY,
  MAP_HEADER_OPERATOR,
  MAP_HEADER_LINE,
  MAP_HEADER_RULE,
  MAP_HEADER_SENSOR,
  NOMINAL,
  OVERLAY,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_8,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { useSelection } from '@/features/ase/client'
import { formatElapsed } from '@/features/ase/services/activity'
import {
  ancestorsOf,
  applyCollapse,
  buildDetectionGraph,
  neighborhood,
  type DetectionGraph,
  type GraphNode,
  type GraphNodeKind,
  type GraphWire,
} from '@/features/ase/services/detectionGraph'
import type { DetectionEngineState } from '@/features/ase/services/detection'
import {
  driveSprings,
  focusRingStyle,
  rubberBand,
  Spring,
  SPRING_SETTLE,
  tabHref,
  useFocusRing,
} from '@/features/control-room'

const KIND_HEADER_COLOR: Record<GraphNodeKind, string> = {
  country: MAP_HEADER_COUNTRY,
  line: MAP_HEADER_LINE,
  operator: MAP_HEADER_OPERATOR,
  machine: MAP_HEADER_MACHINE,
  sensor: MAP_HEADER_SENSOR,
  rule: MAP_HEADER_RULE,
}
const SEVERITY_COLOR: Record<string, string> = { critical: ANOMALY, high: ANOMALY, medium: WATCH, low: TEXT_DIM }

const NODE_WIDTH = 390
const HEADER_HEIGHT = 58
const PORT_ROW_HEIGHT = 34
const NODE_PADDING_V = 17
const COLUMN_GAP = 220
const COLUMN_ORDER: GraphNodeKind[] = ['rule', 'country', 'line', 'operator', 'sensor', 'machine']
const COLUMN_X: Record<GraphNodeKind, number> = COLUMN_ORDER.reduce(
  (acc, kind, i) => {
    acc[kind] = 30 + i * (NODE_WIDTH + COLUMN_GAP)
    return acc
  },
  {} as Record<GraphNodeKind, number>
)
const ROW_GAP = 50
const MIN_SCALE = 0.15
const MAX_SCALE = 2.5
const RESET_VIEW_MIN_SCALE = 0.6

function nodeHeight(node: GraphNode): number {
  const left = node.ports.filter((p) => p.side === 'left').length
  const right = node.ports.filter((p) => p.side === 'right').length
  const rows = Math.max(left, right, node.isSummary ? 1 : 0)
  return HEADER_HEIGHT + NODE_PADDING_V * 2 + Math.max(rows, 1) * PORT_ROW_HEIGHT
}

interface Layout {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
}

function computeLayout(graph: DetectionGraph): Layout {
  const byKind: Record<GraphNodeKind, GraphNode[]> = {
    rule: [],
    country: [],
    line: [],
    operator: [],
    machine: [],
    sensor: [],
  }
  for (const n of graph.nodes) byKind[n.kind].push(n)

  function indexMap(list: GraphNode[]): Map<string, number> {
    const m = new Map<string, number>()
    list.forEach((n, i) => m.set(n.id, i))
    return m
  }
  function orderByParent(list: GraphNode[], parentIdx: Map<string, number>): GraphNode[] {
    return [...list].sort((a, b) => {
      const pa = parentIdx.get(a.parentId ?? '') ?? 0
      const pb = parentIdx.get(b.parentId ?? '') ?? 0
      return pa !== pb ? pa - pb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  }

  const rules = byKind.rule
  const countries = byKind.country
  const countryIdx = indexMap(countries)
  const lines = orderByParent(byKind.line, countryIdx)
  const lineIdx = indexMap(lines)
  const operators = orderByParent(byKind.operator, lineIdx)
  const operatorIdx = indexMap(operators)
  const machines = orderByParent(byKind.machine, operatorIdx)
  const sensors = orderByParent(byKind.sensor, lineIdx)

  const positions = new Map<string, { x: number; y: number }>()
  let maxBottom = 0
  function place(list: GraphNode[], kind: GraphNodeKind): void {
    let y = 24
    for (const n of list) {
      positions.set(n.id, { x: COLUMN_X[kind], y })
      y += nodeHeight(n) + ROW_GAP
    }
    maxBottom = Math.max(maxBottom, y)
  }
  place(rules, 'rule')
  place(countries, 'country')
  place(lines, 'line')
  place(operators, 'operator')
  place(machines, 'machine')
  place(sensors, 'sensor')

  const width = COLUMN_X.machine + NODE_WIDTH + 40
  const height = maxBottom + 40
  return { positions, width, height }
}

export function DetectionMap({
  engine,
  selectedRuleId,
  onSelectSubject,
}: {
  engine: DetectionEngineState
  selectedRuleId: string | null
  onSelectSubject: (nodeId: string) => void
}): ReactElement {
  const { select } = useSelection()
  const router = useRouter()

  const fullGraph = useMemo(() => buildDetectionGraph(engine), [engine])
  const [collapsedKinds, setCollapsedKinds] = useState<Set<GraphNodeKind>>(new Set(['operator', 'machine']))
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set())
  const collapsedGraph = useMemo(
    () => applyCollapse(fullGraph, collapsedKinds, manuallyExpanded),
    [fullGraph, collapsedKinds, manuallyExpanded]
  )

  const [focusId, setFocusId] = useState<string | null>(null)
  const graph = useMemo<DetectionGraph>(() => {
    if (!focusId || !collapsedGraph.nodes.some((n) => n.id === focusId)) return collapsedGraph
    const ids = neighborhood(collapsedGraph, focusId, 2)
    return {
      nodes: collapsedGraph.nodes.filter((n) => ids.has(n.id)),
      wires: collapsedGraph.wires.filter((w) => ids.has(w.fromId) && ids.has(w.toId)),
    }
  }, [collapsedGraph, focusId])

  const layout = useMemo(() => computeLayout(graph), [graph])
  const [dragOverrides, setDragOverrides] = useState<Map<string, { x: number; y: number }>>(new Map())
  const positions = useMemo(() => {
    const merged = new Map(layout.positions)
    for (const [id, pos] of dragOverrides) if (merged.has(id)) merged.set(id, pos)
    return merged
  }, [layout, dragOverrides])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hoverCone = useMemo(() => {
    if (!hoveredId) return null
    const ids = new Set<string>([hoveredId, ...ancestorsOf(graph, hoveredId)])
    for (const w of graph.wires) {
      if (w.toId === hoveredId) ids.add(w.fromId)
      if (w.fromId === hoveredId) ids.add(w.toId)
    }
    return ids
  }, [graph, hoveredId])

  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 900, height: 640 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return (): void => ro.disconnect()
  }, [])

  const springX = useRef(new Spring(40, SPRING_SETTLE))
  const springY = useRef(new Spring(40, SPRING_SETTLE))
  const springScale = useRef(new Spring(1, SPRING_SETTLE))
  const [view, setView] = useState({ x: 40, y: 40, scale: 1 })
  const [panning, setPanning] = useState(false)
  function publishView(): void {
    setView({ x: springX.current.value, y: springY.current.value, scale: springScale.current.value })
  }
  const draggingRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
    | { kind: 'node'; nodeId: string; grabDx: number; grabDy: number }
    | null
  >(null)
  const panActiveRef = useRef(false)

  useEffect(() => {
    const stop = driveSprings(
      [springX.current, springY.current, springScale.current],
      publishView,
      () => panActiveRef.current === false
    )
    return stop
  }, [])

  function boundsFor(): { minX: number; maxX: number; minY: number; maxY: number } {
    const scale = springScale.current.value
    const contentW = layout.width * scale
    const contentH = layout.height * scale
    return {
      minX: Math.min(40, viewport.width - contentW - 40),
      maxX: 40,
      minY: Math.min(40, viewport.height - contentH - 40),
      maxY: 40,
    }
  }

  function resetView(): void {
    const scaleX = viewport.width / (layout.width + 80)
    const scaleY = viewport.height / (layout.height + 80)
    const fit = Math.min(Math.max(Math.min(scaleX, scaleY), RESET_VIEW_MIN_SCALE), MAX_SCALE)
    springScale.current.jumpTo(fit)
    springX.current.jumpTo(40)
    springY.current.jumpTo(40)
    publishView()
  }
  useEffect(() => {
    resetView()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewport is measured; user pan/zoom must persist
  }, [layout.width, layout.height])

  function onCanvasPointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    panActiveRef.current = true
    setPanning(true)
    draggingRef.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      originX: springX.current.value,
      originY: springY.current.value,
    }
  }
  function onCanvasPointerMove(e: PointerEvent<HTMLDivElement>): void {
    const drag = draggingRef.current
    if (!drag) return
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const b = boundsFor()
      const nextX = rubberBand(drag.originX + dx, b.minX, b.maxX, 0.55, viewport.width)
      const nextY = rubberBand(drag.originY + dy, b.minY, b.maxY, 0.55, viewport.height)
      springX.current.jumpTo(nextX)
      springY.current.jumpTo(nextY)
      publishView()
    } else {
      const el = containerRef.current
      if (!el) return
      const worldX = (e.clientX - el.getBoundingClientRect().left - springX.current.value) / springScale.current.value
      const worldY = (e.clientY - el.getBoundingClientRect().top - springY.current.value) / springScale.current.value
      const next = new Map(dragOverrides)
      next.set(drag.nodeId, { x: worldX - drag.grabDx, y: worldY - drag.grabDy })
      setDragOverrides(next)
    }
  }
  function onCanvasPointerUp(): void {
    const drag = draggingRef.current
    if (drag?.kind === 'pan') {
      const b = boundsFor()
      springX.current.setTarget(Math.min(Math.max(springX.current.value, b.minX), b.maxX))
      springY.current.setTarget(Math.min(Math.max(springY.current.value, b.minY), b.maxY))
    }
    panActiveRef.current = false
    setPanning(false)
    draggingRef.current = null
    driveSprings([springX.current, springY.current, springScale.current], publishView, () => true)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const canvas: HTMLDivElement = el
    function handleWheel(e: WheelEvent): void {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      const prevScale = springScale.current.value
      const nextScale = Math.min(Math.max(prevScale * (1 - e.deltaY * 0.001), MIN_SCALE), MAX_SCALE)
      const worldX = (cursorX - springX.current.value) / prevScale
      const worldY = (cursorY - springY.current.value) / prevScale
      springScale.current.jumpTo(nextScale)
      springX.current.jumpTo(cursorX - worldX * nextScale)
      springY.current.jumpTo(cursorY - worldY * nextScale)
      publishView()
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return (): void => canvas.removeEventListener('wheel', handleWheel)
  }, [])

  function startNodeDrag(e: PointerEvent<HTMLDivElement>, node: GraphNode): void {
    e.stopPropagation()
    const pos = positions.get(node.id)
    const el = containerRef.current
    if (!pos || !el) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    const worldX = (e.clientX - rect.left - springX.current.value) / springScale.current.value
    const worldY = (e.clientY - rect.top - springY.current.value) / springScale.current.value
    draggingRef.current = { kind: 'node', nodeId: node.id, grabDx: worldX - pos.x, grabDy: worldY - pos.y }
  }

  function activate(node: GraphNode): void {
    if (node.kind === 'rule') return
    if (node.isSummary) {
      const next = new Set(manuallyExpanded)
      next.add(node.parentId ?? '')
      setManuallyExpanded(next)
      return
    }
    if (node.machineId) {
      select({ kind: 'identity', machineId: node.machineId })
      router.push(tabHref('identity'))
      return
    }
    onSelectSubject(node.id)
  }

  const tx = view.x
  const ty = view.y
  const scale = view.scale

  if (fullGraph.nodes.length === 0) {
    return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No detection graph to show.</p>
  }

  return (
    <div>
      <MapToolbar
        graph={collapsedGraph}
        collapsedKinds={collapsedKinds}
        onToggleCollapse={(kind) => {
          const next = new Set(collapsedKinds)
          if (next.has(kind)) next.delete(kind)
          else next.add(kind)
          setCollapsedKinds(next)
          setManuallyExpanded(new Set())
        }}
        focusId={focusId}
        onFocus={setFocusId}
        onResetView={resetView}
      />
      <div
        ref={containerRef}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        className="relative"
        style={{
          width: '100%',
          height: 'calc(100vh - 340px)',
          minHeight: 640,
          overflow: 'hidden',
          background: CANVAS,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          cursor: panning ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <GridBackground width={layout.width} height={layout.height} />
          <svg
            width={layout.width}
            height={layout.height}
            style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
          >
            {graph.wires.map((w) => (
              <WirePath
                key={w.id}
                wire={w}
                positions={positions}
                graph={graph}
                selectedRuleId={selectedRuleId}
                hoverCone={hoverCone}
              />
            ))}
          </svg>
          {graph.nodes.map((node) => {
            const pos = positions.get(node.id)
            if (!pos) return null
            return (
              <NodeCard
                key={node.id}
                node={node}
                pos={pos}
                selectedRuleId={selectedRuleId}
                hoverCone={hoverCone}
                onPointerDown={(e) => startNodeDrag(e, node)}
                onHover={setHoveredId}
                onClick={() => activate(node)}
              />
            )
          })}
        </div>
        <Minimap graph={graph} positions={positions} layout={layout} viewport={viewport} tx={tx} ty={ty} scale={scale} />
      </div>
    </div>
  )
}

function MapToolbar({
  graph,
  collapsedKinds,
  onToggleCollapse,
  focusId,
  onFocus,
  onResetView,
}: {
  graph: DetectionGraph
  collapsedKinds: Set<GraphNodeKind>
  onToggleCollapse: (kind: GraphNodeKind) => void
  focusId: string | null
  onFocus: (id: string | null) => void
  onResetView: () => void
}): ReactElement {
  const focusable = useMemo(
    () => graph.nodes.filter((n) => n.kind !== 'rule' && !n.isSummary).sort((a, b) => a.label.localeCompare(b.label)),
    [graph]
  )
  const { focused: resetFocused, handlers: resetHandlers } = useFocusRing()
  return (
    <div className="flex items-center flex-wrap" style={{ gap: SPACE_8, marginBottom: SPACE_8 }}>
      <ToolbarToggle
        label="Collapse operators"
        active={collapsedKinds.has('operator')}
        onClick={() => onToggleCollapse('operator')}
      />
      <ToolbarToggle
        label="Collapse machines"
        active={collapsedKinds.has('machine')}
        onClick={() => onToggleCollapse('machine')}
      />
      <select
        value={focusId ?? ''}
        onChange={(e) => onFocus(e.target.value || null)}
        aria-label="Focus"
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          color: focusId ? TEXT_PRIMARY : TEXT_SECONDARY,
          background: PANEL_RAISED,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: SPACE_8,
        }}
      >
        <option value="">Focus…</option>
        {focusable.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
      {focusId ? <ToolbarToggle label="Clear focus ×" active onClick={() => onFocus(null)} /> : null}
      <button
        type="button"
        onClick={onResetView}
        {...resetHandlers}
        className="pressable"
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          color: TEXT_SECONDARY,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: `${SPACE_8}px 12px`,
          cursor: 'pointer',
          ...focusRingStyle(resetFocused),
        }}
      >
        RESET VIEW
      </button>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
        drag empty canvas to pan · scroll to zoom · drag a node to move it
      </span>
    </div>
  )
}

function ToolbarToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
        border: `${BORDER_WIDTH}px solid ${active ? TEXT_SECONDARY : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px 12px`,
        cursor: 'pointer',
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}

function GridBackground({ width, height }: { width: number; height: number }): ReactElement {
  return (
    <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs>
        <pattern id="detection-map-grid" width={24} height={24} patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke={MAP_GRID_LINE} strokeWidth={1} />
        </pattern>
        <pattern id="detection-map-grid-heavy" width={120} height={120} patternUnits="userSpaceOnUse">
          <rect width={120} height={120} fill="url(#detection-map-grid)" />
          <path d="M 120 0 L 0 0 0 120" fill="none" stroke={MAP_GRID_LINE_HEAVY} strokeWidth={1} />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#detection-map-grid-heavy)" />
    </svg>
  )
}

function NodeCard({
  node,
  pos,
  selectedRuleId,
  hoverCone,
  onPointerDown,
  onHover,
  onClick,
}: {
  node: GraphNode
  pos: { x: number; y: number }
  selectedRuleId: string | null
  hoverCone: Set<string> | null
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void
  onHover: (id: string | null) => void
  onClick: () => void
}): ReactElement {
  const [hoveredPort, setHoveredPort] = useState<string | null>(null)
  const height = nodeHeight(node)
  const dimmedByRule = selectedRuleId
    ? !(node.kind === 'rule' ? node.id === `rule:${selectedRuleId}` : node.firingRuleIds.includes(selectedRuleId))
    : false
  const dimmedByHover = hoverCone ? !hoverCone.has(node.id) : false
  const opacity = dimmedByRule || dimmedByHover ? 0.12 : 1
  const headerColor = KIND_HEADER_COLOR[node.kind]
  const ringColor = node.status === 'anomaly' ? ANOMALY : node.status === 'watch' ? WATCH : null
  const multiFiring = node.firingRuleIds.length > 1

  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="pressable absolute"
      style={{
        left: pos.x,
        top: pos.y,
        width: NODE_WIDTH,
        height,
        opacity,
        cursor: node.kind === 'rule' ? 'default' : 'pointer',
        transition: 'opacity 100ms var(--cr-ease-out)',
        boxShadow: ringColor ? `0 0 0 ${multiFiring ? 5 : 3}px ${ringColor}` : 'none',
        borderRadius: RADIUS_INTERACTIVE,
      }}
    >
      <div
        style={{
          height: HEADER_HEIGHT,
          background: headerColor,
          borderTopLeftRadius: RADIUS_INTERACTIVE,
          borderTopRightRadius: RADIUS_INTERACTIVE,
          borderTop: node.kind === 'rule' && node.severity ? `5px solid ${SEVERITY_COLOR[node.severity]}` : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <span
          className="truncate"
          style={{
            ...TYPE_CAPTION,
            fontSize: 20,
            textTransform: 'none',
            letterSpacing: 'normal',
            color: CANVAS,
            fontWeight: 600,
          }}
        >
          {node.label}
        </span>
        <span className="flex items-center" style={{ gap: 10 }}>
          {multiFiring ? (
            <span style={{ ...TYPE_CAPTION, fontSize: 18, color: CANVAS, fontWeight: 700 }}>
              ×{node.firingRuleIds.length}
            </span>
          ) : null}
          {node.serialTail ? (
            <span className="font-mono" style={{ ...TYPE_CAPTION, fontSize: 18, color: CANVAS, opacity: 0.7 }}>
              …{node.serialTail}
            </span>
          ) : null}
        </span>
      </div>
      <div
        style={{
          background: PANEL_RAISED,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderTop: 'none',
          borderBottomLeftRadius: RADIUS_INTERACTIVE,
          borderBottomRightRadius: RADIUS_INTERACTIVE,
          height: height - HEADER_HEIGHT,
          padding: `${NODE_PADDING_V}px 0`,
          position: 'relative',
        }}
      >
        {node.ports.map((port) => (
          <div
            key={port.id}
            onMouseEnter={(e) => {
              e.stopPropagation()
              setHoveredPort(port.id)
            }}
            onMouseLeave={(e) => {
              e.stopPropagation()
              setHoveredPort((p) => (p === port.id ? null : p))
            }}
            className="relative"
            style={{
              height: PORT_ROW_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: port.side === 'left' ? 'flex-start' : 'flex-end',
              padding: '0 16px',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                [port.side === 'left' ? 'left' : 'right']: -8,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: port.live ? NOMINAL : HAIRLINE,
                border: `2px solid ${port.live ? NOMINAL : TEXT_DIM}`,
              }}
            />
            <span style={{ fontSize: 17, color: port.live ? TEXT_PRIMARY : TEXT_DIM }}>{port.label}</span>
            {hoveredPort === port.id ? <PortTooltip port={port} side={port.side} /> : null}
          </div>
        ))}
        {node.ports.length === 0 ? (
          <div style={{ padding: '0 16px', fontSize: 17, color: TEXT_DIM }}>
            {node.isSummary ? 'click to expand' : ''}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PortTooltip({
  port,
  side,
}: {
  port: GraphNode['ports'][number]
  side: 'left' | 'right'
}): ReactElement {
  return (
    <div
      className="absolute"
      style={{
        [side === 'left' ? 'left' : 'right']: 12,
        top: '100%',
        marginTop: 2,
        background: CANVAS,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: '6px 12px',
        whiteSpace: 'nowrap',
        zIndex: 10,
      }}
    >
      {port.live ? (
        <>
          <p style={{ fontSize: 17, color: TEXT_PRIMARY }}>
            {port.label}: {port.live.valueText}
          </p>
          <p style={{ fontSize: 15, color: TEXT_DIM }}>
            {formatElapsed(port.live.ageAt)} · {port.live.confidencePct}% confidence
          </p>
        </>
      ) : (
        <p style={{ fontSize: 17, color: TEXT_DIM }}>{port.label}: not currently monitored</p>
      )}
    </div>
  )
}

function portAnchor(
  node: GraphNode,
  pos: { x: number; y: number },
  portId: string | null
): { x: number; y: number } {
  if (!portId) {
    return { x: pos.x + NODE_WIDTH / 2, y: pos.y + HEADER_HEIGHT / 2 }
  }
  const port = node.ports.find((p) => p.id === portId)
  if (!port) return { x: pos.x + NODE_WIDTH / 2, y: pos.y + HEADER_HEIGHT / 2 }
  const sameSide = node.ports.filter((p) => p.side === port.side)
  const idx = sameSide.indexOf(port)
  const y = pos.y + HEADER_HEIGHT + NODE_PADDING_V + idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2
  const x = port.side === 'left' ? pos.x : pos.x + NODE_WIDTH
  return { x, y }
}

function WirePath({
  wire,
  positions,
  graph,
  selectedRuleId,
  hoverCone,
}: {
  wire: GraphWire
  positions: Map<string, { x: number; y: number }>
  graph: DetectionGraph
  selectedRuleId: string | null
  hoverCone: Set<string> | null
}): ReactElement | null {
  const fromNode = graph.nodes.find((n) => n.id === wire.fromId)
  const toNode = graph.nodes.find((n) => n.id === wire.toId)
  const fromPos = positions.get(wire.fromId)
  const toPos = positions.get(wire.toId)
  if (!fromNode || !toNode || !fromPos || !toPos) return null

  const from = portAnchor(fromNode, fromPos, wire.fromPortId)
  const to = portAnchor(toNode, toPos, wire.toPortId)
  const dx = Math.max(Math.abs(to.x - from.x) * 0.5, 40)
  const d = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`

  const isRuleFilterMatch = selectedRuleId
    ? wire.fromId === `rule:${selectedRuleId}` || wire.toId === `rule:${selectedRuleId}`
    : true
  const isHoverMatch = hoverCone ? hoverCone.has(wire.fromId) && hoverCone.has(wire.toId) : true
  const dimmed = !isRuleFilterMatch || !isHoverMatch

  let stroke = TEXT_SECONDARY
  let strokeWidth = 2
  let dash: string | undefined
  let opacity = 0.5

  if (wire.kind === 'anomaly') {
    stroke = ANOMALY
    strokeWidth = 2.5
    opacity = 0.9
  } else if (wire.kind === 'detection') {
    stroke = NOMINAL
    strokeWidth = 1.5
    opacity = 0.85
  } else if (wire.kind === 'structure' && wire.colorToken === 'watch') {
    stroke = NOMINAL
    opacity = 0.75
  } else if (wire.kind === 'past') {
    stroke = TEXT_SECONDARY
    strokeWidth = 1
    dash = '1 4'
    opacity = 0.3
  }

  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dash}
      opacity={dimmed ? Math.min(opacity, 0.08) : selectedRuleId && isRuleFilterMatch ? 1 : opacity}
      className={wire.kind === 'anomaly' ? 'detection-map-wire-pulse' : undefined}
    />
  )
}

function Minimap({
  graph,
  positions,
  layout,
  viewport,
  tx,
  ty,
  scale,
}: {
  graph: DetectionGraph
  positions: Map<string, { x: number; y: number }>
  layout: Layout
  viewport: { width: number; height: number }
  tx: number
  ty: number
  scale: number
}): ReactElement {
  const MM_W = 160
  const MM_H = 110
  const mScale = Math.min(MM_W / layout.width, MM_H / layout.height)
  const viewX = -tx / scale
  const viewY = -ty / scale
  const viewW = viewport.width / scale
  const viewH = viewport.height / scale

  return (
    <div
      className="absolute"
      style={{
        right: 8,
        bottom: 8,
        width: MM_W,
        height: MM_H,
        background: OVERLAY,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
      }}
    >
      <svg width={MM_W} height={MM_H}>
        {graph.nodes.map((n) => {
          const p = positions.get(n.id)
          if (!p) return null
          return (
            <rect
              key={n.id}
              x={p.x * mScale}
              y={p.y * mScale}
              width={Math.max(NODE_WIDTH * mScale, 1.5)}
              height={Math.max(nodeHeight(n) * mScale, 1.5)}
              fill={n.status === 'anomaly' ? ANOMALY : KIND_HEADER_COLOR[n.kind]}
              opacity={0.8}
            />
          )
        })}
        <rect
          x={viewX * mScale}
          y={viewY * mScale}
          width={viewW * mScale}
          height={viewH * mScale}
          fill="none"
          stroke={TEXT_PRIMARY}
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
