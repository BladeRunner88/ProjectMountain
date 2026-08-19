// S8.8: NETWORK's pan/zoom. Every layer (canvas + SVG) renders in the same
// "world" pixel space networkLayout.ts already produces; this file is only
// the transform on top — screenPos = worldPos * zoom + (cx, cy) — applied
// once as a single wrapping element's CSS transform (transform-origin
// '0 0'), never folded into the layout math itself.

import type { Viewport } from "../types/graph"

export const NETWORK_ZOOM_MIN = 0.3
export const NETWORK_ZOOM_MAX = 4
export const DEFAULT_VIEWPORT: Viewport = { cx: 0, cy: 0, zoom: 1 }
const PAN_BOUND_PX = 4000

export function clampZoom(zoom: number): number {
  return Math.min(NETWORK_ZOOM_MAX, Math.max(NETWORK_ZOOM_MIN, zoom))
}

/** Cursor-anchored zoom: whatever world point currently sits under (cursorX, cursorY) stays under it after the zoom changes. */
export function zoomAt(
  viewport: Viewport,
  cursorX: number,
  cursorY: number,
  factor: number
): Viewport {
  const nextZoom = clampZoom(viewport.zoom * factor)
  const worldX = (cursorX - viewport.cx) / viewport.zoom
  const worldY = (cursorY - viewport.cy) / viewport.zoom
  return {
    cx: cursorX - worldX * nextZoom,
    cy: cursorY - worldY * nextZoom,
    zoom: nextZoom,
  }
}

export function isValidViewport(v: unknown): v is Viewport {
  if (!v || typeof v !== "object") return false
  const c = v as Record<string, unknown>
  if (
    typeof c.cx !== "number" ||
    typeof c.cy !== "number" ||
    typeof c.zoom !== "number"
  )
    return false
  if (
    !Number.isFinite(c.cx) ||
    !Number.isFinite(c.cy) ||
    !Number.isFinite(c.zoom)
  )
    return false
  if (c.zoom < NETWORK_ZOOM_MIN || c.zoom > NETWORK_ZOOM_MAX) return false
  if (Math.abs(c.cx) > PAN_BOUND_PX || Math.abs(c.cy) > PAN_BOUND_PX)
    return false
  return true
}

const STORAGE_KEY = "isildur_graph_network_viewport"

/** S8.8: "this is where a restored viewport killed the canvas before" — a value read back from localStorage is never trusted as-is; NaN, an out-of-clamp zoom, or a pan beyond sane bounds all fall back to the default rather than being applied. */
export function loadPersistedViewport(): Viewport {
  if (typeof localStorage === "undefined") return DEFAULT_VIEWPORT
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VIEWPORT
    const parsed: unknown = JSON.parse(raw)
    return isValidViewport(parsed) ? parsed : DEFAULT_VIEWPORT
  } catch {
    return DEFAULT_VIEWPORT
  }
}

export function savePersistedViewport(viewport: Viewport): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(viewport))
  } catch {
    // storage full/unavailable — losing persistence is fine, throwing is not
  }
}
