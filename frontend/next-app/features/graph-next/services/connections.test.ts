import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { computeConnections } from './connections'

describe('graph/connections (S8.9)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)

  it('every climber is connected to their own operator', () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const connections = computeConnections(dataset, climber.id)
    const operator = connections.find((c) => c.relation === 'operator')
    expect(operator?.id).toBe(climber.parentId)
  })

  it("a climber's sensor connection is the one attached to their OWN route, never another route's", () => {
    const climber = dataset.domainEntities.find((e) => e.tier === 'climber')!
    const operator = dataset.domainEntities.find((e) => e.id === climber.parentId)!
    const route = dataset.domainEntities.find((e) => e.id === operator.parentId)!
    const connections = computeConnections(dataset, climber.id)
    const sensor = connections.find((c) => c.relation === 'sensor')
    if (sensor) {
      const sensorEntity = dataset.domainEntities.find((e) => e.id === sensor.id)!
      expect(sensorEntity.parentId).toBe(route.id)
    }
  })

  it('rope partners are climber<->climber only — never the operator itself', () => {
    for (const climber of dataset.domainEntities.filter((e) => e.tier === 'climber')) {
      const connections = computeConnections(dataset, climber.id)
      for (const c of connections.filter((c) => c.relation === 'rope-partner')) {
        expect(c.tier).toBe('climber')
        expect(c.id).not.toBe(climber.id)
      }
    }
  })

  it('a non-climber entity has no connections (this section is climber-scoped)', () => {
    const region = dataset.domainEntities.find((e) => e.tier === 'region')!
    expect(computeConnections(dataset, region.id)).toEqual([])
  })

  it('an operator with 2+ climbers gives its first two a mutual rope-partner connection', () => {
    const byOperator = new Map<string, string[]>()
    for (const c of dataset.domainEntities.filter((e) => e.tier === 'climber')) {
      const list = byOperator.get(c.parentId!) ?? []
      list.push(c.id)
      byOperator.set(c.parentId!, list)
    }
    const pairOperator = [...byOperator.values()].find((list) => list.length >= 2)!
    const [a, b] = pairOperator
    expect(computeConnections(dataset, a).some((c) => c.relation === 'rope-partner' && c.id === b)).toBe(true)
    expect(computeConnections(dataset, b).some((c) => c.relation === 'rope-partner' && c.id === a)).toBe(true)
  })
})
