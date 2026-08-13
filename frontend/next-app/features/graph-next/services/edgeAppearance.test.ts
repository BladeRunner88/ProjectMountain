import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { buildColorResolver } from './color'
import { buildAnomalyPathEdgeKeys, buildEdgeAppearanceResolver } from './edgeAppearance'
import { ANOMALY_RED } from '../types/tokens'

describe('buildAnomalyPathEdgeKeys / buildEdgeAppearanceResolver (S8.5)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)
  const colors = buildColorResolver(dataset)

  it('every hop from an anomalous climber up to its country is on the anomaly path, not just the final hop', () => {
    const keys = buildAnomalyPathEdgeKeys(dataset)
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
    const climberId = dataset.anomalyClimberIds[0]
    let current = byId.get(climberId)!
    let hops = 0
    while (current.parentId !== null) {
      expect(keys.has(`${current.parentId}->${current.id}`)).toBe(true)
      current = byId.get(current.parentId)!
      hops++
    }
    // climber -> operator -> route -> region -> country is 4 hops
    expect(hops).toBe(4)
  })

  it('an edge whose target is anomalous renders anomaly red via the appearance resolver', () => {
    const appearanceFor = buildEdgeAppearanceResolver(dataset, colors)
    const byId = new Map(dataset.domainEntities.map((e) => [e.id, e]))
    const climberId = dataset.anomalyClimberIds[0]
    const climber = byId.get(climberId)!
    const a = appearanceFor(climber.parentId!, climberId, 'operational')
    expect(a.color).toBe(ANOMALY_RED)
    expect(a.isAnomalyPath).toBe(true)
  })

  it('a structural edge into a region with no anomalous descendant at all uses the branch colour, not red', () => {
    // "status: nominal" alone isn't enough to pick from — regions never
    // carry any status but 'nominal' (only climbers/sensors do), yet a
    // region can still be an ANCESTOR of an anomalous climber, which
    // correctly puts its incoming edge on the anomaly path (that's the
    // whole point of "every edge on the path to the core turns red"). This
    // test needs a region genuinely off every anomaly path, not merely one
    // whose own status field says nominal.
    const anomalyKeys = buildAnomalyPathEdgeKeys(dataset)
    const appearanceFor = buildEdgeAppearanceResolver(dataset, colors)
    const cleanRegion = dataset.domainEntities.find((e) => e.tier === 'region' && !anomalyKeys.has(`${e.parentId}->${e.id}`))!
    expect(cleanRegion).toBeDefined()
    const a = appearanceFor(cleanRegion.parentId!, cleanRegion.id, 'structural')
    expect(a.color).not.toBe(ANOMALY_RED)
    expect(a.isAnomalyPath).toBe(false)
  })
})
