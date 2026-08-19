'use client'

// S8.2 rule 1: ONE STORE. GraphStore holds dataset, layout, offsets,
// viewport, selection, view mode and tick state. Nothing about the graph
// lives in component state — every consumer reads through this file, never
// through its own useState.
//
// Two different read paths, on purpose:
//  - `getSnapshot()`/`subscribe()` — the useSyncExternalStore pair, for the
//    STRUCTURAL state (dataset, layout, viewport, selection, hover,
//    viewMode, tick). This changes at human speed (a click, a resize, a
//    live data update) and is fine to re-render React components on.
//  - `getOffsets()`/`subscribeFrame()` — the 60fps drift path. Deliberately
//    OUTSIDE useSyncExternalStore: with thousands of terminal points
//    (S8.0's own NETWORK-view scale), pushing a new offsets map through
//    React state every frame would be the exact "too much for
//    state-driven re-renders" mistake the original demo graph's own
//    comments already learned from. A renderer subscribes to frames and
//    mutates its own elements imperatively (SVG transform / canvas
//    redraw), the same shape as that lesson, just centralised here instead
//    of duplicated per view.

import { createRafLoop } from '../services/rafLoop'
import { networkLayout as computeLayoutSafe } from '../services/networkLayout'
import { buildDriftParams, computeOffsets, type DriftParams } from '../services/offsets'
import { isFiniteSize } from '../services/layoutSafety'
import { DEFAULT_FILTER, type GraphFilter } from '../services/filters'
import { DEFAULT_VIEWPORT, loadPersistedViewport } from '../services/viewport'
import { IS_DEV } from '../services/env'
import type { HoverChain } from '../services/hoverChain'
import type { DomainDataset, EntityTier } from '../types/domain'
import type { GraphId, Point, Size, ViewMode, Viewport } from '../types/graph'

export interface GraphSnapshot {
  // S8.5: the store now commits to the real DomainDataset shape (S8.3) —
  // 8.2's dataset-agnostic GraphDataset contract did its job (proving the
  // stability mechanics generically) and there is now exactly one real
  // dataset type in this app, so there's no remaining value in staying
  // generic here.
  dataset: DomainDataset | null
  size: Size
  layout: ReadonlyMap<GraphId, Point>
  viewport: Viewport
  selection: GraphId | null
  hover: GraphId | null
  /** S8.8: true when `hover` was set by keyboard navigation rather than a pointer — drives the visible focus ring, which mouse hover alone doesn't need. */
  keyboardActive: boolean
  /** S8.6: hovering a band label in STRATA — dims every tier except this one, in BOTH views. Separate from `hover` (a specific node id) since a tier isn't a node. */
  hoveredTier: EntityTier | null
  /** S8.8: dbl-click focus mode's two-hop neighbourhood — takes priority over hover/search dimming in every view (graph/emphasis.ts) until Escape clears it. */
  focusChain: HoverChain | null
  /** S8.5N: the detail panel's own FOCUS action — "ease the canvas to this entity's two-hop neighbourhood" — set here rather than computed directly, since the actual pan/zoom easing is NetworkView's own component-local logic (it needs live size/viewport). NetworkView consumes this on the next render and clears it; the panel never computes a viewport itself. */
  focusRequest: GraphId | null
  /** S8.8: the search field's live text — never trimmed/validated here, graph/search.ts owns matching semantics. */
  searchQuery: string
  /** S8.8: the active filter chip — "changes what is drawn, never the dataset" (graph/filters.ts). */
  filter: GraphFilter
  viewMode: ViewMode
  /** Bumps on a live DATA update (S8.3's simulation ticks) — never on a drift frame. Low frequency, safe to re-render on. */
  tick: number
}

/** Stable SSR/hydration snapshot — never the persisted viewport (that lives only on the client singleton). */
export const GRAPH_SSR_SNAPSHOT: GraphSnapshot = {
  dataset: null,
  size: { width: 0, height: 0 },
  layout: new Map(),
  viewport: DEFAULT_VIEWPORT,
  selection: null,
  hover: null,
  keyboardActive: false,
  hoveredTier: null,
  focusChain: null,
  focusRequest: null,
  searchQuery: '',
  filter: DEFAULT_FILTER,
  viewMode: 'network',
  tick: 0,
}

