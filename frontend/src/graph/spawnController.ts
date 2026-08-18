// 8.8: THE SPAWN CONTROLLER — module-level, NEVER React state. Read the
// block's own bug report: a re-render that recomputes props can reset a
// declarative SMIL `begin="Xms"` back to a fresh (or garbage) value,
// un-freezing an already-settled node. The fix is structural: no animation
// element's `begin` is ever computed from render-time data again. Every
// phase-driving animation is `begin="indefinite"` (a CONSTANT string,
// identical on every render, so React never touches that attribute after
// first paint) and is instead started with one explicit, one-time
// `beginElement()` call scheduled from here.
//
// This map's lifetime is the JS module's — i.e. the page session, reset
// only by an actual reload — not any single component's mount lifecycle.
// A node that reaches SETTLED stays settled even if GraphCanvas fully
// unmounts and remounts (switching to Strata and back): on remount, the
// render path reads this map fresh, sees SETTLED, and renders the node in
// its plain final form immediately — no replay, no flash of emptiness.

export type SpawnPhase = 'pending' | 'spawning' | 'settled'

const phaseByNodeId = new Map<string, SpawnPhase>()

export function getSpawnPhase(nodeId: string): SpawnPhase {
  return phaseByNodeId.get(nodeId) ?? 'pending'
}

export function isSpawnSettled(nodeId: string): boolean {
  return phaseByNodeId.get(nodeId) === 'settled'
}

/** Registers a node as known-but-not-yet-started, WITHOUT clobbering an existing spawning/settled entry — safe to call every render. */
export function ensureSpawnPending(nodeId: string): void {
  if (!phaseByNodeId.has(nodeId)) phaseByNodeId.set(nodeId, 'pending')
}

/**
 * The only guarded transition into 'spawning' — returns true the FIRST
 * time it's called for a given id, false every time after (including a
 * StrictMode double-invoke of the same effect, or a stray duplicate call).
 * The caller must only act (schedule a timer, call beginElement()) when
 * this returns true — that's the entire double-spawn guard, and it works
 * regardless of mount count because the map is module-level, not a ref
 * tied to one component instance.
 */
export function tryStartSpawning(nodeId: string): boolean {
  if (phaseByNodeId.get(nodeId) === 'pending' || !phaseByNodeId.has(nodeId)) {
    phaseByNodeId.set(nodeId, 'spawning')
    return true
  }
  return false
}

/** Terminal. Once set, tryStartSpawning can never succeed for this id again — "never re-enter SPAWNING for the lifetime of the session." */
export function markSpawnSettled(nodeId: string): void {
  phaseByNodeId.set(nodeId, 'settled')
}

/** The Skip control: every not-yet-settled known node becomes settled immediately, synchronously — the next render reads this and swaps every in-flight node to its plain final form. */
export function settleAllSpawning(): void {
  for (const [id, phase] of phaseByNodeId) {
    if (phase !== 'settled') phaseByNodeId.set(id, 'settled')
  }
}

export function anySpawnInProgress(): boolean {
  for (const phase of phaseByNodeId.values()) {
    if (phase !== 'settled') return true
  }
  return false
}

/** Test-only: reset the module singleton between test files/cases. Never called from app code. */
export function __resetSpawnControllerForTests(): void {
  phaseByNodeId.clear()
}
