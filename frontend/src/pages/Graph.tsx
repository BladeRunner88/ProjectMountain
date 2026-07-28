import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d'
import { api, type GraphObject, type GraphLink } from '../lib/api'

type GraphData = { objects: GraphObject[]; links: GraphLink[] }
import { SidePanel } from '../components/SidePanel'
import { EmptyState } from '../components/EmptyState'
import { GraphIcon } from '../components/icons'

const TYPE_COLOR: Record<string, string> = {
  Person: '#9DB4C9',
  Organization: '#C9A876',
  Location: '#8FA893',
}
const ACCENT = '#0071E3'

type Node = GraphObject & { x?: number; y?: number }

export function Graph() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<GraphData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const fgRef = useRef<ForceGraphMethods<Node, LinkObject<Node, GraphLink>>>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 0, height: 0 })

  useEffect(() => {
    api.fullGraph().then(setData)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setDims({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const graphData = useMemo(() => {
    if (!data) return { nodes: [] as Node[], links: [] as GraphLink[] }
    return { nodes: data.objects as Node[], links: data.links }
  }, [data])

  const focusNode = useCallback(
    (id: string) => {
      const node = graphData.nodes.find((n) => n.id === id)
      if (node && fgRef.current && node.x != null && node.y != null) {
        fgRef.current.centerAt(node.x, node.y, 600)
        fgRef.current.zoom(3.2, 600)
      }
      setSelectedId(id)
      setSearchParams({ focus: id }, { replace: true })
    },
    [graphData, setSearchParams]
  )

  const focusId = searchParams.get('focus')
  useEffect(() => {
    if (!focusId || !data) return
    // give the force simulation a moment to place nodes before centering
    const t = setTimeout(() => focusNode(focusId), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, data])

  const handleClose = () => {
    setSelectedId(null)
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }

  const isEmpty = data && data.objects.length === 0

  return (
    <div className="flex h-full w-full">
      <div ref={containerRef} className="relative min-w-0 flex-1 bg-canvas">
        {isEmpty && (
          <EmptyState
            variant="dark"
            icon={GraphIcon}
            title="No graph loaded"
            subtitle="Ingest data to build your knowledge graph."
          />
        )}
        {data && !isEmpty && dims.width > 0 && (
          <ForceGraph2D
            ref={fgRef}
            width={dims.width}
            height={dims.height}
            graphData={graphData}
            backgroundColor="#0A0A0C"
            nodeRelSize={3}
            linkColor={() => 'rgba(255,255,255,0.15)'}
            linkWidth={1}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link, ctx, globalScale) => {
              if (globalScale < 1.4) return
              const s = link.source as Node
              const t = link.target as Node
              if (s.x == null || t.x == null || t.y == null || s.y == null) return
              const midX = (s.x + t.x) / 2
              const midY = (s.y + t.y) / 2
              ctx.font = `${10 / globalScale}px "SF Mono", monospace`
              ctx.fillStyle = 'rgba(242,242,244,0.4)'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText((link as unknown as GraphLink).rel_type, midX, midY)
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as Node
              if (n.x == null || n.y == null) return
              const color = TYPE_COLOR[n.type] ?? '#999999'
              const r = 4

              ctx.beginPath()
              ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()

              if (n.id === selectedId) {
                ctx.beginPath()
                ctx.arc(n.x, n.y, r + 4, 0, 2 * Math.PI)
                ctx.strokeStyle = ACCENT
                ctx.lineWidth = 1.5
                ctx.stroke()
              }

              if (globalScale > 1.1) {
                ctx.font = `${11 / globalScale}px "SF Mono", monospace`
                ctx.fillStyle = 'rgba(242,242,244,0.75)'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillText(n.name, n.x, n.y + r + 3)
              }
            }}
            onNodeClick={(node) => focusNode((node as NodeObject<Node>).id as string)}
            onBackgroundClick={handleClose}
          />
        )}
      </div>
      {selectedId && (
        <SidePanel objectId={selectedId} onClose={handleClose} onNavigate={focusNode} />
      )}
    </div>
  )
}
