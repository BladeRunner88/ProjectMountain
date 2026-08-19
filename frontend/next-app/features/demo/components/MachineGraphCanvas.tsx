'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'

import { LoadingState } from '@/components/ui/loading-state'

import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useGraphSimulationContext } from './GraphSimulationProvider'
import { machines, companies, countries, environments, plants } from '../services/dataset'
import { CAPTION_CYCLE, captionValue } from '../services/environmentDisplay'
import {
  CANVAS_SIZE,
  CENTER,
  EDGE_REVEAL_DURATION,
  SPAWN_NODE_DURATION,
  type HierarchyEdge,
  type Point,
} from '../services/layout'
import type { GraphSelection } from '../types/simulation'
import { MachineSidePanel } from './MachineSidePanel'
import { EnvironmentSidePanel } from './EnvironmentSidePanel'
import { FindingsFeed } from './FindingsFeed'
import {
  CompanyNodeShape,
  EDGE_APPEARANCE,
  EnvironmentNodeShape,
  GRAPH_CANVAS_COLOR,
  MajorNodeShape,
  SubNodeShape,
  WEATHER_EDGE_DASH,
  type EdgeColorKind,
} from './shapes'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

interface View {
  cx: number
  cy: number
  zoom: number
}

const CAPTION_CYCLE_MS = 3000
const CAPTION_FADE_MS = 150

