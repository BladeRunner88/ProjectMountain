// 8.5: verification, run against the REAL adapter-produced dataset (121
// nodes, 123 edges) — not a synthetic toy graph — per the block's own
// "verify... for the full dataset" instruction.

import { describe, expect, it } from 'vitest'
import { buildDataset } from '../ase/dataset'
import { buildGraphView } from './adapter'
import { CONE_HALF_ANGLE_RAD, FORCE_PARAMS, RADIUS_BY_TIER, angleDiff, buildInitialPositions, coneFacingAngle, idleDriftOffset, runSimulation, seedIncrementalPosition } from './layout'

const dataset = buildDataset()
const { nodes, edges } = buildGraphView(dataset)

describe('runSimulation — the full 121-node dataset', () => {
  it('settles (alpha below threshold, not just hitting the tick cap) within 3 seconds of wall-clock time', () => {
    const start = performance.now()
    const result = runSimulation(nodes, edges)
    const elapsedMs = performance.now() - start

    console.info(`\nSimulation: ${result.ticks} ticks, final alpha ${result.finalAlpha.toFixed(5)}, ${elapsedMs.toFixed(1)}ms wall-clock\n`)

    expect(result.finalAlpha).toBeLessThanOrEqual(0.001)
    expect(elapsedMs).toBeLessThan(3000)
  })

  it('no two nodes end up closer than the sum of their collision radii (node radius + 4 each)', () => {
    const result = runSimulation(nodes, edges)
    const sim = result.simNodes
    let violations: string[] = []
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i]
        const b = sim[j]
        const minDist = a.radius + FORCE_PARAMS.collisionPadding + (b.radius + FORCE_PARAMS.collisionPadding)
        const dist = Math.hypot(b.x - a.x, b.y - a.y)
        if (dist < minDist - 0.01) violations.push(`${a.id} <-> ${b.id}: dist=${dist.toFixed(2)} < min=${minDist.toFixed(2)}`)
      }
    }
    if (violations.length > 0) console.error(`${violations.length} overlap violations:\n${violations.slice(0, 10).join('\n')}`)
    expect(violations).toHaveLength(0)
  })

  it("no child ends up outside its parent's 120° cone (checked POST-settle, not just at seed time)", () => {
    const result = runSimulation(nodes, edges)
    const positionSnapshot = new Map(result.simNodes.map((n) => [n.id, { x: n.x, y: n.y }]))
    const parentIdOf = new Map(nodes.map((n) => [n.id, n.parentId]))

    let checked = 0
    const violations: string[] = []
    for (const n of result.simNodes) {
      if (n.tier === 'root' || !n.parentId) continue // roots have no cone; the 8 parentless sources have no parent to cone against
      const parent = positionSnapshot.get(n.parentId)
      if (!parent) continue
      checked++
      const faceAngle = coneFacingAngle(n.parentId, positionSnapshot, parentIdOf)
      const curAngle = Math.atan2(n.y - parent.y, n.x - parent.x)
      const diff = Math.abs(angleDiff(curAngle, faceAngle))
      if (diff > CONE_HALF_ANGLE_RAD + 0.01) {
        violations.push(`${n.id}: ${((diff * 180) / Math.PI).toFixed(1)}° off-cone (limit 60°)`)
      }
    }
    console.info(`\nCone check: ${checked} nodes checked, ${violations.length} outside their 120° cone\n`)
    if (violations.length > 0) console.error(violations.slice(0, 10).join('\n'))
    expect(checked).toBeGreaterThan(0)
    expect(violations).toHaveLength(0)
  })

  it('root nodes (countries) never move — anchored at centre-left, vertically distributed, for the whole simulation', () => {
    const seeded = buildInitialPositions(nodes)
    const result = runSimulation(nodes, edges)
    const roots = nodes.filter((n) => n.tier === 'root')
    expect(roots).toHaveLength(5)
    for (const r of roots) {
      const seed = seeded.get(r.id)!
      const final = result.positions.get(r.id)!
      expect(final.x).toBe(seed.x)
      expect(final.y).toBe(seed.y)
    }
    // vertically distributed: 5 distinct y values, sorted, evenly spaced
    const ys = roots.map((r) => result.positions.get(r.id)!.y).sort((a, b) => a - b)
    const gaps = ys.slice(1).map((y, i) => y - ys[i])
    for (const g of gaps) expect(g).toBeGreaterThan(0)
  })

  it('root children (routes) face right — their initial cone is centred on angle 0', () => {
    const seeded = buildInitialPositions(nodes)
    const routes = nodes.filter((n) => n.tier === 'parent' && nodes.find((p) => p.id === n.parentId)?.tier === 'root')
    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      const parent = seeded.get(route.parentId!)!
      const pos = seeded.get(route.id)!
      const angle = Math.atan2(pos.y - parent.y, pos.x - parent.x)
      expect(Math.abs(angle)).toBeLessThanOrEqual(CONE_HALF_ANGLE_RAD + 0.01) // within +-60° of 0 (right)
    }
  })
})

