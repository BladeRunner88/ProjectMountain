// S8.2 rule 2: LAYOUT IS A PURE FUNCTION OF (dataset, size).
// layout(dataset, size) -> ReadonlyMap<Id, Point>, memoised on both, and if
// size is degenerate the PREVIOUS layout comes back rather than an empty
// one — never compute with zero.
//
// This is deliberately factored as a wrapper, not baked into one specific
// layout implementation: NETWORK (8.4), STRATA (8.6) and TERRAIN (8.7) each
// get their own real geometry function, but all three need the exact same
// memoisation + zero-guard + NaN-guard contract. They get it by wrapping
// their own `compute` in `withLayoutSafety`, once, the same way this file's
// own placeholder layout does.

import { assertFinitePoint } from "./nanGuard"
import type { GraphDataset, GraphId, Point, Size } from "../types/graph"

export function isFiniteSize(size: Size): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  )
}

export type LayoutFn<TDataset extends GraphDataset> = (
  dataset: TDataset,
  size: Size
) => ReadonlyMap<GraphId, Point>

/**
 * Wraps a raw (possibly unsafe) layout computation with the three
 * guarantees S8.2 requires: skip recompute when neither input changed,
 * refuse to compute against a degenerate size (returning whatever the last
 * good layout was — an empty map only on the very first call, before any
 * valid size has ever arrived), and check every produced coordinate for
 * NaN/Infinity before it's handed back.
 */
export function withLayoutSafety<TDataset extends GraphDataset>(
  compute: LayoutFn<TDataset>,
  name: string
): LayoutFn<TDataset> {
  let lastDatasetVersion: number | null = null
  let lastSize: Size | null = null
  let lastResult: ReadonlyMap<GraphId, Point> = new Map()

  return function layout(dataset, size) {
    if (!isFiniteSize(size)) return lastResult

    const sizeChanged =
      !lastSize ||
      lastSize.width !== size.width ||
      lastSize.height !== size.height
    const datasetChanged = lastDatasetVersion !== dataset.version
    if (!sizeChanged && !datasetChanged) return lastResult

    const raw = compute(dataset, size)
    const checked = new Map<GraphId, Point>()
    for (const [id, p] of raw) {
      checked.set(
        id,
        assertFinitePoint(id, p, name, {
          width: size.width,
          height: size.height,
          datasetVersion: dataset.version,
        })
      )
    }

    lastDatasetVersion = dataset.version
    lastSize = size
    lastResult = checked
    return checked
  }
}
