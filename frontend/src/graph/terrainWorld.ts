// S8.7: shared world-space constants + progress/lateral -> world-unit
// conversion — the ONE place both terrainHeightField.ts and terrainProfile.ts
// convert a route-normalised position (progress 0..1 along the route,
// lateral -1..1 across the corridor) into the coordinate system
// terrainCamera.ts's projection actually expects. Keeping this in a single
// module means the height field and the climbers plotted on it can never
// drift onto two different scales.

export const WORLD_LENGTH_UNITS = 100
export const WORLD_HALF_WIDTH_UNITS = 26

export function toWorldX(progress: number): number {
  return progress * WORLD_LENGTH_UNITS
}

export function toWorldZ(lateral: number): number {
  return lateral * WORLD_HALF_WIDTH_UNITS
}
