// S8.2: the shared vocabulary every later block (dataset/8.3, NETWORK/8.4-8.5,
// STRATA/8.6, TERRAIN/8.7) builds on. Nothing domain-specific lives here —
// that's 8.3's job. This file only names the shapes the STORE and the
// stability mechanics (layout safety, drift, the rAF loop) need to exist at
// all.

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Viewport {
  cx: number
  cy: number
  zoom: number
}

export type GraphId = string

/**
 * The minimal contract the stability layer needs from a dataset: a stable
 * list of ids, and a version number that changes exactly when the set of
 * entities (or anything layout depends on) actually changes — never on
 * every tick. 8.3 replaces `GraphEntity`/`GraphDataset` with the real
 * entity + sub-node layer; every function in this directory is written
 * against this contract, not against 8.3's specific shape, so that swap
 * costs nothing here.
 */
export interface GraphEntity {
  id: GraphId
}

export interface GraphDataset {
  version: number
  entities: GraphEntity[]
}

export type ViewMode = 'network' | 'strata' | 'terrain'
