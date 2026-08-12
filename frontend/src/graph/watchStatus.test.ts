import { describe, expect, it } from 'vitest'
import { buildGraphDataset, GRAPH_SEED } from './dataset'
import { computeWatchIds } from './watchStatus'

describe('graph/watchStatus (S8.8)', () => {
  const dataset = buildGraphDataset(GRAPH_SEED)

  it('watch ids are always nominal — anomaly overrides watch, never stacks with it', () => {
    const watchIds = computeWatchIds(dataset)
    for (const id of watchIds) {
      const entity = dataset.domainEntities.find((e) => e.id === id)!
      expect(entity.status).toBe('nominal')
    }
  })

  it('every watch id genuinely has at least one alert-flagged sub-node of its own', () => {
    const watchIds = computeWatchIds(dataset)
    for (const id of watchIds) {
      const ownAlert = dataset.subNodes.some((s) => s.parentId === id && s.status === 'alert')
      expect(ownAlert).toBe(true)
    }
  })

  it('a nominal entity with no alert sub-nodes is never in the watch set', () => {
    const watchIds = computeWatchIds(dataset)
    const plainNominal = dataset.domainEntities.find((e) => e.status === 'nominal' && !dataset.subNodes.some((s) => s.parentId === e.id && s.status === 'alert'))
    expect(plainNominal).toBeDefined()
    expect(watchIds.has(plainNominal!.id)).toBe(false)
  })
})