export interface GraphStore {
  getSnapshot(): GraphSnapshot
  getServerSnapshot(): GraphSnapshot
  subscribe(cb: () => void): () => void
  getOffsets(): ReadonlyMap<GraphId, Point>
  subscribeFrame(cb: (offsets: ReadonlyMap<GraphId, Point>, nowMs: number) => void): () => void
  setDataset(dataset: DomainDataset): void
  setSize(size: Size): void
  setViewport(viewport: Viewport): void
  setSelection(id: GraphId | null): void
  /** `keyboard` marks the hover as keyboard-nav-driven — S8.8's visible focus ring only draws for this, not for an ordinary pointer hover. */
  setHover(id: GraphId | null, keyboard?: boolean): void
  setHoveredTier(tier: EntityTier | null): void
  setFocusChain(chain: HoverChain | null): void
  /** S8.5N: the panel's FOCUS button — request that NetworkView ease to this entity's neighbourhood next time it's mounted/rendered. */
  requestFocus(id: GraphId): void
  /** Consumed by NetworkView once it has acted on a pending focusRequest. */
  clearFocusRequest(): void
  setSearchQuery(query: string): void
  setFilter(filter: GraphFilter): void
  /** S8.8's Escape: clears selection, hover and focus mode in one emit rather than three. */
  clearInteraction(): void
  setViewMode(mode: ViewMode): void
  bumpTick(): void
  /** S8.5: lets a view supply a real per-node amplitude (tier-aware) instead of the flat default — set once before/at the same time as setDataset, takes effect on the next drift-params rebuild. */
  setDriftAmplitudeFn(fn: (id: GraphId) => number): void
  /** Declares "the canvas wants the loop running" — idempotent, safe to call from an effect that may double-invoke under StrictMode. */
  start(): void
  /** Declares "the canvas no longer needs the loop" — also stops any effectiveness-triggered resume. */
  stop(): void
  isRunning(): boolean
}

const INITIAL_VIEWPORT: Viewport = loadPersistedViewport()

