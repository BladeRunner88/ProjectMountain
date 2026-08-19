// The one file allowed to produce a Confidence. Everything else imports
// `confidence()` and folds; nothing else casts. `scripts/check-confidence-
// casts.mjs` (wired into `npm run lint`) enforces that mechanically —
// oxlint has no custom-rule API to do it as a proper lint rule.

import { allTraced, graphVersion, resolveOrThrow } from './graph'
import type {
  ContextRuleId,
  Derivation,
  DerivationFnId,
  Confidence,
  Instant,
  ModelId,
  SourceId,
  TracedId,
  TracedValue,
  TransformId,
} from './traced'

// NOT exported. The only two legal ways to get a Confidence from here down:
// `sourceReliability()` (a seed parameter — see below) and `confidence()`
// (a fold). A cast anywhere else in the codebase is what the lint script
// catches.
const asConfidence = (n: number): Confidence => {
  if (n < 0 || n > 1) throw new Error(`Confidence out of range [0,1]: ${n}`)
  return n as Confidence
}

/**
 * The one legitimate place a bare number becomes a Confidence outside a
 * fold: a source's reliability is a system parameter — an input the whole
 * derivation forest is rooted in, not a displayed fact's confidence. This is
 * what `buildDataset(SEED, { sourceReliability: {...} })` perturbs in S2's
 * gate test; every other Confidence in the system is downstream of this one.
 */
export function sourceReliability(n: number): Confidence {
  return asConfidence(n)
}

/**
 * The other legitimate seed parameter: a merge rule's own match confidence
 * (how sure the matcher is that two candidates are the same entity) is
 * authored alongside the rule, not folded from anything — distinct from
 * `sourceReliability` in meaning, same justification for existing outside a
 * fold, so it gets its own name rather than overloading that one.
 */
export function matchScore(n: number): Confidence {
  return asConfidence(n)
}

/**
 * S9.7: a third legitimate seed parameter — a context rule's own authority
 * confidence (how much ASE trusts the authority a rule cites: a clinical
 * reference, a barometric model, an operator SOP, a human correction). A
 * `bound` derivation's `from` is a single prior TracedValue with no
 * confidence of its own to carry the rule's authority, so this — like
 * `sourceReliability` and `matchScore` — is authored alongside the rule,
 * not folded from anything.
 */
export function ruleAuthority(n: number): Confidence {
  return asConfidence(n)
}

function inputsOf(d: Derivation): TracedId[] {
  switch (d.kind) {
    case 'observed':
    case 'asserted':
      return []
    case 'normalised':
    case 'bound':
      return [d.from]
    case 'merged':
    case 'derived':
    case 'inferred':
    case 'predicted':
      return d.from
  }
}

// -- fidelity / calibration -------------------------------------------------
// The per-step discount factors S2's formulas name: a transform, a context
// rule, a derivation function and a model each introduce a small amount of
// their own uncertainty, distinct from whatever they were fed. There is no
// authored table of these per id — that would just be more hand-typed
// numbers to keep in sync — instead each id maps deterministically (stable
// across runs, still seeded/reproducible) into a narrow discount band via a
// hash, the same "small, consistent, not hand-picked" spirit as the rest of
// this dataset's determinism.

