"use client"

import type { MutableRefObject } from "react"
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d"

import {
  GRAPH_ACCENT,
  GRAPH_CANVAS_BG,
  objectDisplayName,
  typeColor,
} from "../services/display"
import type { GraphLink, GraphObject } from "../types/graph"

export type ForceNode = GraphObject & { x?: number; y?: number }

type ForceLink = GraphLink

type FgMethods = ForceGraphMethods<
  NodeObject<ForceNode>,
  LinkObject<ForceNode, ForceLink>
>

type ForceGraphCanvasProps = {
  width: number
  height: number
  nodes: ForceNode[]
  links: GraphLink[]
  selectedId: string | null
  onNodeClick: (id: string) => void
  onBackgroundClick: () => void
  graphRef: MutableRefObject<FgMethods | undefined>
}

type PlacedNode = NodeObject<ForceNode> & { x: number; y: number }

function asPlacedNode(
  value: string | number | NodeObject<ForceNode> | undefined
): PlacedNode | null {
  if (typeof value !== "object" || value === null) return null
  if (typeof value.x !== "number" || typeof value.y !== "number") return null
  return { ...value, x: value.x, y: value.y }
}

function linkRelType(link: LinkObject<ForceNode, ForceLink>): string {
  return typeof link.rel_type === "string" ? link.rel_type : ""
}

export function ForceGraphCanvas({
  width,
  height,
  nodes,
  links,
  selectedId,
  onNodeClick,
  onBackgroundClick,
  graphRef,
}: ForceGraphCanvasProps) {
  return (
    <ForceGraph2D<ForceNode, ForceLink>
      ref={graphRef}
      width={width}
      height={height}
      graphData={{ nodes, links }}
      backgroundColor={GRAPH_CANVAS_BG}
      nodeRelSize={3}
      linkColor={() => "rgba(255,255,255,0.15)"}
      linkWidth={1}
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={1}
      linkCanvasObjectMode={() => "after"}
      linkCanvasObject={(link, ctx, globalScale) => {
        if (globalScale < 1.4) return
        const source = asPlacedNode(link.source)
        const target = asPlacedNode(link.target)
        if (!source || !target) return
        const midX = (source.x + target.x) / 2
        const midY = (source.y + target.y) / 2
        ctx.font = `${10 / globalScale}px "SF Mono", monospace`
        ctx.fillStyle = "rgba(242,242,244,0.4)"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(linkRelType(link), midX, midY)
      }}
      nodeCanvasObject={(node, ctx, globalScale) => {
        if (node.x == null || node.y == null) return
        const color = typeColor(typeof node.type === "string" ? node.type : "")
        const r = 4

        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
        ctx.fillStyle = color
        ctx.fill()

        if (node.id === selectedId) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI)
          ctx.strokeStyle = GRAPH_ACCENT
          ctx.lineWidth = 1.5
          ctx.stroke()
        }

        if (globalScale > 1.1) {
          ctx.font = `${11 / globalScale}px "SF Mono", monospace`
          ctx.fillStyle = "rgba(242,242,244,0.75)"
          ctx.textAlign = "center"
          ctx.textBaseline = "top"
          ctx.fillText(
            objectDisplayName({
              id: typeof node.id === "string" ? node.id : String(node.id ?? ""),
              name: node.name,
              title: node.title,
              account_ref: node.account_ref,
            }),
            node.x,
            node.y + r + 3
          )
        }
      }}
      onNodeClick={(node) => {
        if (typeof node.id === "string") onNodeClick(node.id)
      }}
      onBackgroundClick={onBackgroundClick}
    />
  )
}

export type { FgMethods }