export function createGraphStore(): GraphStore {
  let snapshot: GraphSnapshot = {
    dataset: null,
    size: { width: 0, height: 0 },
    layout: new Map(),
    viewport: INITIAL_VIEWPORT,
    selection: null,
    hover: null,
    keyboardActive: false,
    hoveredTier: null,
    focusChain: null,
    focusRequest: null,
    searchQuery: '',
    filter: DEFAULT_FILTER,
    viewMode: 'network',
    tick: 0,
  }
  let driftParams: ReadonlyMap<GraphId, DriftParams> = new Map()
  let offsets: ReadonlyMap<GraphId, Point> = new Map()
  let amplitudeFn: ((id: GraphId) => number) | undefined
  const listeners = new Set<() => void>()
  const frameListeners = new Set<(offsets: ReadonlyMap<GraphId, Point>, nowMs: number) => void>()

  // S8.2 rule 8: desired-vs-actual running state, kept separate so a
  // effectiveness change never starts a loop nobody asked for, and never fails
  // to resume one that was legitimately running before the tab was hidden.
  let desiredRunning = false

  function emit() {
    for (const l of listeners) l()
  }

  function setSnapshot(patch: Partial<GraphSnapshot>) {
    snapshot = { ...snapshot, ...patch }
    emit()
  }

  function recomputeLayout(dataset: DomainDataset, size: Size) {
    // Captured BEFORE setSnapshot below — setSnapshot mutates `snapshot`
    // synchronously, so checking `snapshot.dataset.version` AFTER it would
    // always compare the new dataset's version to itself and never detect
    // a change. This was a real bug (S8.1-adjacent: found live, not by
    // inspection): driftParams was never rebuilt, so every offset came out
    // of an empty map and idle drift silently never moved a single node.
    const previousDatasetVersion = snapshot.dataset?.version ?? null

    // withLayoutSafety (layoutSafety.ts) already returns the PREVIOUS
    // layout unchanged when size is degenerate or neither input changed —
    // this call is always safe to make unconditionally.
    const nextLayout = computeLayoutSafe(dataset, size)
    if (isFiniteSize(size)) {
      setSnapshot({ dataset, size, layout: nextLayout })
    } else {
      // keep the previous size too — never adopt a degenerate measurement
      setSnapshot({ dataset, layout: nextLayout })
    }
    if (previousDatasetVersion !== dataset.version) {
      driftParams = amplitudeFn ? buildDriftParams(dataset, amplitudeFn) : buildDriftParams(dataset)
    }
  }

  const loop = createRafLoop((now) => {
    offsets = computeOffsets(driftParams, now)
    for (const l of frameListeners) l(offsets, now)
  })

  function handleEffectiveness() {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      loop.stop()
    } else if (desiredRunning) {
      loop.start()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('effectivenesschange', handleEffectiveness)
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => GRAPH_SSR_SNAPSHOT,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getOffsets: () => offsets,
    subscribeFrame(cb) {
      frameListeners.add(cb)
      return () => frameListeners.delete(cb)
    },
    setDataset(dataset) {
      recomputeLayout(dataset, snapshot.size)
    },
    setSize(size) {
      const dataset = snapshot.dataset
      if (!dataset) {
        // no dataset yet — still worth keeping a valid size around so the
        // first setDataset() call has real dimensions to lay out against
        if (isFiniteSize(size)) setSnapshot({ size })
        return
      }
      recomputeLayout(dataset, size)
    },
    setViewport(viewport) {
      setSnapshot({ viewport })
    },
    setSelection(id) {
      // S8.10 dev assertion: "selection resolves or is null" — never a
      // stale/typo'd id silently sitting in the store. Stripped in
      // production (DEV-gated, same discipline as nanGuard.ts/rafLoop.ts);
      // a real miss at runtime is still handled gracefully by the
      // investigation panel's "No longer in view" fallback (S8.9), this is
      // just the loud, dev-time signal that something upstream is wrong.
      if (IS_DEV && id !== null && snapshot.dataset) {
        const resolves = snapshot.dataset.entities.some((e) => e.id === id)
        if (!resolves) {
           
          console.error(`[graph] setSelection("${id}") does not resolve to any entity or sub-node in the current dataset`)
        }
      }
      setSnapshot({ selection: id })
    },
    setHover(id, keyboard = false) {
      setSnapshot({ hover: id, keyboardActive: id !== null && keyboard })
    },
    setHoveredTier(tier) {
      setSnapshot({ hoveredTier: tier })
    },
    setFocusChain(chain) {
      setSnapshot({ focusChain: chain })
    },
    requestFocus(id) {
      setSnapshot({ focusRequest: id })
    },
    clearFocusRequest() {
      setSnapshot({ focusRequest: null })
    },
    setSearchQuery(query) {
      setSnapshot({ searchQuery: query })
    },
    setFilter(filter) {
      setSnapshot({ filter })
    },
    clearInteraction() {
      setSnapshot({ selection: null, hover: null, keyboardActive: false, focusChain: null })
    },
    setViewMode(mode) {
      setSnapshot({ viewMode: mode })
    },
    bumpTick() {
      setSnapshot({ tick: snapshot.tick + 1 })
    },
    setDriftAmplitudeFn(fn) {
      amplitudeFn = fn
      // if a dataset is already loaded, rebuild drift params immediately
      // rather than waiting for the next unrelated setDataset call
      if (snapshot.dataset) driftParams = buildDriftParams(snapshot.dataset, fn)
    },
    start() {
      desiredRunning = true
      if (typeof document === 'undefined' || !document.hidden) loop.start()
    },
    stop() {
      desiredRunning = false
      loop.stop()
    },
    isRunning: () => loop.isRunning(),
  }
}

/** S8.2 rule 1: ONE store — a module-level singleton, not a per-component instance. */
export const graphStore = createGraphStore()
