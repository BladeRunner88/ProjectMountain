import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import {
  CANVAS_SIZE,
  CENTER,
  EDGE_REVEAL_DURATION,
  SPAWN_NODE_DURATION,
} from './layout'
import type { Point } from './layout'
import type { EdgeColorKind } from './shapes'
import {
  CompanyNodeShape,
  EDGE_APPEARANCE,
  EnvironmentNodeShape,
  GRAPH_CANVAS_COLOR,
  MajorNodeShape,
  SubNodeShape,
  WEATHER_EDGE_DASH,
} from './shapes'
import { ClimberSidePanel } from './ClimberSidePanel'
import { EnvironmentSidePanel } from './EnvironmentSidePanel'
import { FindingsFeed } from './FindingsFeed'
import { CAPTION_CYCLE, captionValue } from './environmentDisplay'
import { climbers, companies, countries, environments, regions, useGraphSimulationContext } from './GraphSimulationContext'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

interface View {
  cx: number
  cy: number
  zoom: number
}

type Selection = { type: 'climber'; id: string } | { type: 'environment'; id: string }

const CAPTION_CYCLE_MS = 3000
const CAPTION_FADE_MS = 150

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---------------------------------------------------------------------------
// Two separate motion systems, never blended:
//
//  A. SPAWN — once, on mount. Driven entirely by CSS (`.demo-node-spawn` in
//     index.css), parameterized per node via `--start-dx`/`--start-dy` and
//     `animation-delay`. Owns the node's spawn <g>'s transform+opacity only.
//
//  B. IDLE DRIFT — forever, after spawn lands. Driven by one shared
//     requestAnimationFrame loop that imperatively mutates a *different* <g>
//     wrapping the spawn <g>, plus every edge's line endpoints, entirely
//     outside React's render cycle (113 nodes at 60fps is too much for
//     state-driven re-renders). Ref callbacks are memoized per node id so
//     React never sees the ref identity change across re-renders — that's
//     what keeps it from re-invoking (and resetting) them on unrelated
//     re-renders such as hover/select.
// ---------------------------------------------------------------------------

