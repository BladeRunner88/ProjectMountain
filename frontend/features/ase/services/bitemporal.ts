// Two independent time axes already live on every TracedValue (S1):
//   VALID TIME        when the fact was true in the world     validFrom/validTo
//   TRANSACTION TIME   when ASE learned it                     recordedAt/supersededAt
// Nothing has read the second pair meaningfully until now — confidence(),
// provenance() etc. all just walk to "whatever's current". This module is
// what makes them answer "as of when" instead.
//
// Every EvidenceGraphView resolves from a fixed ANCHOR TracedId — the
// original, first-built TracedValue for a logical fact (`dataset.ts` never
// hands out anything else; `latest()` walking forward from that anchor is
// the existing convention this generalises). There is no backward walk from
// an arbitrary later id, because nothing in this codebase holds one.

import { allTraced, resolve, resolveOrThrow } from './graph'
import type { Instant, TracedId, TracedValue } from './traced'

export interface EvidenceGraphView {
  /** 'now' for the live view, otherwise the instant this view is anchored to — what the UI reads back to render "Showing what ASE knew at ...". */
  readonly at: Instant | 'now'
  resolve(id: TracedId): TracedValue<unknown> | undefined
  resolveOrThrow(id: TracedId): TracedValue<unknown>
  allTraced(): TracedValue<unknown>[]
}

function chainFrom(id: TracedId): TracedValue<unknown>[] {
  const chain: TracedValue<unknown>[] = []
  let current = resolve(id)
  while (current) {
    chain.push(current)
    current = current.supersededBy ? resolveOrThrow(current.supersededBy) : undefined
  }
  return chain
}

/** The live view: whatever's current, full stop — the walk every screen has used since S1f, now expressed as a view like the historical ones. */
export function nowView(): EvidenceGraphView {
  return {
    at: 'now',
    resolve: (id) => {
      const chain = chainFrom(id)
      return chain[chain.length - 1]
    },
    resolveOrThrow: (id) => {
      const chain = chainFrom(id)
      if (chain.length === 0) throw new Error(`Dangling TracedId in derivation graph: ${id}`)
      return chain[chain.length - 1]
    },
    allTraced,
  }
}

/**
 * `asOf(t)`: the graph as ASE's own records stood at transaction-time t.
 * Walking forward from the anchor, `recordedAt > t` is invisible (that fact,
 * or that correction, hadn't been written down yet) and `supersededAt > t`
 * is ignored (it WILL be superseded later, which is irrelevant to how
 * things stood at t) — which in practice both fall out of one rule: only
 * advance to the next link in the chain while that link's own `recordedAt`
 * is already `<= t`.
 */
export function asOf(t: Instant): EvidenceGraphView {
  function resolveAt(id: TracedId): TracedValue<unknown> | undefined {
    const chain = chainFrom(id)
    let visible: TracedValue<unknown> | undefined
    for (const tv of chain) {
      if (tv.recordedAt > t) break
      visible = tv
    }
    return visible
  }
  return {
    at: t,
    resolve: resolveAt,
    resolveOrThrow: (id) => {
      const tv = resolveAt(id)
      if (!tv) throw new Error(`Not yet recorded as of ${t}: ${id}`)
      return tv
    },
    allTraced: () => allTraced().filter((tv) => tv.recordedAt <= t),
  }
}

/**
 * `validAt(v)`: what was true in the world at valid-time v, using
 * everything ASE currently knows (including corrections recorded after the
 * fact) — the opposite cut from `asOf`. Searches the full chain (current
 * knowledge, transaction-time unconstrained) for whichever segment's
 * valid-time window actually covers v.
 */
export function validAt(v: Instant): EvidenceGraphView {
  function resolveValidAt(id: TracedId): TracedValue<unknown> | undefined {
    const chain = chainFrom(id)
    return chain.find((tv) => tv.validFrom <= v && (tv.validTo === null || tv.validTo > v))
  }
  return {
    at: v,
    resolve: resolveValidAt,
    resolveOrThrow: (id) => {
      const tv = resolveValidAt(id)
      if (!tv) throw new Error(`Nothing valid at ${v}: ${id}`)
      return tv
    },
    allTraced: () => allTraced().filter((tv) => tv.validFrom <= v && (tv.validTo === null || tv.validTo > v)),
  }
}

/** "14:02 on 2 August" — the one historical-timestamp format the scrubber label, the nav bar, and every section header's "Showing what ASE knew at ..." note all share. */
export function formatHistoricalMoment(t: Instant): string {
  const d = new Date(t)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  return `${hh}:${mm} on ${d.getUTCDate()} ${month}`
}

/** Every distinct instant something was recorded or superseded — what the scrubber marks as a change point on its timeline. */
export function changePoints(sinceHoursAgo = 24): Instant[] {
  const cutoff = new Date(Date.now() - sinceHoursAgo * 60 * 60 * 1000).toISOString() as Instant
  const points = new Set<Instant>()
  for (const tv of allTraced()) {
    if (tv.recordedAt >= cutoff) points.add(tv.recordedAt)
    if (tv.supersededAt && tv.supersededAt >= cutoff) points.add(tv.supersededAt)
  }
  return [...points].sort()
}
