// The ActivityLane's feed (S1e): every TracedValue that has been superseded
// is a real, already-happened belief revision — this reads that directly off
// the graph rather than maintaining a separate event log, so the lane can
// never show a change the graph doesn't actually contain.
//
// S1g: a variable name must never reach the interface. `rawField` on an
// 'observed' derivation is free text chosen by whatever dataset built it —
// this module can't know "blood_oxygen_pct" means anything, and shouldn't
// have to; that would make activity.ts domain-aware, which defeats the
// point of a domain-swappable dataset. Instead it recognises a *generic*
// naming convention any dataset can opt into: `rawField` as either a bare
// metric slug ("last_sync_seconds_ago") or a "subject:metric" pair
// ("nima-tamang:blood_oxygen_pct") — kebab/snake-case slugs turned into
// English by pattern, not by a lookup table of specific field names.

import { resolveOrThrow } from './graph'
import type { Instant, TracedId, TracedValue } from './traced'

export interface ChangeEvent {
  oldId: TracedId
  newId: TracedId
  /** The full, ready-to-render English sentence — never assembled by the UI from raw parts, so a field slug can't leak through a generic "X changed from A to B" template. */
  sentence: string
  at: Instant
}

// A whole-word roman-numeral suffix ("james-marshall-iii" -> "...III", not
// "...Iii") — the one case where first-letter-only capitalisation mangles a
// name that survived slugify's lowercasing.
const ROMAN_NUMERAL_WORDS = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'])

// Every word capitalised — proper-noun convention, for an explicit subject
// slug (a person or named entity: "nima-tamang" -> "Nima Tamang").
function titleCase(slug: string): string {
  const words = slug.replace(/[-_]/g, ' ').trim().split(/\s+/)
  return words.map((w) => (ROMAN_NUMERAL_WORDS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ')
}

// Only the first word capitalised — how every one of this dataset's actual
// source names is styled ("weather-feed" -> "Weather feed", matching
// "Weather feed" verbatim, not "Weather Feed"). Used when there's no
// explicit subject and the sentence falls back to the source's own name.
function sentenceCase(slug: string): string {
  const words = slug.replace(/[-_]/g, ' ').trim().split(/\s+/)
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase())).join(' ')
}

