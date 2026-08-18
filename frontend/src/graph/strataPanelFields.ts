// 8.13.3: Strata's Layer Detail panel — pure data functions, mirroring
// panelFields.ts's role for climber cards. Layer-level numbers here are
// real AGGREGATES computed client-side from real per-climber TracedValues
// (contributingSourceIds, node.status, node.predictedOutcome) — but the
// aggregate itself is never a backend-tracked TracedValue (there is no
// "average readiness of Camp III" fact in the dataset, only individual
// climbers' own facts), so Layer Detail's stat grid renders plain values,
// never a clickable Metric — that's reserved for the real per-climber
// values Climber Detail already shows via the shared TargetDetailPanel.

import type { GraphNode, GraphNodeStatus } from './adapter'
import type { PredictedOutcome } from '../ase/prediction'
import { READINESS_SEVERITY } from './nodeVisuals'
import { READABLE_READINESS, contributingSourceIds } from './panelFields'

const SEVERITY_TO_STATUS: readonly GraphNodeStatus[] = ['READY', 'WATCH', 'IMPAIRED', 'REQUIRES_DESCENT']

/** "Average readiness is a word, never a number" — mean SEVERITY across scored climbers, rounded, mapped back to its word. Climbers with no prediction (status null) are excluded from the mean, not counted as READY; a layer with zero scored climbers honestly reports "Unassessed" rather than fabricating a word. */
export function averageReadinessWord(climbers: readonly GraphNode[]): string {
  const scored = climbers.filter((c): c is GraphNode & { status: GraphNodeStatus } => c.status !== null)
  if (scored.length === 0) return 'Unassessed'
  const meanSeverity = scored.reduce((sum, c) => sum + READINESS_SEVERITY[c.status], 0) / scored.length
  const rounded = Math.min(3, Math.max(0, Math.round(meanSeverity)))
  return READABLE_READINESS[SEVERITY_TO_STATUS[rounded]]
}

export interface PredictionSplit {
  total: number
  byOutcome: Record<PredictedOutcome, number>
}

const EMPTY_OUTCOME_COUNTS: Record<PredictedOutcome, number> = { 'requires-descent': 0, 'requires-review': 0, watch: 0, ready: 0 }

/** "6 predictions active (3 descent, 2 review, 1 watch)" — real per-climber predictedOutcome counts, never merged with the STATUS vocabulary above (8.13.1's own rule). */
export function predictionSplitForLayer(climbers: readonly GraphNode[]): PredictionSplit {
  const byOutcome = { ...EMPTY_OUTCOME_COUNTS }
  let total = 0
  for (const c of climbers) {
    if (!c.predictedOutcome) continue
    total++
    byOutcome[c.predictedOutcome]++
  }
  return { total, byOutcome }
}

export interface LayerSourceInfo {
  id: string
  label: string
  category: string | null
  state: 'healthy' | 'stable' | 'degraded' | 'critical' | null
}

/** Every real source contributing to ANY climber currently in this layer — a union over panelFields.ts's own contributingSourceIds (the same derivation-chain walk Climber Detail's Sources row already uses), resolved against the real source-type GraphNodes for their health state. Sources with no exposure-tracked health (operator-rosters, medical-logs) show state: null rather than a fabricated one. */
export function sourcesForLayer(climbers: readonly GraphNode[], allNodes: readonly GraphNode[]): LayerSourceInfo[] {
  const sourceNodesById = new Map(allNodes.filter((n) => n.type === 'source').map((n) => [n.id, n]))
  const seenSourceIds = new Set<string>()
  const out: LayerSourceInfo[] = []
  for (const climber of climbers) {
    for (const sourceId of contributingSourceIds(climber)) {
      if (seenSourceIds.has(sourceId)) continue
      seenSourceIds.add(sourceId)
      const sourceNode = sourceNodesById.get(`source:${sourceId}`) ?? [...sourceNodesById.values()].find((n) => n.id.endsWith(sourceId))
      out.push({
        id: sourceId,
        label: sourceNode?.label ?? sourceId,
        category: sourceNode?.sourceCategory ?? null,
        state: sourceNode?.sourceHealth?.state ?? null,
      })
    }
  }
  return out
}

export function degradedSourceCount(sources: readonly LayerSourceInfo[]): number {
  return sources.filter((s) => s.state === 'degraded' || s.state === 'critical').length
}

/** Worst (highest) staleness among a layer's real climbers — lastContactMinutesAgo is only populated for the 9-of-50 with a prediction; climbers without one are honestly excluded, not treated as "0 minutes." */
export function worstStalenessMinutes(climbers: readonly GraphNode[]): number | null {
  const known = climbers.map((c) => c.lastContactMinutesAgo).filter((v): v is number => v !== null)
  return known.length === 0 ? null : Math.max(...known)
}

/** Mean of the real identityConfidencePct TracedValue across the layer's climbers — the honest per-climber confidence figure the panel already shows individually, averaged. */
export function averageConfidencePct(climbers: readonly GraphNode[]): number | null {
  const values = climbers
    .map((c) => c.properties.identityConfidencePct?.value)
    .filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}