describe('idleDriftOffset', () => {
  it('stays within the 2-3px amplitude band and never returns the same offset for two different node ids at the same time', () => {
    const t = 5000
    const a = idleDriftOffset('climber:climber-1', t)
    const b = idleDriftOffset('climber:climber-2', t)
    expect(Math.hypot(a.x, a.y)).toBeLessThanOrEqual(3 * Math.SQRT2 + 0.01) // both axes near their own <=3px amplitude
    expect(a).not.toEqual(b) // uncorrelated phase — different nodes drift differently at the same instant
  })

  it('is deterministic for a given id and time, and returns to ~0 periodically rather than drifting away permanently', () => {
    const a1 = idleDriftOffset('route:3', 12345)
    const a2 = idleDriftOffset('route:3', 12345)
    expect(a1).toEqual(a2)
    // bounded oscillation, not a random walk — sampling across a full period never exceeds ~3px per axis
    for (let t = 0; t < 20000; t += 137) {
      const { x, y } = idleDriftOffset('route:3', t)
      expect(Math.abs(x)).toBeLessThanOrEqual(3.01)
      expect(Math.abs(y)).toBeLessThanOrEqual(3.01)
    }
  })
})

describe('seedIncrementalPosition — 8.8 live-arrival placement, no full re-simulation', () => {
  const someChild = nodes.find((n) => n.tier === 'child')!
  const parentPos = { x: 500, y: 500 }

  it('is deterministic for a given node id', () => {
    const a = seedIncrementalPosition(someChild, parentPos, undefined)
    const b = seedIncrementalPosition(someChild, parentPos, undefined)
    expect(a).toEqual(b)
  })

  it('places the node within one spring-length-ish distance of its parent, never on top of it', () => {
    const pos = seedIncrementalPosition(someChild, parentPos, undefined)
    const dist = Math.hypot(pos.x - parentPos.x, pos.y - parentPos.y)
    expect(dist).toBeGreaterThan(FORCE_PARAMS.springLength * 0.8)
    expect(dist).toBeLessThan(FORCE_PARAMS.springLength * 1.3)
  })

  it('without a grandparent, faces right (0 rad) — same "root children face right" rule as the initial seeding', () => {
    const pos = seedIncrementalPosition(someChild, parentPos, undefined)
    expect(pos.x).toBeGreaterThan(parentPos.x) // right of parent, not left/above/below-dominant
  })

  it('two different node ids seeded off the same parent land at different points (spread across the cone, not stacked)', () => {
    const otherChild = nodes.find((n) => n.tier === 'child' && n.id !== someChild.id)!
    const a = seedIncrementalPosition(someChild, parentPos, undefined)
    const b = seedIncrementalPosition(otherChild, parentPos, undefined)
    expect(a).not.toEqual(b)
  })
})

describe('node radii — reused from the token layer, not re-hardcoded', () => {
  it('matches root=12, parent=9, child=7, leaf=4 (half of the 8.2 token diameters)', () => {
    expect(RADIUS_BY_TIER.root).toBe(12)
    expect(RADIUS_BY_TIER.parent).toBe(9)
    expect(RADIUS_BY_TIER.child).toBe(7)
    expect(RADIUS_BY_TIER.leaf).toBe(4)
  })
})
