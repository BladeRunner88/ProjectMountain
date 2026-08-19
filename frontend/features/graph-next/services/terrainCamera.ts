// S8.7: a hand-written isometric projection + orbit-camera maths — no
// three.js, no camera library. The fixed 30° isometric transform S8.7
// specifies is applied AFTER rotating the world by the camera's azimuth
// (around the vertical/load axis) and folding in its elevation (camera
// pitch): near elevation's low end the view reads side-on and load
// shows fully; near its high end it reads top-down and load flattens
// out, the same way a real orbit camera would.

// Exported (not just used internally) so TerrainView's own hot per-point
// draw loop can inline the identical projection math for ~15,000 points/
// frame without a function-call per point, while still sourcing the same
// two constants this file's own projectPoint()/depthKey() use — never two
// copies of "cos(30°)" that could drift apart.
export const ISO_COS30 = Math.cos(Math.PI / 6)
export const ISO_SIN30 = Math.sin(Math.PI / 6)

export const ELEVATION_MIN_DEG = 18
export const ELEVATION_MAX_DEG = 82
export const DEFAULT_ELEVATION_DEG = 40
export const RUBBER_BAND_RANGE_DEG = 14

export interface Camera {
  azimuthRad: number
  elevationDeg: number
  scale: number
  verticalScale: number
}

export function projectPoint(
  x: number,
  y: number,
  z: number,
  camera: Camera
): { sx: number; sy: number } {
  const cosA = Math.cos(camera.azimuthRad)
  const sinA = Math.sin(camera.azimuthRad)
  const xr = x * cosA - z * sinA
  const zr = x * sinA + z * cosA
  const elevRad = (camera.elevationDeg * Math.PI) / 180
  const depthFactor = Math.sin(elevRad)
  const heightFactor = Math.cos(elevRad)
  const sx = (xr - zr) * ISO_COS30 * camera.scale
  const sy =
    (xr + zr) * ISO_SIN30 * camera.scale * depthFactor -
    y * camera.verticalScale * heightFactor
  return { sx, sy }
}

/** The isometric depth key painter's algorithm sorts back-to-front on. */
export function depthKey(x: number, z: number, camera: Camera): number {
  const cosA = Math.cos(camera.azimuthRad)
  const sinA = Math.sin(camera.azimuthRad)
  return x * cosA - z * sinA + (x * sinA + z * cosA)
}

/** depthKey is linear in (x, z), so its extremes over a world rectangle occur at the rectangle's corners — four evaluations, no per-point scan needed to bucket a whole frame's points by depth. */
export function depthRangeForWorld(
  camera: Camera,
  lengthUnits: number,
  halfWidthUnits: number
): [number, number] {
  const corners: [number, number][] = [
    [0, -halfWidthUnits],
    [0, halfWidthUnits],
    [lengthUnits, -halfWidthUnits],
    [lengthUnits, halfWidthUnits],
  ]
  let min = Infinity
  let max = -Infinity
  for (const [x, z] of corners) {
    const d = depthKey(x, z, camera)
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

export function clampElevation(deg: number): number {
  return Math.min(ELEVATION_MAX_DEG, Math.max(ELEVATION_MIN_DEG, deg))
}

/** Soft resistance while dragging past a limit — an asymptotic approach, never a hard wall. */
export function rubberBandElevation(deg: number): number {
  if (deg < ELEVATION_MIN_DEG) {
    const over = ELEVATION_MIN_DEG - deg
    return (
      ELEVATION_MIN_DEG -
      RUBBER_BAND_RANGE_DEG * (1 - Math.exp(-over / RUBBER_BAND_RANGE_DEG))
    )
  }
  if (deg > ELEVATION_MAX_DEG) {
    const over = deg - ELEVATION_MAX_DEG
    return (
      ELEVATION_MAX_DEG +
      RUBBER_BAND_RANGE_DEG * (1 - Math.exp(-over / RUBBER_BAND_RANGE_DEG))
    )
  }
  return deg
}

// -- S8.8: viewport persistence — "scale, pan and rotation persist" ---------
// TERRAIN's own "pan" is really its azimuth (rotation) + elevation (tilt) +
// scale; there is no separate translation. Validated the same way
// viewport.ts validates NETWORK's: any NaN, any out-of-range field, falls
// back to the default rather than being applied — "this is where a restored
// viewport killed the canvas before".

const ELEVATION_HARD_MIN = ELEVATION_MIN_DEG - RUBBER_BAND_RANGE_DEG * 2
const ELEVATION_HARD_MAX = ELEVATION_MAX_DEG + RUBBER_BAND_RANGE_DEG * 2
const SCALE_HARD_MIN = 0.5
const SCALE_HARD_MAX = 30

export function isValidCamera(
  c: unknown,
  minScale: number,
  maxScale: number
): c is Camera {
  if (!c || typeof c !== "object") return false
  const v = c as Record<string, unknown>
  const fields = [v.azimuthRad, v.elevationDeg, v.scale, v.verticalScale]
  if (fields.some((f) => typeof f !== "number" || !Number.isFinite(f)))
    return false
  const azimuthRad = v.azimuthRad as number
  const elevationDeg = v.elevationDeg as number
  const scale = v.scale as number
  const verticalScale = v.verticalScale as number
  if (!Number.isFinite(azimuthRad)) return false
  if (elevationDeg < ELEVATION_HARD_MIN || elevationDeg > ELEVATION_HARD_MAX)
    return false
  if (
    scale < Math.min(SCALE_HARD_MIN, minScale) ||
    scale > Math.max(SCALE_HARD_MAX, maxScale)
  )
    return false
  if (verticalScale <= 0) return false
  return true
}

const CAMERA_STORAGE_KEY = "isildur_graph_terrain_camera"

export function loadPersistedCamera(
  defaultCamera: Camera,
  minScale: number,
  maxScale: number
): Camera {
  if (typeof localStorage === "undefined") return defaultCamera
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY)
    if (!raw) return defaultCamera
    const parsed: unknown = JSON.parse(raw)
    return isValidCamera(parsed, minScale, maxScale) ? parsed : defaultCamera
  } catch {
    return defaultCamera
  }
}

export function savePersistedCamera(camera: Camera): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(camera))
  } catch {
    // storage full/unavailable — losing persistence is fine, throwing is not
  }
}
