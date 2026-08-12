// S8.6: NETWORK and STRATA must render "the same data" — not two separately
// generated (if deterministically-equal) datasets, one genuinely shared
// instance. Module evaluation is cached by the runtime, so every importer
// gets the exact same object reference.

import { buildGraphDataset, GRAPH_SEED } from './dataset'

export const CURRENT_DATASET = buildGraphDataset(GRAPH_SEED)
