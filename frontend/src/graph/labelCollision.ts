// 8.6: "no label collision at default zoom." Root/parent labels are
// always visible (never hover-gated), so with root at 5 nodes and parent
// at 44, dense clusters of routes/operators can plausibly overlap their
// own label text even though the layout engine's own collision force
// (8.5) only keeps NODE CIRCLES apart, never the wider text beneath them.
// This is a static, one-time pass at the default zoom level only — not a
// per-frame recompute — matching this whole block's "static rendering
// only" scope; it thins out labels the same way real map/network UIs do
// (Mapbox/Leaflet-style symbol collision): sort by priority, place
// greedily, skip anything that would overlap an already-placed label.
// A skipped label's NODE still renders — only its text is hidden.

export interface LabelCandidate {
  id: string
  label: string
  /** the node's own centre x — the label is horizontally centred under it */
  anchorX: number
  /** the label text's own top y (below the node + its gap) */
  anchorY: number
  fontSize: number
  /** higher priority is placed first and never displaced by a lower one — root outranks parent */
  priority: number
}

interface LabelBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * No real DOM to measure against in a pure function — a standard average-
 * character-width heuristic stands in, same approximation text-layout
 * algorithms without live font metrics commonly use. Deliberately
 * generous (0.62x, plus a fixed +6px pad): live-verified against real
 * rendered SVG text, a leaner 0.55x estimate under-measured truncated
 * labels ending in an em-dash + ellipsis ("Cho Oyu — Northwest…") enough
 * to let one real, visible overlap through undetected. Better to hide a
 * label that would have just barely fit than to render two that overlap.
 */
function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62 + 6
}

function boxOf(c: LabelCandidate): LabelBox {
  const width = estimateTextWidth(c.label, c.fontSize)
  const height = c.fontSize * 1.3
  return { x: c.anchorX - width / 2, y: c.anchorY, width, height }
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Returns the set of candidate ids whose label text should actually render. */
export function computeVisibleLabels(candidates: readonly LabelCandidate[]): Set<string> {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority || a.anchorY - b.anchorY || a.anchorX - b.anchorX)
  const placedBoxes: LabelBox[] = []
  const visible = new Set<string>()
  for (const c of sorted) {
    const box = boxOf(c)
    if (placedBoxes.some((p) => overlaps(box, p))) continue
    placedBoxes.push(box)
    visible.add(c.id)
  }
  return visible
}
