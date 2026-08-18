import { describe, expect, it } from 'vitest'
import type { GraphNode } from './adapter'
import { computeSpawnSchedule } from './spawnSchedule'

function node(id: string, tier: GraphNode['tier'], parentId: string | null): GraphNode {
  return {
    id,
    type: 'country',
    tier,
    label: id,
    parentId,
    status: null,
    properties: {},
    serial: null,
    createdAt: '',
    drivers: null,
    role: null,
    lastContactMinutesAgo: null,
    predictedOutcome: null,
    predictedWithinHours: null,
    timeline: null,
    sourceCategory: null,
    sourceHealth: null,
    sourceBackup: null,
  }
}

describe('computeSpawnSchedule', () => {
  it('roots are unanimated and start at 0', () => {
    const schedule = computeSpawnSchedule([node('r1', 'root', null)])
    expect(schedule.get('r1')).toEqual({ startMs: 0, animated: false })
  })

  it('a parentless non-root node (provenance source) is unanimated and starts at 0', () => {
    const schedule = computeSpawnSchedule([node('r1', 'root', null), node('orphan', 'leaf', null)])
    expect(schedule.get('orphan')).toEqual({ startMs: 0, animated: false })
  })

  it("root's direct children are staggered 300ms apart starting at 0, animated", () => {
    const nodes = [node('r1', 'root', null), node('c1', 'parent', 'r1'), node('c2', 'parent', 'r1'), node('c3', 'parent', 'r1')]
    const schedule = computeSpawnSchedule(nodes)
    expect(schedule.get('c1')).toEqual({ startMs: 0, animated: true })
    expect(schedule.get('c2')).toEqual({ startMs: 300, animated: true })
    expect(schedule.get('c3')).toEqual({ startMs: 600, animated: true })
  })

  it("a child's own children wait for its split to finish (+1000ms) before staggering", () => {
    const nodes = [node('r1', 'root', null), node('c1', 'parent', 'r1'), node('c2', 'parent', 'r1'), node('g1', 'child', 'c2'), node('g2', 'child', 'c2')]
    const schedule = computeSpawnSchedule(nodes)
    // c2 starts at 300 (second sibling of r1)
    expect(schedule.get('c2')!.startMs).toBe(300)
    // g1/g2 wait for c2's own split (+1000) then stagger by 300
    expect(schedule.get('g1')).toEqual({ startMs: 1300, animated: true })
    expect(schedule.get('g2')).toEqual({ startMs: 1600, animated: true })
  })

  it('sibling order in the schedule matches array order, matching layout.ts own fan order', () => {
    const nodes = [node('r1', 'root', null), node('b', 'parent', 'r1'), node('a', 'parent', 'r1')]
    const schedule = computeSpawnSchedule(nodes)
    expect(schedule.get('b')!.startMs).toBe(0)
    expect(schedule.get('a')!.startMs).toBe(300)
  })

  it('independent branches under different roots both start their own cascade at 0 (parallel, not serialized)', () => {
    const nodes = [node('r1', 'root', null), node('r2', 'root', null), node('c1', 'parent', 'r1'), node('c2', 'parent', 'r2')]
    const schedule = computeSpawnSchedule(nodes)
    expect(schedule.get('c1')!.startMs).toBe(0)
    expect(schedule.get('c2')!.startMs).toBe(0)
  })
})
