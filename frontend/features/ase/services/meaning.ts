// The five meaning colours carry all state in the Control Room (S1c) — this
// is the one place that decides which of them a given TracedValue gets, so
// Metric, the Inspector, and EvidenceTable can't drift into disagreement
// about what "watch" means.

import { ANOMALY, CONFIDENCE_FLOOR_DEFAULT, HUMAN, NOMINAL, WATCH } from '../tokens'
import { confidence } from './folds'
import type { TracedValue } from './traced'

export type MeaningBand = 'nominal' | 'watch' | 'anomaly' | 'human'

const BAND_COLOR: Record<MeaningBand, string> = {
  nominal: NOMINAL,
  watch: WATCH,
  anomaly: ANOMALY,
  human: HUMAN,
}

/** A human assertion is never second-guessed by a confidence band — it gets its own colour regardless of the number. */
export function meaningBand(traced: TracedValue<unknown>): MeaningBand {
  if (traced.derivation.kind === 'asserted') return 'human'
  const c = confidence(traced)
  if (c >= 0.8) return 'nominal'
  if (c >= 0.5) return 'watch'
  return 'anomaly'
}

export function meaningColor(traced: TracedValue<unknown>): string {
  return BAND_COLOR[meaningBand(traced)]
}

// -- FilterBar's state chips (S1e) -------------------------------------

export type EvidenceFilterState = 'all' | 'anomaly' | 'watch' | 'nominal' | 'below-floor' | 'awaiting-human'

export interface EvidenceFilter {
  search: string
  state: EvidenceFilterState
}

export const EMPTY_EVIDENCE_FILTER: EvidenceFilter = { search: '', state: 'all' }

/**
 * Whether `traced` matches a FilterBar state chip. 'anomaly'/'watch'/'nominal'
 * read straight off `meaningBand`. 'awaiting-human' can't be derived from a
 * TracedValue alone — nothing in its shape says "flagged for human review",
 * that's business state only the calling tab knows — so it's the one case a
 * caller must supply via `opts.awaitingHuman`; it defaults to non-matching
 * rather than guessing.
 */
export function matchesStateFilter(
  traced: TracedValue<unknown>,
  state: EvidenceFilterState,
  opts?: { awaitingHuman?: boolean; confidenceFloor?: number }
): boolean {
  switch (state) {
    case 'all':
      return true
    case 'awaiting-human':
      return opts?.awaitingHuman ?? false
    case 'below-floor':
      return confidence(traced) < (opts?.confidenceFloor ?? CONFIDENCE_FLOOR_DEFAULT)
    case 'anomaly':
    case 'watch':
    case 'nominal':
      return meaningBand(traced) === state
  }
}
