// S8.8: DBLCLICK FOCUS MODE — "the canvas eases to that entity's two-hop
// neighbourhood and everything else fades out." Two parts: a BFS over the
// entity-level graph (structural/operational/anomaly edges only — filament
// edges lead to sub-nodes, which aren't part of a "neighbourhood" of
// entities), and a viewport-fitting helper NETWORK's own pan/zoom
// (viewport.ts) eases toward.

import type { DomainDataset } from "../types/domain"
import type { HoverChain } from "./hoverChain"
import type { GraphId, Point, Size } from "../types/graph"
import type { Viewport } from "../types/graph"

interface AdjacencyEntry {
  neighborId: GraphId
  edgeKey: string
}

export function computeTwoHopNeighbourhood(
  dataset: DomainDataset,
  originId: GraphId
): HoverChain {
  const entityIds = new Set(dataset.domainEntities.map((e) => e.id))
  const adjacency = new Map<GraphId, AdjacencyEntry[]>()
  function link(a: GraphId, b: GraphId, edgeKey: string) {
    const la = adjacency.get(a) ?? []
    la.push({ neighborId: b, edgeKey })
    adjacency.set(a, la)
    const lb = adjacency.get(b) ?? []
    lb.push({ neighborId: a, edgeKey })
    adjacency.set(b, lb)
  }
  for (const e of dataset.edges) {
    if (e.kind === "filament") continue
    if (!entityIds.has(e.source) || !entityIds.has(e.target)) continue
    link(e.source, e.target, `${e.source}->${e.target}`)
  }

  const nodeIds = new Set<GraphId>([originId])
  const edgeKeys = new Set<string>()
  let frontier: GraphId[] = [originId]
  for (let hop = 0; hop < 2; hop++) {
    const next: GraphId[] = []
    for (const id of frontier) {
      for (const entry of adjacency.get(id) ?? []) {
        edgeKeys.add(entry.edgeKey)
        if (!nodeIds.has(entry.neighborId)) {
          nodeIds.add(entry.neighborId)
          next.push(entry.neighborId)
        }
      }
    }
    frontier = next
  }
  return { nodeIds, edgeKeys }
}

interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function boundingBoxOf(
  layout: ReadonlyMap<GraphId, Point>,
  ids: ReadonlySet<GraphId>
): BoundingBox | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false
  for (const id of ids) {
    const p = layout.get(id)
    if (!p) continue
    any = true
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return any ? { minX, minY, maxX, maxY } : null
}

const FIT_PADDING = 0.65

/** The viewport (screenPos = worldPos*zoom + (cx,cy)) that centres and fits `box` inside a canvas of `size`, clamped to the same [min, max] zoom range as ordinary scroll-zoom. */
export function viewportToFit(
  box: BoundingBox,
  size: Size,
  minZoom: number,
  maxZoom: number
): Viewport {
  const boxW = Math.max(1, box.maxX - box.minX)
  const boxH = Math.max(1, box.maxY - box.minY)
  const zoomX = (size.width * FIT_PADDING) / boxW
  const zoomY = (size.height * FIT_PADDING) / boxH
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(zoomX, zoomY)))
  const boxCenterX = (box.minX + box.maxX) / 2
  const boxCenterY = (box.minY + box.maxY) / 2
  return {
    cx: size.width / 2 - boxCenterX * zoom,
    cy: size.height / 2 - boxCenterY * zoom,
    zoom,
  }
}
