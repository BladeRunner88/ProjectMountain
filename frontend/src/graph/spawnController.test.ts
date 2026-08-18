import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetSpawnControllerForTests,
  anySpawnInProgress,
  ensureSpawnPending,
  getSpawnPhase,
  isSpawnSettled,
  markSpawnSettled,
  settleAllSpawning,
  tryStartSpawning,
} from './spawnController'

afterEach(() => {
  __resetSpawnControllerForTests()
})

describe('getSpawnPhase / ensureSpawnPending', () => {
  it('an unknown node id defaults to pending', () => {
    expect(getSpawnPhase('never-seen')).toBe('pending')
  })

  it('ensureSpawnPending seeds pending without clobbering an existing spawning entry', () => {
    tryStartSpawning('a')
    ensureSpawnPending('a')
    expect(getSpawnPhase('a')).toBe('spawning')
  })
})

describe('tryStartSpawning — the double-spawn guard', () => {
  it('returns true exactly once for a given id', () => {
    expect(tryStartSpawning('a')).toBe(true)
    expect(tryStartSpawning('a')).toBe(false)
    expect(tryStartSpawning('a')).toBe(false)
  })

  it('simulates a StrictMode double-invoke: two back-to-back calls only ever let the first one through', () => {
    const results = [tryStartSpawning('b'), tryStartSpawning('b')]
    expect(results).toEqual([true, false])
    expect(getSpawnPhase('b')).toBe('spawning')
  })

  it('once settled, tryStartSpawning never succeeds again — terminal for the session', () => {
    tryStartSpawning('c')
    markSpawnSettled('c')
    expect(tryStartSpawning('c')).toBe(false)
    expect(getSpawnPhase('c')).toBe('settled')
  })
})

describe('markSpawnSettled / isSpawnSettled', () => {
  it('marks a node settled directly even if it was never seen as spawning first (roots/orphans)', () => {
    markSpawnSettled('root:x')
    expect(isSpawnSettled('root:x')).toBe(true)
  })
})

describe('settleAllSpawning — the Skip control', () => {
  it('moves every non-settled node straight to settled, leaving already-settled ones alone', () => {
    tryStartSpawning('a')
    tryStartSpawning('b')
    markSpawnSettled('c')
    settleAllSpawning()
    expect(getSpawnPhase('a')).toBe('settled')
    expect(getSpawnPhase('b')).toBe('settled')
    expect(getSpawnPhase('c')).toBe('settled')
  })

  it('a node that was never registered at all is simply absent — settleAllSpawning only acts on known ids', () => {
    settleAllSpawning()
    expect(getSpawnPhase('never-registered')).toBe('pending')
  })
})

describe('anySpawnInProgress', () => {
  it('false when nothing has ever been registered', () => {
    expect(anySpawnInProgress()).toBe(false)
  })

  it('true while at least one node is pending or spawning', () => {
    tryStartSpawning('a')
    expect(anySpawnInProgress()).toBe(true)
  })

  it('false once everything reachable has settled', () => {
    tryStartSpawning('a')
    markSpawnSettled('a')
    expect(anySpawnInProgress()).toBe(false)
  })
})