function lowerCase(slug: string): string {
  return slug.replace(/[-_]/g, ' ').trim()
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

/** Splits "subject:metric" into its parts; a plain slug with no colon has no subject. */
function splitSubjectMetric(rawField: string): { subject: string | null; metric: string } {
  const i = rawField.indexOf(':')
  if (i === -1) return { subject: null, metric: rawField }
  return { subject: rawField.slice(0, i), metric: rawField.slice(i + 1) }
}

function describeNonObserved(d: TracedValue<unknown>['derivation']): string {
  switch (d.kind) {
    case 'asserted':
      return 'a human correction'
    case 'normalised':
      return 'a normalised value'
    case 'bound':
      return 'a context-bound value'
    case 'merged':
      return 'a merged entity value'
    case 'derived':
      return 'a derived value'
    case 'inferred':
      return 'an inferred value'
    case 'predicted':
      return 'a predicted value'
    case 'observed':
      return '' // handled separately, always has a rawField to work with
  }
}

// S9.4: a conflict's resolved value is a real 'derived' TracedValue, not an
// 'observed' one — it has no rawField, but its `fn` slug follows the exact
// same bare-metric / "subject:metric" convention (see `conflictFnSlug` in
// ase/conflict.ts), authored by whatever built it, same as rawField always
// was. This is still pattern matching on a generic naming convention, not a
// lookup table keyed to "date of birth" or any other specific property.
function slugOf(d: TracedValue<unknown>['derivation']): string | null {
  if (d.kind === 'observed') return d.rawField
  if (d.kind === 'derived') return d.fn
  return null
}

function isPrimitive(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

// S9.6 fix: a raw seconds count past 90 reads as noise ("4646 seconds ago")
// rather than information — escalate through the same unit ladder
// `formatElapsed` uses (seconds -> minutes -> hours -> days), so a source
// that's been down a long time reads as "3.2 hours ago", never a
// four-or-five-digit seconds count. Minute/hour/day-unit readings that are
// already the right scale pass through unchanged unless they, too, cross
// into the next unit up.
function formatAgeQuantity(amount: number, baseUnit: string): { value: string; unit: string } {
  const seconds = baseUnit === 'second' ? amount : baseUnit === 'minute' ? amount * 60 : baseUnit === 'hour' ? amount * 3600 : amount * 86400
  if (seconds < 90) return { value: String(Math.round(seconds)), unit: 'seconds' }
  const minutes = seconds / 60
  if (minutes < 90) return { value: minutes.toFixed(1), unit: 'minutes' }
  const hours = minutes / 60
  if (hours < 36) return { value: hours.toFixed(1), unit: 'hours' }
  const days = hours / 24
  return { value: days.toFixed(1), unit: 'days' }
}

function composeSentence(oldTv: TracedValue<unknown>, newTv: TracedValue<unknown>): string {
  const from = String(oldTv.value)
  const to = String(newTv.value)
  const d = oldTv.derivation
  const slug = slugOf(d)

  if (slug === null) {
    return `${capitalize(describeNonObserved(d))} changed from ${from} to ${to}.`
  }

  const { subject, metric } = splitSubjectMetric(slug)
  // No subject prefix on anything other than 'observed' means there's no
  // source name to fall back to either (only 'observed' carries `.source`)
  // — stay with the generic non-observed phrasing rather than guess one.
  if (!subject && d.kind !== 'observed') {
    return `${capitalize(describeNonObserved(d))} changed from ${from} to ${to}.`
  }
  const subjectLabel = subject ? titleCase(subject) : sentenceCase(d.kind === 'observed' ? d.source : '')

  // A timing/freshness reading ("last_sync_seconds_ago", "..._minutes_ago",
  // ...): a rise means it's gotten staler, a fall means a fresher reading
  // just arrived. The unit is the recognised time word right before "_ago"
  // — whatever prefix comes before that (e.g. "last_sync") is deliberately
  // ignored, since "last synced ... ago" is the fixed template regardless.
  const agoMatch = metric.match(/(second|minute|hour|day)s?_ago$/)
  if (agoMatch) {
    const fromNum = Number(oldTv.value)
    const toNum = Number(newTv.value)
    if (!Number.isNaN(fromNum) && !Number.isNaN(toNum)) {
      const baseUnit = agoMatch[1]
      const delta = Math.abs(toNum - fromNum)
      const direction = toNum > fromNum ? 'slower' : toNum < fromNum ? 'faster' : 'unchanged'
      const toFmt = formatAgeQuantity(toNum, baseUnit)
      const deltaFmt = formatAgeQuantity(delta, baseUnit)
      return direction === 'unchanged'
        ? `${subjectLabel} last synced ${toFmt.value} ${toFmt.unit} ago — unchanged.`
        : `${subjectLabel} last synced ${toFmt.value} ${toFmt.unit} ago — ${deltaFmt.value} ${deltaFmt.unit} ${direction} than before.`
    }
  }

  // A percentage reading ("..._pct"): possessive subject, rose/fell phrasing.
  if (metric.endsWith('_pct') && subject) {
    const fromNum = Number(oldTv.value)
    const toNum = Number(newTv.value)
    const metricLabel = lowerCase(metric.replace(/_pct$/, ''))
    if (!Number.isNaN(fromNum) && !Number.isNaN(toNum)) {
      const verb = toNum > fromNum ? 'rose' : toNum < fromNum ? 'fell' : 'stayed'
      return `${subjectLabel}'s ${metricLabel} ${verb} from ${from}% to ${to}%.`
    }
  }

  // Generic fallback — still English, still no bare slug. A non-primitive
  // value (e.g. a range-merge conflict's {min,max} interval) has no honest
  // "from X to Y" — String(object) would leak an implementation artifact,
  // so this names the change without pretending to render the value.
  const metricLabel = lowerCase(metric)
  if (!isPrimitive(oldTv.value) || !isPrimitive(newTv.value)) {
    return subject ? `${subjectLabel}'s ${metricLabel} changed.` : `${subjectLabel} ${metricLabel} changed.`
  }
  return subject
    ? `${subjectLabel}'s ${metricLabel} changed from ${from} to ${to}.`
    : `${subjectLabel} ${metricLabel} changed from ${from} to ${to}.`
}

/** "4s ago" / "3m ago" / "2h ago" — shared by the ActivityLane now and by any tab's AGE caption later (S1c's motion spec calls for the same pattern on every live value). */
export function formatElapsed(at: Instant, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function recentChanges(universe: TracedValue<unknown>[], limit = 20): ChangeEvent[] {
  const superseded = universe.filter(
    (tv): tv is TracedValue<unknown> & { supersededAt: Instant; supersededBy: TracedId } =>
      tv.supersededAt !== null && tv.supersededBy !== null
  )
  superseded.sort((a, b) => (a.supersededAt < b.supersededAt ? 1 : a.supersededAt > b.supersededAt ? -1 : 0))

  return superseded.slice(0, limit).map((oldTv) => {
    const newTv = resolveOrThrow(oldTv.supersededBy)
    return {
      oldId: oldTv.id,
      newId: newTv.id,
      sentence: composeSentence(oldTv, newTv),
      at: oldTv.supersededAt,
    }
  })
}