export function ClimberGraphCanvas({ lenses, initialSelection = null }: { lenses: Set<string>; initialSelection?: Selection | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ cx: CANVAS_SIZE / 2, cy: CANVAS_SIZE / 2, zoom: 1 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  // Seeded once from a deep link (e.g. the Records pill's "show me in
  // graph"), never re-applied afterward — ordinary clicks still fully own
  // `selection` from here on.
  const [selection, setSelection] = useState<Selection | null>(initialSelection)
  const reduced = useRef(prefersReducedMotion()).current
  const [mounted, setMounted] = useState(reduced)
  const dragState = useRef<{
    startX: number
    startY: number
    startView: View
    dragging: boolean
    pointerId: number
  } | null>(null)

  const hoverIdRef = useRef<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => {
    hoverIdRef.current = hoverId
  }, [hoverId])
  useEffect(() => {
    selectedIdRef.current = selection?.id ?? null
  }, [selection])

  // Environment node captions cycle WEATHER -> CLIMATE -> ALTITUDE every 3s,
  // cross-fading the value line beneath them. One shared timer for all 14
  // nodes — they're small, decorative labels, not worth independent phases.
  const [captionIndex, setCaptionIndex] = useState(0)
  const [captionFading, setCaptionFading] = useState(false)
  useEffect(() => {
    let fadeTimeout: ReturnType<typeof window.setTimeout> | undefined
    const interval = window.setInterval(() => {
      setCaptionFading(true)
      fadeTimeout = window.setTimeout(() => {
        setCaptionIndex((i) => (i + 1) % CAPTION_CYCLE.length)
        setCaptionFading(false)
      }, CAPTION_FADE_MS)
    }, CAPTION_CYCLE_MS)
    return () => {
      window.clearInterval(interval)
      if (fadeTimeout !== undefined) window.clearTimeout(fadeTimeout)
    }
  }, [])

  const sim = useGraphSimulationContext()
  const { climberVitals, climberSpo2History, climberHrHistory, climberStatus, environmentReading, windHistory, findings, flashId, layout, statusOf } = sim

  useEffect(() => {
    if (reduced) return
    // The <svg> itself only renders once containerSize is known (below), so
    // triggering the spawn-in before that would flip `mounted` before the
    // nodes ever exist in the DOM — they'd be born already at opacity:1 with
    // nothing to transition from. Wait for a real size first.
    if (containerSize.width === 0) return
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [reduced, containerSize.width])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // React's synthetic onWheel is attached passively, so preventDefault()
    // inside it is silently ignored (and logs a console error) — a native
    // listener with { passive: false } is required to actually stop the
    // page from scrolling while zooming the canvas.
    function handleWheelNative(e: WheelEvent) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
      setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom / factor)) }))
    }
    el.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => el.removeEventListener('wheel', handleWheelNative)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Layout (positions/edges/timing) and status roll-up both come from the
  // shared context now — computed once there, not re-derived per canvas
  // mount, so this component only ever reads them.
  const { positions, sizes, edges, tierOf, spawnDelay, driftPhase, driftAmplitude, parentOf } = layout

  const climberById = useMemo(() => new Map(climbers.map((c) => [c.id, c])), [])
  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [])
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [])
  const environmentById = useMemo(() => new Map(environments.map((e) => [e.id, e])), [])

  // Hover's whole "money shot": the hovered node plus its ancestor chain up
  // to the country go full opacity; everything else (siblings, descendants,
  // unrelated branches) drops to 10% — nodes and edges alike.
  const hoverChain = useMemo(() => {
    if (!hoverId) return null
    const nodeIds = new Set<string>([hoverId])
    const edgeKeys = new Set<string>()
    let current = hoverId
    for (;;) {
      const parent = parentOf.get(current)
      if (!parent) break
      edgeKeys.add(`structure-${parent}-${current}`)
      nodeIds.add(parent)
      current = parent
    }
    // an environment's own national weather feed is directly incident to
    // it, so it lights up too — `current` is now the topmost ancestor
    // reached, i.e. the country, exactly the feed's other endpoint
    if (tierOf.get(hoverId) === 'environment') {
      edgeKeys.add(`weather-${hoverId}-${current}`)
    }
    return { nodeIds, edgeKeys }
  }, [hoverId, parentOf, tierOf])

  function edgeColorKind(edge: (typeof edges)[number]): EdgeColorKind {
    if (edge.kind === 'ring') return 'grey'
    // the weather feed's colour comes from the environment (its source),
    // never the country's own (possibly unrelated) rolled-up status
    if (edge.kind === 'weather') return statusOf.get(edge.source) === 'anomaly' ? 'red' : 'blue'
    if (statusOf.get(edge.target) === 'anomaly') return 'red'
    if (tierOf.get(edge.target) === 'climber') return 'blue'
    return 'grey'
  }

  function nodeHoverStyle(id: string): CSSProperties {
    if (!hoverChain) return {}
    return { opacity: hoverChain.nodeIds.has(id) ? 1 : 0.1 }
  }

  // One-shot flash on a live status transition — a third wrapping <g>, kept
  // separate from the spawn <g> so the two CSS animations (both `animation`
  // shorthands) never fight over the same element.
  function flashClassName(id: string): string | undefined {
    return flashId === id ? 'demo-node-flash' : undefined
  }
  function flashStyle(x: number, y: number): CSSProperties {
    return { transformOrigin: `${x}px ${y}px` }
  }

  // --- imperative drift plumbing -------------------------------------------
  // outer <g> per node (drift only) and <line> per edge, registered via
  // stable per-id callbacks so React never re-invokes them on unrelated
  // re-renders (it only treats a ref as "changed" when the callback's own
  // identity differs between renders).
  const driftElRefs = useRef(new Map<string, SVGGElement>())
  const edgeElRefs = useRef(new Map<string, SVGLineElement>())
  const livePositions = useRef(new Map<string, Point>())

  useEffect(() => {
    for (const [id, p] of positions) livePositions.current.set(id, { x: p.x, y: p.y })
  }, [positions])

  const driftRefCallbacks = useMemo(() => {
    const map = new Map<string, (el: SVGGElement | null) => void>()
    for (const id of positions.keys()) {
      map.set(id, (el) => {
        if (el) {
          if (!driftElRefs.current.has(id)) el.style.transform = 'translate(0px, 0px)'
          driftElRefs.current.set(id, el)
        } else {
          driftElRefs.current.delete(id)
        }
      })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions])

  const edgeRefCallbacks = useMemo(() => {
    const map = new Map<string, (el: SVGLineElement | null) => void>()
    for (const edge of edges) {
      const key = `${edge.kind}-${edge.source}-${edge.target}`
      const base1 = positions.get(edge.source)!
      const base2 = positions.get(edge.target)!
      map.set(key, (el) => {
        if (el) {
          if (!edgeElRefs.current.has(key)) {
            el.setAttribute('x1', String(base1.x))
            el.setAttribute('y1', String(base1.y))
            el.setAttribute('x2', String(base2.x))
            el.setAttribute('y2', String(base2.y))
          }
          edgeElRefs.current.set(key, el)
        } else {
          edgeElRefs.current.delete(key)
        }
      })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, edges])

  // idle drift — a single rAF loop for the whole graph, started once spawn
  // has fully landed, and never overlapping the spawn CSS animation.
  useEffect(() => {
    if (reduced || !mounted) return
    const maxSpawnDelay = Math.max(0, ...spawnDelay.values())
    const startDelayMs = maxSpawnDelay + SPAWN_NODE_DURATION + EDGE_REVEAL_DURATION
    const driftIds = [...positions.keys()]
    let rafId = 0

    const startTimer = window.setTimeout(() => {
      function tick(now: number) {
        for (const id of driftIds) {
          if (id === hoverIdRef.current || id === selectedIdRef.current) continue
          const phase = driftPhase.get(id)!
          const amp = driftAmplitude.get(id)!
          const base = positions.get(id)!
          const dx = amp * Math.sin(now * 0.00013 + phase)
          const dy = amp * Math.sin(now * 0.00017 + phase * 1.7)
          livePositions.current.set(id, { x: base.x + dx, y: base.y + dy })
          const el = driftElRefs.current.get(id)
          if (el) el.style.transform = `translate(${dx}px, ${dy}px)`
        }
        for (const edge of edges) {
          const key = `${edge.kind}-${edge.source}-${edge.target}`
          const a = livePositions.current.get(edge.source)
          const b = livePositions.current.get(edge.target)
          const el = edgeElRefs.current.get(key)
          if (el && a && b) {
            el.setAttribute('x1', String(a.x))
            el.setAttribute('y1', String(a.y))
            el.setAttribute('x2', String(b.x))
            el.setAttribute('y2', String(b.y))
          }
        }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }, startDelayMs)

    return () => {
      window.clearTimeout(startTimer)
      if (rafId) cancelAnimationFrame(rafId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, mounted, positions, edges, spawnDelay, driftPhase, driftAmplitude])

  // The shorter screen dimension always shows exactly CANVAS_SIZE/zoom logical
  // units, so nothing is ever clipped regardless of the container's aspect
  // ratio — the longer dimension simply extends further to fill the space.
  const aspect = containerSize.height > 0 ? containerSize.width / containerSize.height : 1
  const shortSide = CANVAS_SIZE / view.zoom
  const viewWidth = aspect >= 1 ? shortSide * aspect : shortSide
  const viewHeight = aspect >= 1 ? shortSide : shortSide / aspect
  const viewBox = `${view.cx - viewWidth / 2} ${view.cy - viewHeight / 2} ${viewWidth} ${viewHeight}`

  const DRAG_THRESHOLD = 4

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // don't capture yet — a plain click (no movement) must still reach the
    // node underneath so hover/select keeps working; only a real drag
    // engages panning, decided in handlePointerMove once threshold is passed
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startView: view,
      dragging: false,
      pointerId: e.pointerId,
    }
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current
    if (!drag || !containerRef.current) return
    const dxScreen = e.clientX - drag.startX
    const dyScreen = e.clientY - drag.startY

    if (!drag.dragging) {
      if (Math.abs(dxScreen) < DRAG_THRESHOLD && Math.abs(dyScreen) < DRAG_THRESHOLD) return
      drag.dragging = true
      e.currentTarget.setPointerCapture(drag.pointerId)
    }

    const rect = containerRef.current.getBoundingClientRect()
    const scale = viewWidth / rect.width
    setView({
      ...drag.startView,
      cx: drag.startView.cx - dxScreen * scale,
      cy: drag.startView.cy - dyScreen * scale,
    })
  }
  function handlePointerUp() {
    dragState.current = null
  }

  const selectedClimber = selection?.type === 'climber' ? climberById.get(selection.id) : undefined
  const selectedCompany = selectedClimber ? companyById.get(selectedClimber.companyId) : undefined
  const selectedEnvironment = selection?.type === 'environment' ? environmentById.get(selection.id) : undefined
  const selectedEnvironmentRegion = selectedEnvironment ? regionById.get(selectedEnvironment.regionId) : undefined
  const exposedClimbers = selectedEnvironment
    ? climbers.filter((c) => companyById.get(c.companyId)?.regionId === selectedEnvironment.regionId)
    : []

  // Spawn <g> style — the *inner* wrapper. Purely CSS-driven; never touched
  // imperatively, so it's safe to hand React a plain style object every
  // render.
  function spawnStyle(id: string, x: number, y: number): CSSProperties {
    if (reduced) {
      return {
        opacity: mounted ? 1 : 0,
        transition: 'opacity 400ms ease-out',
      }
    }
    const startDx = CENTER.x - x
    const startDy = CENTER.y - y
    return {
      transformOrigin: `${x}px ${y}px`,
      animationDelay: `${spawnDelay.get(id) ?? 0}ms`,
      ['--start-dx' as string]: `${startDx}px`,
      ['--start-dy' as string]: `${startDy}px`,
    } as CSSProperties
  }

  function renderEdge(edge: (typeof edges)[number]) {
    const key = `${edge.kind}-${edge.source}-${edge.target}`
    const a = positions.get(edge.source)!
    const b = positions.get(edge.target)!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const appearance = EDGE_APPEARANCE[edgeColorKind(edge)]
    const isChainMember = hoverChain?.edgeKeys.has(key) ?? false
    const finalOpacity = hoverChain ? (isChainMember ? 1 : 0.1) : appearance.opacity
    const isWeather = edge.kind === 'weather'

    return (
      <line
        key={key}
        ref={edgeRefCallbacks.get(key)}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={appearance.color}
        strokeWidth={appearance.width}
        strokeDasharray={isWeather ? WEATHER_EDGE_DASH : reduced ? undefined : length}
        strokeDashoffset={isWeather ? undefined : reduced ? 0 : mounted ? 0 : length}
        opacity={appearance.pulse ? undefined : finalOpacity}
        style={{
          ...(appearance.pulse ? ({ '--pulse-peak': finalOpacity } as CSSProperties) : {}),
          transition: isWeather || reduced ? undefined : `stroke-dashoffset ${EDGE_REVEAL_DURATION}ms linear`,
          transitionDelay: isWeather || reduced ? undefined : `${edge.revealDelay}ms`,
        }}
        className={appearance.pulse ? 'demo-edge-pulse' : undefined}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
      style={{ backgroundColor: GRAPH_CANVAS_COLOR }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={() => setSelection(null)}
    >
      {containerSize.width > 0 && (
        <svg width="100%" height="100%" viewBox={viewBox}>
          {edges.map(renderEdge)}

          {countries.map((country) => {
            const pos = positions.get(country.id)!
            return (
              <g key={country.id} ref={driftRefCallbacks.get(country.id)} style={nodeHoverStyle(country.id)}>
                <g className={reduced ? undefined : 'demo-node-spawn'} style={spawnStyle(country.id, pos.x, pos.y)}>
                  <g className={flashClassName(country.id)} style={flashStyle(pos.x, pos.y)}>
                    <MajorNodeShape
                      x={pos.x}
                      y={pos.y}
                      size={sizes.get(country.id)}
                      label={country.name}
                      status={statusOf.get(country.id)}
                      isMajor={country.isMajor}
                    />
                  </g>
                </g>
              </g>
            )
          })}

          {regions.map((region) => {
            const pos = positions.get(region.id)!
            return (
              <g key={region.id} ref={driftRefCallbacks.get(region.id)} style={nodeHoverStyle(region.id)}>
                <g className={reduced ? undefined : 'demo-node-spawn'} style={spawnStyle(region.id, pos.x, pos.y)}>
                  <g className={flashClassName(region.id)} style={flashStyle(pos.x, pos.y)}>
                    <MajorNodeShape
                      x={pos.x}
                      y={pos.y}
                      size={sizes.get(region.id)}
                      label={region.name}
                      status={statusOf.get(region.id)}
                    />
                  </g>
                </g>
              </g>
            )
          })}

          {environments.map((env) => {
            const pos = positions.get(env.id)!
            const reading = environmentReading.get(env.id)
            const size = sizes.get(env.id) ?? 20
            const isSelected = selection?.type === 'environment' && selection.id === env.id
            const captionKey = CAPTION_CYCLE[captionIndex]
            const captionStyle: CSSProperties = {
              opacity: captionFading ? 0 : 1,
              transition: reduced ? 'none' : `opacity ${CAPTION_FADE_MS}ms ease`,
            }
            return (
              <g key={env.id} ref={driftRefCallbacks.get(env.id)} style={nodeHoverStyle(env.id)}>
                <g
                  className={`${reduced ? '' : 'demo-node-spawn'} cursor-pointer`}
                  style={spawnStyle(env.id, pos.x, pos.y)}
                  onPointerEnter={() => setHoverId(env.id)}
                  onPointerLeave={() => setHoverId((h) => (h === env.id ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelection((s) => (s?.type === 'environment' && s.id === env.id ? null : { type: 'environment', id: env.id }))
                  }}
                >
                  <g className={flashClassName(env.id)} style={flashStyle(pos.x, pos.y)}>
                    <EnvironmentNodeShape x={pos.x} y={pos.y} size={size} status={statusOf.get(env.id) ?? 'nominal'} selected={isSelected} />
                  </g>
                  {reading && (
                    <text
                      x={pos.x}
                      y={pos.y + size / 2 + 14}
                      textAnchor="middle"
                      fontSize={9}
                      className="font-mono"
                      letterSpacing="0.05em"
                      fill="rgba(233,237,242,0.55)"
                      style={captionStyle}
                    >
                      {captionKey}
                    </text>
                  )}
                  {reading && (
                    <text
                      x={pos.x}
                      y={pos.y + size / 2 + 26}
                      textAnchor="middle"
                      fontSize={9}
                      className="font-mono"
                      fill="rgba(233,237,242,0.4)"
                      style={captionStyle}
                    >
                      {captionValue(captionKey, reading, env)}
                    </text>
                  )}
                </g>
              </g>
            )
          })}

          {companies.map((company) => {
            const pos = positions.get(company.id)!
            return (
              <g key={company.id} ref={driftRefCallbacks.get(company.id)} style={nodeHoverStyle(company.id)}>
                <g
                  className={reduced ? undefined : 'demo-node-spawn'}
                  style={spawnStyle(company.id, pos.x, pos.y)}
                  onPointerEnter={() => setHoverId(company.id)}
                  onPointerLeave={() => setHoverId((h) => (h === company.id ? null : h))}
                >
                  <g className={flashClassName(company.id)} style={flashStyle(pos.x, pos.y)}>
                    <CompanyNodeShape x={pos.x} y={pos.y} size={sizes.get(company.id)} status={statusOf.get(company.id) ?? 'nominal'} />
                  </g>
                  {hoverId === company.id && (
                    <text x={pos.x} y={pos.y - 14} textAnchor="middle" fontSize={11} className="font-mono" fill="#FFFFFF">
                      {company.name}
                    </text>
                  )}
                </g>
              </g>
            )
          })}

          {climbers.map((climber) => {
            const pos = positions.get(climber.id)!
            const isHovered = hoverId === climber.id
            const baseRadius = (sizes.get(climber.id) ?? 8) / 2
            return (
              <g key={climber.id} ref={driftRefCallbacks.get(climber.id)} style={nodeHoverStyle(climber.id)}>
                <g
                  className={`${reduced ? '' : 'demo-node-spawn'} cursor-pointer`}
                  style={spawnStyle(climber.id, pos.x, pos.y)}
                  onPointerEnter={() => setHoverId(climber.id)}
                  onPointerLeave={() => setHoverId((h) => (h === climber.id ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelection((s) => (s?.type === 'climber' && s.id === climber.id ? null : { type: 'climber', id: climber.id }))
                  }}
                >
                  <g className={flashClassName(climber.id)} style={flashStyle(pos.x, pos.y)}>
                    <SubNodeShape
                      x={pos.x}
                      y={pos.y}
                      radius={isHovered ? baseRadius + 3 : baseRadius}
                      anomaly={climberStatus.get(climber.id) === 'anomaly'}
                      selected={selection?.type === 'climber' && selection.id === climber.id}
                    />
                  </g>
                  {isHovered && (
                    <text
                      x={pos.x}
                      y={pos.y - 16}
                      textAnchor="middle"
                      fontSize={12}
                      className="font-mono"
                      fill="#FFFFFF"
                    >
                      {climber.name}
                    </text>
                  )}
                </g>
              </g>
            )
          })}
        </svg>
      )}

      {selectedClimber && (
        <ClimberSidePanel
          climber={selectedClimber}
          company={selectedCompany}
          lenses={lenses}
          anomaly={climberStatus.get(selectedClimber.id) === 'anomaly'}
          spo2={climberVitals.get(selectedClimber.id)?.spo2 ?? selectedClimber.baseSpO2}
          hr={climberVitals.get(selectedClimber.id)?.hr ?? selectedClimber.baseHr}
          spo2History={climberSpo2History.get(selectedClimber.id) ?? []}
          hrHistory={climberHrHistory.get(selectedClimber.id) ?? []}
          onClose={() => setSelection(null)}
        />
      )}

      {selectedEnvironment && (
        <EnvironmentSidePanel
          environment={selectedEnvironment}
          region={selectedEnvironmentRegion}
          reading={environmentReading.get(selectedEnvironment.id)}
          status={statusOf.get(selectedEnvironment.id) ?? 'nominal'}
          windHistory={windHistory.get(selectedEnvironment.id) ?? []}
          exposedClimbers={exposedClimbers}
          climberStatus={climberStatus}
          onClose={() => setSelection(null)}
        />
      )}

      <FindingsFeed findings={findings} />
    </div>
  )
}
