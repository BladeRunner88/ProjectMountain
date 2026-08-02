import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d'
import {
  getNode,
  getConnections,
  getConnectionCounts,
  getAllEdges,
  getFlagFor,
  nameOf,
  type Entity,
} from '../mock'
import { GraphSidePanel } from '../components/controlRoom/GraphSidePanel'

const HOLDING_ID = 'org-holding'
const RECONCILED_COLOR = '#7B90AC'
const FLAGGED_COLOR = '#A6453D'
const ACCENT = '#0071E3'

type GNode = Entity & { x?: number; y?: number; vx?: number; vy?: number }
type GLink = { source: string; target: string; relType: string }

function findParentId(id: string): string | null {
  const entity = getNode(id)
  if (!entity) return null
  if (entity.kind === 'organization') return entity.parentId
  if (entity.kind === 'account') return entity.orgId
  if (entity.kind === 'transaction') return entity.accountId
  return null
}

function radiusFor(count: number): number {
  return Math.min(14, Math.max(3, 3 + Math.sqrt(count) * 1.15))
}

export function ControlRoomGraph() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const nodeRegistryRef = useRef(new Map<string, GNode>())
  const fgRef = useRef<ForceGraphMethods<GNode, LinkObject<GNode, GLink>>>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 0, height: 0 })

  const subsidiaryIds = useMemo(
    () =>
      getConnections(HOLDING_ID)
        .filter((c) => c.direction === 'out' && c.relType === 'parent_of')
        .map((c) => c.entity.id),
    []
  )

  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set([HOLDING_ID, ...subsidiaryIds])
  )
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set([HOLDING_ID]))
  const [ownerOf, setOwnerOf] = useState<Map<string, string>>(
    () => new Map(subsidiaryIds.map((id) => [id, HOLDING_ID]))
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  const connectionCounts = useMemo(() => getConnectionCounts(), [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setDims({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function getOrCreateNode(id: string): GNode {
    let n = nodeRegistryRef.current.get(id)
    if (!n) {
      n = { ...(getNode(id) as Entity) } as GNode
      nodeRegistryRef.current.set(id, n)
    }
    return n
  }

  const graphData = useMemo(() => {
    const nodes = Array.from(visibleIds).map((id) => getOrCreateNode(id))
    const links: GLink[] = getAllEdges()
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, relType: e.relType }))
    return { nodes, links }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds])

  function selectAndCenter(id: string, delay = 250) {
    setSelectedId(id)
    setTimeout(() => {
      const n = nodeRegistryRef.current.get(id)
      if (n?.x != null && n.y != null && fgRef.current) {
        fgRef.current.centerAt(n.x, n.y, 500)
        fgRef.current.zoom(Math.max(fgRef.current.zoom(), 2.4), 500)
      }
    }, delay)
  }

  const expand = useCallback(
    (id: string) => {
      const conns = getConnections(id)
      const parent = nodeRegistryRef.current.get(id)
      const newlyShown = conns.filter((c) => !visibleIds.has(c.entity.id)).map((c) => c.entity.id)
      for (const nid of newlyShown) {
        if (!nodeRegistryRef.current.has(nid)) {
          const entity = getNode(nid)!
          nodeRegistryRef.current.set(nid, {
            ...entity,
            x: (parent?.x ?? 0) + (Math.random() - 0.5) * 30,
            y: (parent?.y ?? 0) + (Math.random() - 0.5) * 30,
          } as GNode)
        }
      }
      setVisibleIds((prev) => {
        const next = new Set(prev)
        for (const nid of newlyShown) next.add(nid)
        return next
      })
      setOwnerOf((prev) => {
        const next = new Map(prev)
        for (const nid of newlyShown) if (!next.has(nid)) next.set(nid, id)
        return next
      })
      setExpandedIds((prev) => new Set(prev).add(id))
    },
    [visibleIds]
  )

  const collapse = useCallback(
    (id: string) => {
      const toRemove = new Set<string>()
      const stack = [id]
      while (stack.length) {
        const current = stack.pop()!
        for (const [childId, ownerId] of ownerOf) {
          if (ownerId === current && !toRemove.has(childId)) {
            toRemove.add(childId)
            stack.push(childId)
          }
        }
      }
      setVisibleIds((prev) => {
        const next = new Set(prev)
        for (const r of toRemove) next.delete(r)
        return next
      })
      setExpandedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        for (const r of toRemove) next.delete(r)
        return next
      })
      setOwnerOf((prev) => {
        const next = new Map(prev)
        for (const r of toRemove) next.delete(r)
        return next
      })
      setSelectedId((cur) => (cur && (cur === id || toRemove.has(cur)) ? null : cur))
    },
    [ownerOf]
  )

  function handleNodeClick(node: NodeObject<GNode>) {
    const id = node.id as string
    setSelectedId(id)
    if (expandedIds.has(id)) collapse(id)
    else expand(id)
    const n = nodeRegistryRef.current.get(id)
    if (n?.x != null && n.y != null && fgRef.current) {
      fgRef.current.centerAt(n.x, n.y, 400)
    }
  }

  function focusEntity(targetId: string) {
    const chain: string[] = []
    let current: string | null = targetId
    while (current && !visibleIds.has(current)) {
      chain.unshift(current)
      current = findParentId(current)
    }
    if (chain.length === 0) {
      selectAndCenter(targetId, 50)
      return
    }
    const newVisible = new Set(visibleIds)
    const newExpanded = new Set(expandedIds)
    const newOwner = new Map(ownerOf)
    let anchor = current
    for (const nodeId of chain) {
      newVisible.add(nodeId)
      if (anchor) {
        newExpanded.add(anchor)
        if (!newOwner.has(nodeId)) newOwner.set(nodeId, anchor)
        if (!nodeRegistryRef.current.has(nodeId)) {
          const entity = getNode(nodeId)!
          const anchorNode = nodeRegistryRef.current.get(anchor)
          nodeRegistryRef.current.set(nodeId, {
            ...entity,
            x: anchorNode?.x ?? 0,
            y: anchorNode?.y ?? 0,
          } as GNode)
        }
      }
      anchor = nodeId
    }
    setVisibleIds(newVisible)
    setExpandedIds(newExpanded)
    setOwnerOf(newOwner)
    selectAndCenter(targetId)
  }

  function resetView() {
    setVisibleIds(new Set([HOLDING_ID, ...subsidiaryIds]))
    setExpandedIds(new Set([HOLDING_ID]))
    setOwnerOf(new Map(subsidiaryIds.map((id) => [id, HOLDING_ID])))
    setSelectedId(null)
    setTimeout(() => {
      const holding = nodeRegistryRef.current.get(HOLDING_ID)
      if (holding?.x != null && holding.y != null && fgRef.current) {
        fgRef.current.centerAt(holding.x, holding.y, 500)
        fgRef.current.zoom(2, 500)
      }
    }, 50)
  }

  const focusParam = searchParams.get('focus')
  useEffect(() => {
    if (!focusParam) return
    // clearing the param changes focusParam itself, which would cancel a
    // timeout tracked by this effect's cleanup — call focusEntity synchronously
    // instead; its own selectAndCenter already delays the camera move.
    focusEntity(focusParam)
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusParam])

  function handleOpenReconciliation(metricKey: string, entityId: string) {
    navigate(
      `/app/control-room/reconciliation/${metricKey}?entity=${entityId}&from=${encodeURIComponent(
        `/app/control-room?focus=${entityId}`
      )}`
    )
  }

  const selectedEntity = selectedId ? getNode(selectedId) : undefined
  const selectedFlag = selectedId ? getFlagFor(selectedId) : undefined
  const selectedConnections = selectedId ? getConnections(selectedId) : []

  const relatedToHover = useMemo(() => {
    if (!hoverId) return null
    const related = new Set<string>([hoverId])
    for (const link of graphData.links) {
      if (link.source === hoverId) related.add(link.target)
      if (link.target === hoverId) related.add(link.source)
    }
    return related
  }, [hoverId, graphData.links])

  return (
    <div className="flex h-full w-full">
      <div ref={containerRef} className="relative min-w-0 flex-1 bg-canvas">
        {dims.width > 0 && (
          <ForceGraph2D
            ref={fgRef}
            width={dims.width}
            height={dims.height}
            graphData={graphData}
            backgroundColor="#0A0A0C"
            nodeRelSize={1}
            linkColor={(link) => {
              const l = link as unknown as GLink
              if (relatedToHover && !(relatedToHover.has(l.source as string) && relatedToHover.has(l.target as string))) {
                return 'rgba(255,255,255,0.05)'
              }
              return 'rgba(255,255,255,0.18)'
            }}
            linkWidth={1}
            linkDirectionalArrowLength={2.5}
            linkDirectionalArrowRelPos={1}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link, ctx, globalScale) => {
              const l = link as unknown as Omit<GLink, 'source' | 'target'> & { source: GNode; target: GNode }
              if (typeof l.source !== 'object' || typeof l.target !== 'object') return
              const touchesHover = hoverId && (l.source.id === hoverId || l.target.id === hoverId)
              const touchesSelected = selectedId && (l.source.id === selectedId || l.target.id === selectedId)
              if (!touchesHover && !touchesSelected) return
              if (l.source.x == null || l.target.x == null || l.source.y == null || l.target.y == null) return
              const midX = (l.source.x + l.target.x) / 2
              const midY = (l.source.y + l.target.y) / 2
              ctx.font = `${11 / globalScale}px "SF Mono", monospace`
              ctx.fillStyle = 'rgba(242,242,244,0.75)'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(l.relType, midX, midY)
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GNode
              if (n.x == null || n.y == null) return
              const count = connectionCounts[n.id] ?? 0
              const r = radiusFor(count)
              const flagged = !!getFlagFor(n.id)
              const dimmed = relatedToHover ? !relatedToHover.has(n.id) : false
              const baseColor = flagged ? FLAGGED_COLOR : RECONCILED_COLOR

              ctx.globalAlpha = dimmed ? 0.25 : 1
              ctx.beginPath()
              ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
              ctx.fillStyle = baseColor
              ctx.fill()

              if (n.id === selectedId) {
                ctx.beginPath()
                ctx.arc(n.x, n.y, r + 4, 0, 2 * Math.PI)
                ctx.strokeStyle = ACCENT
                ctx.lineWidth = 1.5
                ctx.stroke()
              }

              if (globalScale > 1.0 && !dimmed) {
                ctx.font = `${10.5 / globalScale}px "Inter", sans-serif`
                ctx.fillStyle = 'rgba(242,242,244,0.8)'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillText(nameOf(n), n.x, n.y + r + 3)
              }
              ctx.globalAlpha = 1
            }}
            onNodeClick={handleNodeClick}
            onNodeHover={(node) => setHoverId(node ? ((node as GNode).id as string) : null)}
            onBackgroundClick={() => setSelectedId(null)}
          />
        )}

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => fgRef.current?.zoom(fgRef.current.zoom() * 1.4, 300)}
              aria-label="Zoom in"
              className="flex h-8 w-8 items-center justify-center border border-hairline-on-canvas bg-canvas text-[16px] text-ink-on-canvas transition-colors duration-fast ease-out hover:border-app"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => fgRef.current?.zoom(fgRef.current.zoom() / 1.4, 300)}
              aria-label="Zoom out"
              className="flex h-8 w-8 items-center justify-center border border-hairline-on-canvas bg-canvas text-[16px] text-ink-on-canvas transition-colors duration-fast ease-out hover:border-app"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetView}
              className="flex h-8 items-center justify-center border border-hairline-on-canvas bg-canvas px-3 text-[12px] text-ink-on-canvas transition-colors duration-fast ease-out hover:border-app"
            >
              Reset view
            </button>
          </div>

          <div className="pointer-events-auto flex w-fit items-center gap-4 border border-hairline-on-canvas bg-canvas px-4 py-2.5">
            <span className="flex items-center gap-2 text-[12px] text-ink-on-canvas-soft">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RECONCILED_COLOR }} />
              Reconciled
            </span>
            <span className="flex items-center gap-2 text-[12px] text-ink-on-canvas-soft">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FLAGGED_COLOR }} />
              Needs review
            </span>
          </div>
        </div>
      </div>

      {selectedEntity && (
        <GraphSidePanel
          entity={selectedEntity}
          connections={selectedConnections}
          flag={selectedFlag}
          onNavigate={focusEntity}
          onClose={() => setSelectedId(null)}
          onOpenReconciliation={handleOpenReconciliation}
        />
      )}
    </div>
  )
}