export function MachineGraphCanvas({
  lenses,
  initialSelection = null,
}: {
  lenses: Set<string>
  initialSelection?: GraphSelection | null
}): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ cx: CANVAS_SIZE / 2, cy: CANVAS_SIZE / 2, zoom: 1 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selection, setSelection] = useState<GraphSelection | null>(initialSelection)
  const reduced = usePrefersReducedMotion()
  const [mounted, setMounted] = useState(false)
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

  const [captionIndex, setCaptionIndex] = useState(0)
  const [captionFading, setCaptionFading] = useState(false)
  useEffect(() => {
    let fadeTimeout: number | undefined
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
  const {
    machineReadings,
    machineOeeHistory,
    machineHrHistory,
    machineStatus,
    environmentReading,
    vibrationHistory,
    findings,
    flashId,
    layout,
    statusOf,
  } = sim

  useEffect(() => {
    if (reduced) {
      const raf = requestAnimationFrame(() => setMounted(true))
      return () => cancelAnimationFrame(raf)
    }
    if (containerSize.width === 0) return
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [reduced, containerSize.width])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function handleWheelNative(e: WheelEvent): void {
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
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { positions, sizes, edges, tierOf, spawnDelay, driftPhase, driftAmplitude, parentOf } = layout

  const machineById = useMemo(() => new Map(machines.map((c) => [c.id, c])), [])
  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [])
  const plantById = useMemo(() => new Map(plants.map((r) => [r.id, r])), [])
  const environmentById = useMemo(() => new Map(environments.map((e) => [e.id, e])), [])

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
    if (tierOf.get(hoverId) === 'environment') {
      edgeKeys.add(`weather-${hoverId}-${current}`)
    }
    return { nodeIds, edgeKeys }
  }, [hoverId, parentOf, tierOf])

  function edgeColorKind(edge: HierarchyEdge): EdgeColorKind {
    if (edge.kind === 'ring') return 'grey'
    if (edge.kind === 'weather') return statusOf.get(edge.source) === 'anomaly' ? 'red' : 'blue'
    if (statusOf.get(edge.target) === 'anomaly') return 'red'
    if (tierOf.get(edge.target) === 'machine') return 'blue'
    return 'grey'
  }

  function nodeHoverStyle(id: string): CSSProperties {
    if (!hoverChain) return {}
    return { opacity: hoverChain.nodeIds.has(id) ? 1 : 0.1 }
  }

  function flashClassName(id: string): string | undefined {
    return flashId === id ? 'demo-node-flash' : undefined
  }
  function flashStyle(x: number, y: number): CSSProperties {
    return { transformOrigin: `${x}px ${y}px` }
  }

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
  }, [positions])

  const edgeRefCallbacks = useMemo(() => {
    const map = new Map<string, (el: SVGLineElement | null) => void>()
    for (const edge of edges) {
      const key = `${edge.kind}-${edge.source}-${edge.target}`
      const base1 = positions.get(edge.source)
      const base2 = positions.get(edge.target)
      map.set(key, (el) => {
        if (el) {
          if (!edgeElRefs.current.has(key) && base1 && base2) {
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
  }, [positions, edges])

  useEffect(() => {
    if (reduced || !mounted) return
    const maxSpawnDelay = Math.max(0, ...spawnDelay.values())
    const startDelayMs = maxSpawnDelay + SPAWN_NODE_DURATION + EDGE_REVEAL_DURATION
    const driftIds = [...positions.keys()]
    let rafId = 0

    const startTimer = window.setTimeout(() => {
      function tick(now: number): void {
        for (const id of driftIds) {
          if (id === hoverIdRef.current || id === selectedIdRef.current) continue
          const phase = driftPhase.get(id) ?? 0
          const amp = driftAmplitude.get(id) ?? 0
          const base = positions.get(id)
          if (!base) continue
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
  }, [reduced, mounted, positions, edges, spawnDelay, driftPhase, driftAmplitude])

  const aspect = containerSize.height > 0 ? containerSize.width / containerSize.height : 1
  const shortSide = CANVAS_SIZE / view.zoom
  const viewWidth = aspect >= 1 ? shortSide * aspect : shortSide
  const viewHeight = aspect >= 1 ? shortSide : shortSide / aspect
  const viewBox = `${view.cx - viewWidth / 2} ${view.cy - viewHeight / 2} ${viewWidth} ${viewHeight}`

  const DRAG_THRESHOLD = 4

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startView: view,
      dragging: false,
      pointerId: e.pointerId,
    }
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
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
  function handlePointerUp(): void {
    dragState.current = null
  }

  const selectedMachine = selection?.type === 'machine' ? machineById.get(selection.id) : undefined
  const selectedCompany = selectedMachine ? companyById.get(selectedMachine.companyId) : undefined
  const selectedEnvironment = selection?.type === 'environment' ? environmentById.get(selection.id) : undefined
  const selectedEnvironmentPlant = selectedEnvironment ? plantById.get(selectedEnvironment.plantId) : undefined
  const exposedMachines = selectedEnvironment
    ? machines.filter((c) => companyById.get(c.companyId)?.plantId === selectedEnvironment.plantId)
    : []

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
      '--start-dx': `${startDx}px`,
      '--start-dy': `${startDy}px`,
    } as CSSProperties
  }

  function renderEdge(edge: HierarchyEdge): ReactElement | null {
    const key = `${edge.kind}-${edge.source}-${edge.target}`
    const a = positions.get(edge.source)
    const b = positions.get(edge.target)
    if (!a || !b) return null
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

  const captionKey = CAPTION_CYCLE[captionIndex] ?? 'WEATHER'

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
      {containerSize.width === 0 && (
        <div className="absolute inset-0">
          <LoadingState label="Loading graph" variant="dark" />
        </div>
      )}
      {containerSize.width > 0 && (
        <svg width="100%" height="100%" viewBox={viewBox}>
          {edges.map(renderEdge)}

          {countries.map((country) => {
            const pos = positions.get(country.id)
            if (!pos) return null
            return (
              <g key={country.id} ref={driftRefCallbacks.get(country.id)} style={nodeHoverStyle(country.id)}>
                <g className={reduced ? undefined : 'demo-node-spawn'} style={spawnStyle(country.id, pos.x, pos.y)}>
                  <g className={flashClassName(country.id)} style={flashStyle(pos.x, pos.y)}>
                    <MajorNodeShape
                      x={pos.x}
                      y={pos.y}
                      size={sizes.get(country.id)}
                      label={country.name}
                      status={statusOf.get(country.id) ?? 'nominal'}
                      isMajor={country.isMajor}
                    />
                  </g>
                </g>
              </g>
            )
          })}

          {plants.map((plant) => {
            const pos = positions.get(plant.id)
            if (!pos) return null
            return (
              <g key={plant.id} ref={driftRefCallbacks.get(plant.id)} style={nodeHoverStyle(plant.id)}>
                <g className={reduced ? undefined : 'demo-node-spawn'} style={spawnStyle(plant.id, pos.x, pos.y)}>
                  <g className={flashClassName(plant.id)} style={flashStyle(pos.x, pos.y)}>
                    <MajorNodeShape
                      x={pos.x}
                      y={pos.y}
                      size={sizes.get(plant.id)}
                      label={plant.name}
                      status={statusOf.get(plant.id) ?? 'nominal'}
                    />
                  </g>
                </g>
              </g>
            )
          })}

          {environments.map((env) => {
            const pos = positions.get(env.id)
            if (!pos) return null
            const reading = environmentReading.get(env.id)
            const size = sizes.get(env.id) ?? 20
            const isSelected = selection?.type === 'environment' && selection.id === env.id
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
                    setSelection((s) =>
                      s?.type === 'environment' && s.id === env.id ? null : { type: 'environment', id: env.id }
                    )
                  }}
                >
                  <g className={flashClassName(env.id)} style={flashStyle(pos.x, pos.y)}>
                    <EnvironmentNodeShape
                      x={pos.x}
                      y={pos.y}
                      size={size}
                      status={statusOf.get(env.id) ?? 'nominal'}
                      selected={isSelected}
                    />
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
            const pos = positions.get(company.id)
            if (!pos) return null
            return (
              <g key={company.id} ref={driftRefCallbacks.get(company.id)} style={nodeHoverStyle(company.id)}>
                <g
                  className={reduced ? undefined : 'demo-node-spawn'}
                  style={spawnStyle(company.id, pos.x, pos.y)}
                  onPointerEnter={() => setHoverId(company.id)}
                  onPointerLeave={() => setHoverId((h) => (h === company.id ? null : h))}
                >
                  <g className={flashClassName(company.id)} style={flashStyle(pos.x, pos.y)}>
                    <CompanyNodeShape
                      x={pos.x}
                      y={pos.y}
                      size={sizes.get(company.id)}
                      status={statusOf.get(company.id) ?? 'nominal'}
                    />
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

          {machines.map((machine) => {
            const pos = positions.get(machine.id)
            if (!pos) return null
            const isHovered = hoverId === machine.id
            const baseRadius = (sizes.get(machine.id) ?? 8) / 2
            return (
              <g key={machine.id} ref={driftRefCallbacks.get(machine.id)} style={nodeHoverStyle(machine.id)}>
                <g
                  className={`${reduced ? '' : 'demo-node-spawn'} cursor-pointer`}
                  style={spawnStyle(machine.id, pos.x, pos.y)}
                  onPointerEnter={() => setHoverId(machine.id)}
                  onPointerLeave={() => setHoverId((h) => (h === machine.id ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelection((s) =>
                      s?.type === 'machine' && s.id === machine.id ? null : { type: 'machine', id: machine.id }
                    )
                  }}
                >
                  <g className={flashClassName(machine.id)} style={flashStyle(pos.x, pos.y)}>
                    <SubNodeShape
                      x={pos.x}
                      y={pos.y}
                      radius={isHovered ? baseRadius + 3 : baseRadius}
                      anomaly={machineStatus.get(machine.id) === 'anomaly'}
                      selected={selection?.type === 'machine' && selection.id === machine.id}
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
                      {machine.name}
                    </text>
                  )}
                </g>
              </g>
            )
          })}
        </svg>
      )}

      {selectedMachine && (
        <MachineSidePanel
          machine={selectedMachine}
          company={selectedCompany}
          lenses={lenses}
          anomaly={machineStatus.get(selectedMachine.id) === 'anomaly'}
          oee={machineReadings.get(selectedMachine.id)?.oee ?? selectedMachine.baseOee}
          vibration={machineReadings.get(selectedMachine.id)?.vibration ?? selectedMachine.baseVibration}
          oeeHistory={machineOeeHistory.get(selectedMachine.id) ?? []}
          hrHistory={machineHrHistory.get(selectedMachine.id) ?? []}
          onClose={() => setSelection(null)}
        />
      )}

      {selectedEnvironment && (
        <EnvironmentSidePanel
          environment={selectedEnvironment}
          plant={selectedEnvironmentPlant}
          reading={environmentReading.get(selectedEnvironment.id)}
          status={statusOf.get(selectedEnvironment.id) ?? 'nominal'}
          vibrationHistory={vibrationHistory.get(selectedEnvironment.id) ?? []}
          exposedMachines={exposedMachines}
          machineStatus={machineStatus}
          onClose={() => setSelection(null)}
        />
      )}

      <FindingsFeed findings={findings} />
    </div>
  )
}