function hashToUnit(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

function stableFidelity(seed: string, min = 0.94, max = 1.0): Confidence {
  return asConfidence(min + hashToUnit(seed) * (max - min))
}

function transformFidelity(transform: TransformId): Confidence {
  return stableFidelity(`transform:${transform}`)
}
function contextRuleConfidence(contextRule: ContextRuleId): Confidence {
  return stableFidelity(`context:${contextRule}`)
}
function fnFidelity(fn: DerivationFnId): Confidence {
  return stableFidelity(`fn:${fn}`)
}
function modelCalibration(model: ModelId, horizonMins: number): Confidence {
  const base = stableFidelity(`model:${model}`, 0.85, 1.0) as number
  // Confidence decays toward the horizon — a prediction 5 minutes out is
  // more trustworthy than one 24 hours out, from the same inputs.
  const decay = Math.max(0.2, 1 - horizonMins / (24 * 60))
  return asConfidence(base * decay)
}

// -- confidence ---------------------------------------------------------
// Memoised per (TracedId, asOf): a real dataset's derivation trees share
// enormous amounts of structure (every stage's throughput chains through
// the last, every account merge reuses the same source observations), so
// without memoisation the same sub-tree gets refolded on every Metric that
// touches it. The cache is invalidated wholesale on any graph write —
// simple, and correct, since `asOf` is inert until 9.3's bitemporal store
// exists anyway (see the note below).

let confidenceCacheVersion = -1
let confidenceCache = new Map<string, Confidence>()

function confidenceCacheKey(id: TracedId, asOf?: Instant): string {
  return asOf ? `${id}@${asOf}` : id
}

/**
 * Folds a TracedValue's derivation tree into a single Confidence. This is
 * the ONLY function in the system that produces a confidence for a
 * displayed value — Metric calls this, nothing calls a cast.
 *
 * `asOf` is accepted for S3 (the bitemporal store) to fold "as the graph
 * stood at time X" — the fold always uses the value as currently known
 * until that lands, so it's unused in the computation itself but kept in
 * the signature (and the memoisation key) so callers written against it
 * don't need to change when S3 arrives.
 */
export function confidence(t: TracedValue<unknown>, asOf?: Instant): Confidence {
  if (graphVersion() !== confidenceCacheVersion) {
    confidenceCache = new Map()
    confidenceCacheVersion = graphVersion()
  }
  const key = confidenceCacheKey(t.id, asOf)
  const cached = confidenceCache.get(key)
  if (cached !== undefined) return cached
  const result = computeConfidence(t, asOf)
  confidenceCache.set(key, result)
  return result
}

function computeConfidence(t: TracedValue<unknown>, asOf?: Instant): Confidence {
  const d = t.derivation
  switch (d.kind) {
    case 'observed':
      return d.sourceReliability
    case 'asserted':
      // A human override is treated as ground truth — it superseded
      // whatever ASE concluded on its own precisely so it wouldn't be
      // second-guessed by a fold.
      return asConfidence(1)
    case 'normalised':
      return asConfidence(confidence(resolveOrThrow(d.from), asOf) * transformFidelity(d.transform))
    case 'bound':
      return asConfidence(confidence(resolveOrThrow(d.from), asOf) * contextRuleConfidence(d.contextRule))
    case 'merged': {
      const inputs = d.from.map((id) => confidence(resolveOrThrow(id), asOf))
      return asConfidence(d.score * Math.min(...inputs))
    }
    case 'derived': {
      // A derived value can't be more confident than its weakest input —
      // confidence doesn't average away a bad dependency, it's bounded by
      // it — discounted a little further by the calculation's own fidelity.
      const inputs = d.from.map((id) => confidence(resolveOrThrow(id), asOf))
      return asConfidence(Math.min(...inputs) * fnFidelity(d.fn))
    }
    case 'inferred': {
      const total = d.support + d.contradictions
      const ratio = total === 0 ? 0 : d.support / total
      const inputs = d.from.map((id) => confidence(resolveOrThrow(id), asOf))
      return asConfidence(Math.min(ratio, ...inputs))
    }
    case 'predicted': {
      const inputs = d.from.map((id) => confidence(resolveOrThrow(id), asOf))
      return asConfidence(modelCalibration(d.model, d.horizonMins) * Math.min(...inputs))
    }
  }
}

// -- provenance ---------------------------------------------------------

export interface ProvenanceHop {
  id: TracedId
  kind: Derivation['kind']
  derivation: Derivation
  summary: string
  /** When this step happened. */
  at: Instant
  /** The folded confidence at this point in the chain. */
  confidence: Confidence
  /** How many OTHER inputs this step had besides the one the walk continued into — 0 for single-input or leaf kinds. What lets renderProvenance say "merged with 2 other records" without narrating those other branches. */
  siblingCount: number
}

function summarize(d: Derivation): string {
  switch (d.kind) {
    case 'observed':
      return `observed from ${d.source} (field "${d.rawField}")`
    case 'normalised':
      return `normalised via ${d.transform}`
    case 'merged':
      return `merged by rule ${d.rule}`
    case 'bound':
      return `bound by context rule ${d.contextRule}`
    case 'derived':
      return `derived via ${d.fn}`
    case 'inferred':
      return `inferred from pattern ${d.pattern}`
    case 'asserted':
      return `asserted by ${d.by}: "${d.note}"`
    case 'predicted':
      return `predicted by model ${d.model} (+${d.horizonMins}m)`
  }
}

/**
 * Walks the PRIMARY chain of a TracedValue's derivation — the one input a
 * multi-input step continued into, not every branch (that's what
 * `hasGroundedProvenance`/`firstUngroundedPath` are for, below — they still
 * walk the full tree, since a value is only fully grounded if EVERY branch
 * terminates properly, not just the one this narrates). This is the spine
 * `renderProvenance` turns into the "how we know" sentence, so it stays a
 * single readable line instead of narrating every branch of a merge.
 */
export function provenance(t: TracedValue<unknown>): ProvenanceHop[] {
  const hops: ProvenanceHop[] = []
  let current: TracedValue<unknown> | null = t
  while (current) {
    const d = current.derivation
    const inputs = inputsOf(d)
    hops.push({
      id: current.id,
      kind: d.kind,
      derivation: d,
      summary: summarize(d),
      at: current.recordedAt,
      confidence: confidence(current),
      siblingCount: Math.max(0, inputs.length - 1),
    })
    current = inputs.length > 0 ? resolveOrThrow(inputs[0]) : null
  }
  return hops
}

function timeLabel(instant: Instant): string {
  const date = new Date(instant)
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function readable(id: string): string {
  return id.replace(/[-_]/g, ' ')
}

function narrateHop(hop: ProvenanceHop): string {
  const d = hop.derivation
  switch (d.kind) {
    case 'observed':
      return `this came from ${d.source} at ${timeLabel(hop.at)}`
    case 'normalised':
      return `was ${readable(d.transform)}`
    case 'bound':
      return `was interpreted using the ${readable(d.contextRule)} rule`
    case 'merged':
      return hop.siblingCount > 0
        ? `merged with ${hop.siblingCount} other record${hop.siblingCount === 1 ? '' : 's'}`
        : 'merged'
    case 'derived':
      return `was calculated (${readable(d.fn)})`
    case 'inferred': {
      const s = d.support
      const c = d.contradictions
      return `was inferred from a learned pattern, based on ${s} supporting example${s === 1 ? '' : 's'}${
        c > 0 ? ` and ${c} exception${c === 1 ? '' : 's'}` : ''
      }`
    }
    case 'asserted':
      return `was corrected by ${d.by}: "${d.note}"`
    case 'predicted':
      return `was projected ${d.horizonMins} minutes ahead using ${readable(d.model)}`
  }
}

/**
 * The provenance walk rendered as one readable, chronological sentence —
 * the single most important piece of copy in the product: what a client
 * reads when they ask how ASE knows something. Example shape: "This came
 * from the CMMS at 23:14, was reformatted to a standard date,
 * then merged with two other records."
 */
export function renderProvenance(hops: ProvenanceHop[]): string {
  if (hops.length === 0) return ''
  const chronological = [...hops].reverse() // hops are root-first; the sentence reads leaf (origin) first
  const clauses = chronological.map(narrateHop)
  clauses[0] = clauses[0][0].toUpperCase() + clauses[0].slice(1)
  if (clauses.length === 1) return `${clauses[0]}.`
  return `${clauses.slice(0, -1).join(', ')}, then ${clauses[clauses.length - 1]}.`
}

/** True if every terminal (leafmost) hop of `t`'s FULL derivation tree — every branch, not just the primary spine — is 'observed' or 'asserted'. */
export function hasGroundedProvenance(t: TracedValue<unknown>): boolean {
  const d = t.derivation
  const inputs = inputsOf(d)
  if (inputs.length === 0) return d.kind === 'observed' || d.kind === 'asserted'
  return inputs.every((id) => hasGroundedProvenance(resolveOrThrow(id)))
}

/**
 * Same check as `hasGroundedProvenance`, but returns the actual offending
 * path (root → ... → ungrounded leaf) instead of a boolean — this is what
 * lets Metric's dev-mode assertion name a path instead of just failing.
 * Returns null if `t` is fully grounded.
 */
export function firstUngroundedPath(t: TracedValue<unknown>): TracedId[] | null {
  const d = t.derivation
  const inputs = inputsOf(d)
  if (inputs.length === 0) {
    return d.kind === 'observed' || d.kind === 'asserted' ? null : [t.id]
  }
  for (const id of inputs) {
    const sub = firstUngroundedPath(resolveOrThrow(id))
    if (sub) return [t.id, ...sub]
  }
  return null
}

// -- limiting step ------------------------------------------------------
// What the Inspector's "HOW SURE" line names: "83% — limited by a learned
// pattern with six exceptions" (S1d). Not a precise attribution for every
// fold formula (`merged`/`inferred`/`predicted` don't take a strict minimum
// the way `derived` does) — it's the weakest contributing branch, which is
// the useful answer for a human asking "why isn't this 100%", even where
// it isn't the literal bottleneck.

export interface LimitingStep {
  traced: TracedValue<unknown>
  confidence: Confidence
}

export function limitingStep(t: TracedValue<unknown>): LimitingStep {
  const inputs = inputsOf(t.derivation)
  if (inputs.length === 0) {
    return { traced: t, confidence: confidence(t) }
  }
  let worst: LimitingStep | null = null
  for (const id of inputs) {
    const candidate = limitingStep(resolveOrThrow(id))
    if (!worst || candidate.confidence < worst.confidence) worst = candidate
  }
  // A single-input hop (normalised/bound) doesn't itself constrain anything —
  // pass the recursive result through rather than replacing it with this
  // hop's own (necessarily identical) confidence.
  return worst!
}

/** The human-readable fragment for whatever `limitingStep` found — always follows "limited by ...". */
export function describeLimitingStep(t: TracedValue<unknown>): string {
  const d = t.derivation
  switch (d.kind) {
    case 'observed':
      return `a source observation (${d.source})`
    case 'asserted':
      return 'a human assertion'
    case 'normalised':
      return 'a normalisation step'
    case 'bound':
      return `a context rule (${d.contextRule})`
    case 'merged':
      return `an entity merge (${d.rule})`
    case 'derived':
      return `a derived calculation (${d.fn})`
    case 'inferred': {
      const n = d.contradictions
      return `a learned pattern with ${n} exception${n === 1 ? '' : 's'}`
    }
    case 'predicted':
      return `a model prediction ${d.horizonMins}m out`
  }
}

// -- counterfactual -------------------------------------------------------
// The same confidence fold, with a node removed or replaced — mutates
// nothing: `remove`/`override` only ever apply to a local recursion, never
// touch the registry. `value` can only genuinely change for `t` itself
// (removed/overridden directly) or pass through unchanged otherwise — the
// derivation kinds don't carry a reusable formula for recomputing a merged
// or derived VALUE from its inputs (only their confidence), so pretending
// to recompute a hypothetical merged account name, say, would be inventing
// data the graph doesn't actually have.

export interface CounterfactualOptions {
  remove?: TracedId[]
  override?: Map<TracedId, unknown>
}

export interface CounterfactualResult {
  value: unknown
  confidence: Confidence
  changed: boolean
}

function counterfactualConfidence(t: TracedValue<unknown>, removed: ReadonlySet<TracedId>): Confidence {
  if (removed.has(t.id)) return asConfidence(0)
  const d = t.derivation
  switch (d.kind) {
    case 'observed':
      return d.sourceReliability
    case 'asserted':
      return asConfidence(1)
    case 'normalised':
      return removed.has(d.from)
        ? asConfidence(0)
        : asConfidence(counterfactualConfidence(resolveOrThrow(d.from), removed) * transformFidelity(d.transform))
    case 'bound':
      return removed.has(d.from)
        ? asConfidence(0)
        : asConfidence(counterfactualConfidence(resolveOrThrow(d.from), removed) * contextRuleConfidence(d.contextRule))
    case 'merged': {
      const remaining = d.from.filter((id) => !removed.has(id))
      if (remaining.length === 0) return asConfidence(0)
      const inputs = remaining.map((id) => counterfactualConfidence(resolveOrThrow(id), removed))
      return asConfidence(d.score * Math.min(...inputs))
    }
    case 'derived': {
      const remaining = d.from.filter((id) => !removed.has(id))
      if (remaining.length === 0) return asConfidence(0)
      const inputs = remaining.map((id) => counterfactualConfidence(resolveOrThrow(id), removed))
      return asConfidence(Math.min(...inputs) * fnFidelity(d.fn))
    }
    case 'inferred': {
      const remaining = d.from.filter((id) => !removed.has(id))
      if (remaining.length === 0) return asConfidence(0)
      const total = d.support + d.contradictions
      const ratio = total === 0 ? 0 : d.support / total
      const inputs = remaining.map((id) => counterfactualConfidence(resolveOrThrow(id), removed))
      return asConfidence(Math.min(ratio, ...inputs))
    }
    case 'predicted': {
      const remaining = d.from.filter((id) => !removed.has(id))
      if (remaining.length === 0) return asConfidence(0)
      const inputs = remaining.map((id) => counterfactualConfidence(resolveOrThrow(id), removed))
      return asConfidence(modelCalibration(d.model, d.horizonMins) * Math.min(...inputs))
    }
  }
}

export function counterfactual(t: TracedValue<unknown>, options: CounterfactualOptions = {}): CounterfactualResult {
  const removed = new Set(options.remove ?? [])
  const baseline = confidence(t)

  if (removed.has(t.id)) {
    return { value: undefined, confidence: asConfidence(0), changed: true }
  }
  if (options.override?.has(t.id)) {
    const value = options.override.get(t.id)
    return { value, confidence: baseline, changed: value !== t.value }
  }

  const cfConfidence = counterfactualConfidence(t, removed)
  return { value: t.value, confidence: cfConfidence, changed: cfConfidence !== baseline }
}

// -- dependents -------------------------------------------------------------
// Reverse index, built once per dataset and invalidated on revision (S2) —
// `graphVersion()` (bumped by every `register`/`supersede`/`clearRegistry`
// in graph.ts) is what "invalidated on revision" means mechanically here.

let dependentsIndexVersion = -1
let reverseIndex: Map<TracedId, TracedId[]> | null = null

function buildReverseIndex(): Map<TracedId, TracedId[]> {
  const index = new Map<TracedId, TracedId[]>()
  for (const tv of allTraced()) {
    for (const inputId of inputsOf(tv.derivation)) {
      const list = index.get(inputId)
      if (list) list.push(tv.id)
      else index.set(inputId, [tv.id])
    }
  }
  return index
}

function ensureReverseIndex(): Map<TracedId, TracedId[]> {
  const v = graphVersion()
  if (reverseIndex === null || dependentsIndexVersion !== v) {
    reverseIndex = buildReverseIndex()
    dependentsIndexVersion = v
  }
  return reverseIndex
}

/** Every id whose confidence transitively depends on `id`. */
export function dependents(id: TracedId): TracedId[] {
  const index = ensureReverseIndex()
  const seen = new Set<TracedId>([id])
  const result: TracedId[] = []
  const queue: TracedId[] = [id]
  while (queue.length > 0) {
    const current = queue.shift()!
    const direct = index.get(current)
    if (!direct) continue
    for (const depId of direct) {
      if (seen.has(depId)) continue
      seen.add(depId)
      result.push(depId)
      queue.push(depId)
    }
  }
  return result
}

/** Every id transitively dependent on any observation from `source` — what the perturbation test computes its expected-changed count from, never hand-written. */
export function dependentsOfSource(source: SourceId): TracedId[] {
  const roots = allTraced().filter((tv) => tv.derivation.kind === 'observed' && tv.derivation.source === source)
  const result = new Set<TracedId>()
  for (const root of roots) {
    result.add(root.id)
    for (const dep of dependents(root.id)) result.add(dep)
  }
  return [...result]
}

// -- cost -----------------------------------------------------------------

export interface Cost {
  hops: number
  sourcesTouched: number
  oldestInputAgeMs: number
}

function allNodesInTree(t: TracedValue<unknown>, seen: Set<TracedId>): TracedValue<unknown>[] {
  if (seen.has(t.id)) return []
  seen.add(t.id)
  const nodes = [t]
  for (const id of inputsOf(t.derivation)) {
    nodes.push(...allNodesInTree(resolveOrThrow(id), seen))
  }
  return nodes
}

/** What a conclusion cost to produce: how many derivation steps it rests on, how many distinct sources it touches, and how stale its oldest input is right now. */
export function cost(t: TracedValue<unknown>, now: Date = new Date()): Cost {
  const nodes = allNodesInTree(t, new Set())
  const sources = new Set<SourceId>()
  let oldestInputAgeMs = 0
  for (const node of nodes) {
    if (node.derivation.kind === 'observed') {
      sources.add(node.derivation.source)
      const ageMs = now.getTime() - new Date(node.derivation.receivedAt).getTime()
      if (ageMs > oldestInputAgeMs) oldestInputAgeMs = ageMs
    }
  }
  return { hops: nodes.length, sourcesTouched: sources.size, oldestInputAgeMs }
}
