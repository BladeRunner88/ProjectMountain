// 8.4: structural counts (the "Deliverable: a console dump of node/edge
// counts by type" — printed via console.info so `npx vitest run` shows it
// directly) and THE PERTURBATION TEST, run through buildGraphView() itself
// — ase/folds.test.ts already proves confidence() is wired end to end
// through the raw dataset; this proves the SAME thing survives THIS
// adapter's reshaping, with zero graph UI/components involved.

import { describe, expect, it } from 'vitest'
import { buildDataset } from '../ase/dataset'
import { confidence } from '../ase/folds'
import { buildGraphView } from './adapter'

describe('buildGraphView — node/edge counts by type', () => {
  it('matches the expected backend counts: 5 countries, 14 routes, 30 operators, 50 climbers, plus sources', () => {
    const dataset = buildDataset()
    const { nodes, edges } = buildGraphView(dataset)

    const byType = new Map<string, number>()
    for (const n of nodes) byType.set(n.type, (byType.get(n.type) ?? 0) + 1)
    const byEdgeKind = new Map<string, number>()
    for (const e of edges) byEdgeKind.set(e.kind, (byEdgeKind.get(e.kind) ?? 0) + 1)

    console.info('\n=== GraphView node counts by type ===')
    for (const [type, count] of byType) console.info(`  ${type}: ${count}`)
    console.info(`  TOTAL nodes: ${nodes.length}`)
    console.info('=== GraphView edge counts by kind ===')
    for (const [kind, count] of byEdgeKind) console.info(`  ${kind}: ${count}`)
    console.info(`  TOTAL edges: ${edges.length}`)
    console.info('(sibling: 0 by design — see adapter.ts\'s own comment on why)\n')

    expect(byType.get('country')).toBe(5)
    expect(byType.get('route')).toBe(14)
    expect(byType.get('operator')).toBe(30)
    expect(byType.get('climber')).toBe(50)
    // "plus sources" — 14 route-attached environmental sensors + 8
    // cross-cutting provenance sources (Wearable oximeter, GPS tracker,
    // ...) = 22. Both are real backend "source" concepts; neither is
    // invented (see adapter.ts's own comments on each).
    expect(byType.get('source')).toBe(22)
    expect(nodes.length).toBe(5 + 14 + 30 + 50 + 22)

    expect(byEdgeKind.get('sibling') ?? 0).toBe(0)
    expect(byEdgeKind.get('parent')).toBeGreaterThan(0)
    expect(byEdgeKind.get('cross')).toBeGreaterThan(0)
  })

  it('every non-root node has a parentId that resolves to a real node in the same array (flat array, hierarchy via parentId only)', () => {
    const dataset = buildDataset()
    const { nodes } = buildGraphView(dataset)
    const ids = new Set(nodes.map((n) => n.id))
    for (const n of nodes) {
      if (n.parentId === null) continue
      expect(ids.has(n.parentId), `${n.id} (${n.type}) has parentId "${n.parentId}" which does not resolve`).toBe(true)
    }
  })

  it('every properties entry is a real TracedValue (has an id and a derivation), never a raw literal', () => {
    const dataset = buildDataset()
    const { nodes } = buildGraphView(dataset)
    let checked = 0
    for (const n of nodes) {
      for (const [key, tv] of Object.entries(n.properties)) {
        expect(typeof tv, `${n.id}.properties.${key}`).toBe('object')
        expect(tv, `${n.id}.properties.${key}`).toHaveProperty('id')
        expect(tv, `${n.id}.properties.${key}`).toHaveProperty('derivation')
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('status is only ever set for the climbers with a real PersonPrediction — READY/WATCH/IMPAIRED/REQUIRES_DESCENT, never a 5th value, never for a non-climber', () => {
    const dataset = buildDataset()
    const { nodes } = buildGraphView(dataset)
    const allowed = new Set(['READY', 'WATCH', 'IMPAIRED', 'REQUIRES_DESCENT'])
    let climbersWithStatus = 0
    for (const n of nodes) {
      if (n.status === null) continue
      expect(n.type, `${n.id} has a non-null status but isn't a climber`).toBe('climber')
      expect(allowed.has(n.status), `${n.id} has an unexpected status "${n.status}"`).toBe(true)
      climbersWithStatus++
    }
    // Exactly the 9 climbers with a PersonPrediction — not fewer (a real
    // gap silently swallowed), not more (a status invented for someone
    // the backend never actually scored).
    expect(climbersWithStatus).toBe(9)
  })
})

describe('THE PERTURBATION TEST, through buildGraphView() — zero graph components involved', () => {
  it("perturbing Permit registry's reliability moves every climber's identityConfidencePct in the adapter's own output", () => {
    // confidence() must be snapshotted to a plain number IMMEDIATELY after
    // EACH build, not deferred until after both builds have run —
    // buildDataset() calls clearRegistry() internally, so a SECOND build
    // wipes the module-level registry the FIRST build's TracedValues
    // depend on to resolve their own `derivation.from` ids. Caught live:
    // the first version of this test computed confidence() for both
    // "before" and "after" in one comparison loop AFTER both builds had
    // already run, and threw "Dangling TracedId in derivation graph" —
    // ase/folds.test.ts's own perturbation test avoids exactly this by
    // snapshotting right after each build (see its snapshotConfidences()).
    const beforeView = buildGraphView(buildDataset(1))
    const beforeSnapshot = beforeView.nodes.filter((n) => n.type === 'climber').map((n) => (n.properties.identityConfidencePct ? confidence(n.properties.identityConfidencePct) : null))

    const afterView = buildGraphView(buildDataset(1, { sourceReliability: { 'Permit registry': 0.02 } }))
    const afterSnapshot = afterView.nodes.filter((n) => n.type === 'climber').map((n) => (n.properties.identityConfidencePct ? confidence(n.properties.identityConfidencePct) : null))

    expect(afterSnapshot.length).toBe(beforeSnapshot.length)

    let moved = 0
    for (let i = 0; i < beforeSnapshot.length; i++) {
      if (beforeSnapshot[i] === null || afterSnapshot[i] === null) continue
      if (beforeSnapshot[i] !== afterSnapshot[i]) moved++
    }
    console.info(`\nPerturbing Permit registry: ${moved}/${beforeSnapshot.length} climbers' identityConfidencePct confidence moved (through buildGraphView)\n`)
    expect(moved).toBe(beforeSnapshot.length) // every dependent confidence moved — none authored, none untraced
  })

  it('control: a source node totally unrelated to Permit registry does NOT move — proves the graph is actually being respected, not everything just changing at once', () => {
    const beforeView = buildGraphView(buildDataset(1))
    const weatherBefore = beforeView.nodes.find((n) => n.label === 'Weather feed')!
    const beforeConfidence = confidence(weatherBefore.properties.reliabilityPct)
    const beforeValue = weatherBefore.properties.reliabilityPct.value

    const afterView = buildGraphView(buildDataset(1, { sourceReliability: { 'Permit registry': 0.02 } }))
    const weatherAfter = afterView.nodes.find((n) => n.label === 'Weather feed')!
    expect(confidence(weatherAfter.properties.reliabilityPct)).toBe(beforeConfidence)
    expect(weatherAfter.properties.reliabilityPct.value).toBe(beforeValue)
  })
})
