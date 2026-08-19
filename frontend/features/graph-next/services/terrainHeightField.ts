// S8.7: THE HEIGHT FIELD. One line's mountain, as a point cloud — X along
// the line (world units, base to target), Z lateral across the corridor,
// Y load from the line's real entry/crux/exit profile plus seeded
// ridge texture. Sampling is deliberately denser near the corridor centre
// and sparser toward the edges: that density gradient IS the "ridged,
// vibration-blown" look the reference wants, not a shading trick layered on
// top of it. No mesh, no fill — resist adding one; per S8.7 it destroys
// the effect.

import { mulberry32, seedFromString } from "./rng"
import { loadAt, type LineProfile } from "./terrainProfile"
import { toWorldX, toWorldZ } from "./terrainWorld"
import type { GraphId } from "../types/graph"

export const POINT_COUNT = 15000

// Cheap hand-rolled value noise — four seeded sine octaves summed over
// (progress, lateral). Not Perlin, doesn't need to be: it only has to be
// deterministic, continuous and texture-like at this scale.
function terrainNoise(progress: number, lateral: number, seed: number): number {
  let v = 0
  v += Math.sin(progress * 37.1 + seed * 0.71 + lateral * 3.2) * 1
  v += Math.sin(progress * 91.7 + seed * 2.13 + lateral * 5.4) * 0.5
  v += Math.sin((progress + lateral) * 53.9 - seed * 0.93) * 0.28
  v += Math.sin(progress * 173.2 - lateral * 29.7 + seed * 3.31) * 0.14
  return v
}

/** The smooth surface height at a world (progress, lateral) — centreline load, minus the ridge's lateral falloff, plus noise texture. This is what each height-field point samples, and what a machine's drop-line bottom anchors to, so the two can never disagree about where the ground is. */
export function surfaceHeightAt(
  profile: LineProfile,
  progress: number,
  lateral: number,
  noiseSeed: number
): number {
  const centreline = loadAt(profile, progress)
  const verticalRange = Math.max(1, profile.exitLoadM - profile.entryLoadM)
  const lateralDrop = Math.pow(Math.abs(lateral), 1.3) * 0.16 * verticalRange
  const noise =
    terrainNoise(progress, lateral, noiseSeed) * 0.035 * verticalRange
  return centreline - lateralDrop + noise
}

export interface AnomalyMarker {
  progress: number
  lateral: number
}

export interface HeightField {
  lineId: GraphId
  count: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
  /** 0..1, exposure-load proxy — how much traffic the point's neighbourhood implies. */
  brightness: Float32Array
  /** 1 => draw at the larger point size. */
  ridge: Uint8Array
  /** 1 => red tint, an anomaly is currently active near this point. */
  anomaly: Uint8Array
}

const ANOMALY_RADIUS = 0.045
const RIDGE_NOISE_THRESHOLD = 1.5

function stationProximityBoost(progress: number): number {
  let boost = 0
  for (const station of [0.04, 0.24, 0.46, 0.66, 0.85, 0.98]) {
    const d = Math.abs(progress - station)
    if (d < 0.03) boost = Math.max(boost, 1 - d / 0.03)
  }
  return boost
}

/** The exact seed surfaceHeightAt needs for a given line — exported so a machine's drop-line (TerrainView) samples the identical noise field the point cloud itself was built from, rather than a second, only-coincidentally-equal one. */
export function noiseSeedForLine(lineId: GraphId): number {
  return seedFromString(lineId, 5400) / 2147483648
}

function buildHeightField(
  profile: LineProfile,
  anomalies: readonly AnomalyMarker[]
): HeightField {
  const noiseSeed = noiseSeedForLine(profile.lineId)
  const rand = mulberry32(seedFromString(profile.lineId, 5401))

  const x = new Float32Array(POINT_COUNT)
  const y = new Float32Array(POINT_COUNT)
  const z = new Float32Array(POINT_COUNT)
  const brightness = new Float32Array(POINT_COUNT)
  const ridge = new Uint8Array(POINT_COUNT)
  const anomaly = new Uint8Array(POINT_COUNT)

  for (let i = 0; i < POINT_COUNT; i++) {
    const progress = rand()
    const u = rand() * 2 - 1
    const lateral = Math.sign(u) * Math.pow(Math.abs(u), 1.7)

    x[i] = toWorldX(progress)
    z[i] = toWorldZ(lateral)
    y[i] = surfaceHeightAt(profile, progress, lateral, noiseSeed)

    const noise = terrainNoise(progress, lateral, noiseSeed)
    ridge[i] = Math.abs(noise) > RIDGE_NOISE_THRESHOLD ? 1 : 0

    const proximityToCentre = 1 - Math.min(1, Math.abs(lateral))
    const sparkle = (rand() - 0.5) * 0.15
    brightness[i] = Math.min(
      1,
      Math.max(
        0,
        0.32 +
          proximityToCentre * 0.43 +
          stationProximityBoost(progress) * 0.25 +
          sparkle
      )
    )

    let isAnomaly = 0
    for (const a of anomalies) {
      const dp = progress - a.progress
      const dl = lateral - a.lateral
      if (dp * dp + dl * dl < ANOMALY_RADIUS * ANOMALY_RADIUS) {
        isAnomaly = 1
        break
      }
    }
    anomaly[i] = isAnomaly
  }

  return {
    lineId: profile.lineId,
    count: POINT_COUNT,
    x,
    y,
    z,
    brightness,
    ridge,
    anomaly,
  }
}

const cache = new Map<GraphId, HeightField>()

/** Memoised per line — the height field never changes once built for a given line within a session, so re-selecting a previously-viewed line in TerrainView's line selector is free. */
export function computeHeightField(
  profile: LineProfile,
  anomalies: readonly AnomalyMarker[]
): HeightField {
  const cached = cache.get(profile.lineId)
  if (cached) return cached
  const result = buildHeightField(profile, anomalies)
  cache.set(profile.lineId, result)
  return result
}

export function resetHeightFieldCache(): void {
  cache.clear()
}
