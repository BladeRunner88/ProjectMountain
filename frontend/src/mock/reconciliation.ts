import type { Dataset } from './generate'
import { NOW_UTC } from './generate'
import type { CanonicalStatus } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Source definitions — three mock systems reporting the same underlying
// deposits/withdrawals differently: own currency, own status words, own
// timezone, own field names. Rates are fixed constants so the currency
// conversion step round-trips exactly (any residual comes from the
// deliberate gap, not from float noise).
// ---------------------------------------------------------------------------

type Direction = 'deposit' | 'withdrawal'

interface SourceDef {
  key: string
  currency: string
  rate: number // units of source currency per 1 USD, at report time
  rateSource: string
  rateDate: string
  timezoneOffsetMinutes: number
  timezoneLabel: string
  amountField: string
  statusField: string
  toSourceStatus: (c: CanonicalStatus) => string
  statusMap: (raw: string) => CanonicalStatus | 'unmapped'
  coversCardProcessorFully: boolean
  idScheme: 'exact' | 'fuzzy'
  coverage: 'all' | 'card_processor_only'
}

const CORE_BANKING: SourceDef = {
  key: 'CoreBanking',
  currency: 'USD',
  rate: 1,
  rateSource: 'n/a (native currency)',
  rateDate: 'n/a',
  timezoneOffsetMinutes: -240,
  timezoneLabel: 'America/New_York (UTC-04:00)',
  amountField: 'amount',
  statusField: 'status',
  // Bijective on purpose: every canonical status gets its own distinct word.
  // If any non-settled status collided with the settled word, that source
  // would silently round-trip a non-settled row back to "settled" and
  // inflate the total — exactly the kind of bug this dataset should surface
  // deliberately (via the one unmapped-status case below), not by accident.
  toSourceStatus: (c) => ({ settled: 'posted', pending: 'pending', failed: 'declined', reversed: 'reversed', chargeback: 'chargeback_reversed' }[c]),
  statusMap: (raw) => {
    const m: Record<string, CanonicalStatus> = { posted: 'settled', pending: 'pending', declined: 'failed', reversed: 'reversed', chargeback_reversed: 'chargeback' }
    return m[raw.toLowerCase()] ?? 'unmapped'
  },
  coversCardProcessorFully: false,
  idScheme: 'exact',
  coverage: 'all',
}

const PAYMENT_GATEWAY: SourceDef = {
  key: 'PaymentGateway',
  currency: 'EUR',
  rate: 0.92,
  rateSource: 'Internal Treasury Rate Card',
  rateDate: '2026-07-01',
  timezoneOffsetMinutes: 0,
  timezoneLabel: 'UTC',
  amountField: 'txn_value',
  statusField: 'state',
  // Only 3 words in this source's own vocabulary (approved / FAIL /
  // rejected_3ds) — a real-time gateway that doesn't carry a separate
  // pending state. "approved" must stay exclusive to settled so a pending
  // row can never round-trip back in as counted.
  toSourceStatus: (c) => ({ settled: 'approved', pending: 'FAIL', failed: 'FAIL', reversed: 'rejected_3ds', chargeback: 'rejected_3ds' }[c]),
  statusMap: (raw) => {
    const m: Record<string, CanonicalStatus> = { approved: 'settled', fail: 'failed', rejected_3ds: 'failed' }
    return m[raw.toLowerCase()] ?? 'unmapped'
  },
  coversCardProcessorFully: false,
  idScheme: 'fuzzy',
  coverage: 'card_processor_only',
}

const LEDGER_EXPORT: SourceDef = {
  key: 'LedgerExport',
  currency: 'GBP',
  rate: 0.79,
  rateSource: 'Internal Treasury Rate Card',
  rateDate: '2026-07-01',
  timezoneOffsetMinutes: 60,
  timezoneLabel: 'Europe/London (UTC+01:00)',
  amountField: 'gross_amount',
  statusField: 'txn_status',
  toSourceStatus: (c) => ({ settled: 'cleared', pending: 'pending_clearance', failed: 'void', reversed: 'reversed_item', chargeback: 'chargeback' }[c]),
  statusMap: (raw) => {
    const m: Record<string, CanonicalStatus> = { cleared: 'settled', pending_clearance: 'pending', void: 'failed', reversed_item: 'reversed', chargeback: 'chargeback' }
    return m[raw.toLowerCase()] ?? 'unmapped'
  },
  coversCardProcessorFully: false,
  idScheme: 'exact',
  coverage: 'all',
}

const SOURCES = [CORE_BANKING, PAYMENT_GATEWAY, LEDGER_EXPORT]

export interface RawRow {
  rowId: string
  source: string
  groundTruthId: string
  accountId: string
  providerId: string
  rawAmount: number
  rawCurrency: string
  rawStatus: string
  canonicalStatus: CanonicalStatus | 'unmapped'
  timestampUtc: string
  timestampLocal: string
  reportedAtUtc: string
  isTestAccount: boolean
  amountUsd: number
}

// ---------------------------------------------------------------------------
// Window / as-of resolution
// ---------------------------------------------------------------------------

export type WindowKey = 'yesterday' | '7d' | '30d'
export interface CustomWindow {
  start: string
  end: string
}
export type WindowInput = WindowKey | CustomWindow

export function resolveWindow(window: WindowInput): { start: Date; end: Date; label: string } {
  if (typeof window === 'object') {
    return { start: new Date(window.start), end: new Date(window.end), label: `${window.start} to ${window.end}` }
  }
  if (window === 'yesterday') {
    const end = new Date(Math.floor(NOW_UTC.getTime() / DAY_MS) * DAY_MS)
    const start = new Date(end.getTime() - DAY_MS)
    return { start, end, label: 'Yesterday' }
  }
  if (window === '7d') {
    return { start: new Date(NOW_UTC.getTime() - 7 * DAY_MS), end: NOW_UTC, label: 'Last 7 days' }
  }
  return { start: new Date(NOW_UTC.getTime() - 30 * DAY_MS), end: NOW_UTC, label: 'Last 30 days' }
}

function resolveAsOf(asOf: string | 'now' | undefined): Date {
  if (!asOf || asOf === 'now') return NOW_UTC
  return new Date(asOf)
}

// ---------------------------------------------------------------------------
// Raw row construction
// ---------------------------------------------------------------------------

function localTimestamp(utc: Date, offsetMinutes: number): string {
  return new Date(utc.getTime() + offsetMinutes * 60000).toISOString().replace('Z', '')
}

function buildRawRows(dataset: Dataset, direction: Direction): Record<string, RawRow[]> {
  const testAccountSet = new Set(dataset.testAccountIds)
  const lateSet = new Set(dataset.lateArrivalTxnIds)
  const candidates = dataset.transactions.filter(
    (t) => dataset.providerDirection[t.providerId] === direction
  )

  // ~20% of settled Card Processor deposits are gateway-exclusive: real-time
  // deposits PaymentGateway confirms that haven't posted to the ledger yet.
  // Scoped to settled rows only — a reversal or chargeback "not yet posted"
  // wouldn't fit that story, and letting one slip in here silently breaks
  // step 06's netting (it nets against CoreBanking's view specifically).
  const cardProcessorTxns = candidates.filter((t) => {
    const provider = dataset.providers.find((p) => p.id === t.providerId)!
    return provider.category === 'Card Processor' && t.status === 'settled'
  })
  const gatewayExclusiveIds = new Set(
    cardProcessorTxns.filter((_, i) => i % 5 === 0).map((t) => t.id)
  )

  function reportedAt(txn: (typeof candidates)[number]): string {
    const ts = new Date(txn.timestampUtc)
    if (lateSet.has(txn.id)) {
      const delay = 2 + (txn.id.charCodeAt(txn.id.length - 1) % 8) // 2-9 days, deterministic
      const reported = new Date(ts.getTime() + delay * DAY_MS)
      return reported.getTime() > NOW_UTC.getTime() ? NOW_UTC.toISOString() : reported.toISOString()
    }
    return ts.toISOString()
  }

  const rowsBySource: Record<string, RawRow[]> = {}

  for (const source of SOURCES) {
    const rows: RawRow[] = []
    for (const txn of candidates) {
      if (txn.id === dataset.ghostTransaction.id) continue // reported by no source, by design
      if (source.coverage === 'card_processor_only') {
        const provider = dataset.providers.find((p) => p.id === txn.providerId)!
        if (provider.category !== 'Card Processor') continue
      } else if (gatewayExclusiveIds.has(txn.id)) {
        // CoreBanking / LedgerExport haven't posted this one yet
        continue
      }

      const account = dataset.accounts.find((a) => a.id === txn.accountId)!
      const rawAmount = Math.round(txn.amount * source.rate * 100) / 100
      const rowId = source.idScheme === 'exact' ? `${source.key}:${txn.id}` : `${source.key}:g${rows.length}`

      rows.push({
        rowId,
        source: source.key,
        groundTruthId: txn.id,
        accountId: txn.accountId,
        providerId: txn.providerId,
        rawAmount,
        rawCurrency: source.currency,
        rawStatus: source.toSourceStatus(txn.status),
        canonicalStatus: source.statusMap(source.toSourceStatus(txn.status)),
        timestampUtc: txn.timestampUtc,
        timestampLocal: localTimestamp(new Date(txn.timestampUtc), source.timezoneOffsetMinutes),
        reportedAtUtc: reportedAt(txn),
        isTestAccount: testAccountSet.has(account.id),
        amountUsd: txn.amount,
      })
    }
    rowsBySource[source.key] = rows
  }

  // Deliberately inject a handful of unmapped LedgerExport statuses so step
  // 03 has real, surfaced-but-not-dropped rows to warn about.
  const ledgerRows = rowsBySource[LEDGER_EXPORT.key]
  let unmappedInjected = 0
  for (const row of ledgerRows) {
    if (unmappedInjected >= 3) break
    if (row.canonicalStatus === 'settled' && row.groundTruthId.endsWith('3')) {
      row.rawStatus = 'on_hold'
      row.canonicalStatus = 'unmapped'
      unmappedInjected++
    }
  }

  return rowsBySource
}

// ---------------------------------------------------------------------------
// Adjustment pipeline
// ---------------------------------------------------------------------------

export interface AdjustmentRowRef {
  rowId: string
  source: string
  detail: string
}

export interface Adjustment {
  step: number
  name: string
  rowsAffected: number
  delta: number
  explanation: string
  rows: AdjustmentRowRef[]
  warnings: string[]
}

export interface SourceContribution {
  source: string
  currency: string
  amountField: string
  statusField: string
  timezoneLabel: string
  rowCount: number
  rawTotal: number
  windowLabel: string
}

export interface ResidualDrilldown {
  groundTruthOnly: { id: string; accountId: string; amountUsd: number }[]
}

export interface MetricResult {
  key: string
  label: string
  isCount: boolean
  window: WindowInput
  windowLabel: string
  asOf: string
  asOfLabel: string
  compareAsOf?: string
  compareValue?: number
  delta?: number
  sources: SourceContribution[]
  adjustments: Adjustment[]
  reconciledTotal: number
  compositionBySource: { source: string; amount: number }[]
  residual: number
  residualPercent: number
  residualDrilldown: ResidualDrilldown
  confidenceStatement: string
  rawRowsById: Record<string, RawRow>
}

function inWindow(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

function computeAmountMetric(
  dataset: Dataset,
  key: 'deposits_total' | 'withdrawals_total',
  label: string,
  direction: Direction,
  window: WindowInput,
  asOfInput: string | 'now' | undefined
): MetricResult {
  const { start, end, label: windowLabel } = resolveWindow(window)
  const asOf = resolveAsOf(asOfInput)
  const rowsBySource = buildRawRows(dataset, direction)

  const rawRowsById: Record<string, RawRow> = {}
  const sourceContributions: SourceContribution[] = []

  for (const source of SOURCES) {
    const rows = rowsBySource[source.key].filter((r) => inWindow(r.timestampUtc, start, end))
    for (const r of rows) rawRowsById[r.rowId] = r
    sourceContributions.push({
      source: source.key,
      currency: source.currency,
      amountField: source.amountField,
      statusField: source.statusField,
      timezoneLabel: source.timezoneLabel,
      rowCount: rows.length,
      rawTotal: Math.round(rows.reduce((s, r) => s + r.rawAmount, 0) * 100) / 100,
      windowLabel,
    })
  }

  // Combined working set, one entry per row across all sources, in window.
  type WorkRow = RawRow & { kept: boolean }
  const allRows: WorkRow[] = SOURCES.flatMap((s) =>
    rowsBySource[s.key].filter((r) => inWindow(r.timestampUtc, start, end)).map((r) => ({ ...r, kept: true }))
  )

  const adjustments: Adjustment[] = []

  // Running total = sum of amountUsd for every row still marked `kept`,
  // regardless of status — this must start from the SAME baseline as the
  // sum of the per-source raw totals (all statuses, unfiltered) so the
  // steps telescope exactly: starting total + every delta = reconciled
  // total. Step 03 below is the point where non-settled/unmapped rows
  // actually leave the kept set; steps before it must not filter by status
  // themselves or the identity breaks.
  function runningTotal(rows: WorkRow[]): number {
    return Math.round(rows.filter((r) => r.kept).reduce((s, r) => s + r.amountUsd, 0) * 100) / 100
  }

  // --- Step 01: timezone normalization -------------------------------------
  {
    const shifted = allRows.filter((r) => {
      const utcDate = r.timestampUtc.slice(0, 10)
      const localDate = r.timestampLocal.slice(0, 10)
      return utcDate !== localDate
    })
    const acrossEdge = shifted.filter((r) => {
      const localAsUtc = new Date(r.timestampLocal + 'Z')
      return inWindow(r.timestampUtc, start, end) !== (localAsUtc >= start && localAsUtc <= end)
    })
    adjustments.push({
      step: 1,
      name: 'Timezone normalization to UTC',
      rowsAffected: shifted.length,
      delta: 0,
      explanation: `${shifted.length} rows were reported against a local calendar date that differs from its UTC date once normalized; ${acrossEdge.length} of those land on a different side of the reporting window edge than the source's own daily cutoff would suggest.`,
      rows: shifted.slice(0, 25).map((r) => ({ rowId: r.rowId, source: r.source, detail: `${r.timestampLocal} (${r.source}) -> ${r.timestampUtc} UTC` })),
      warnings: [],
    })
  }

  // --- Step 02: test / internal account exclusion --------------------------
  {
    const before = runningTotal(allRows)
    const testRows = allRows.filter((r) => r.kept && r.isTestAccount)
    const testRemovedValue = Math.round(testRows.reduce((s, r) => s + r.amountUsd, 0) * 100) / 100
    for (const r of testRows) r.kept = false
    const after = runningTotal(allRows)
    adjustments.push({
      step: 2,
      name: 'Test and internal account exclusion',
      rowsAffected: testRows.length,
      delta: Math.round((after - before) * 100) / 100,
      explanation: `${testRows.length} rows belonged to internal test accounts and were removed, taking $${testRemovedValue.toFixed(2)} out of the raw total.`,
      rows: testRows.slice(0, 25).map((r) => ({ rowId: r.rowId, source: r.source, detail: `account ${r.accountId}, $${r.amountUsd.toFixed(2)}` })),
      warnings: [],
    })
  }

  // --- Step 03: status vocabulary mapping -----------------------------------
  {
    const before = runningTotal(allRows)
    const nonSettled = allRows.filter((r) => r.kept && r.canonicalStatus !== 'settled' && r.canonicalStatus !== 'unmapped')
    const unmapped = allRows.filter((r) => r.kept && r.canonicalStatus === 'unmapped')
    // this is the point where non-settled and unmapped rows actually leave
    // the kept set — everything after this step operates on settled rows only
    for (const r of [...nonSettled, ...unmapped]) r.kept = false
    const after = runningTotal(allRows)
    const byStatus: Record<string, number> = {}
    for (const r of nonSettled) byStatus[r.canonicalStatus] = (byStatus[r.canonicalStatus] ?? 0) + 1
    adjustments.push({
      step: 3,
      name: 'Status vocabulary mapping to canonical set',
      rowsAffected: nonSettled.length + unmapped.length,
      delta: Math.round((after - before) * 100) / 100,
      explanation:
        `Each source's own status word was mapped to a canonical set (settled, pending, failed, reversed, chargeback). ` +
        `${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(', ') || 'no non-settled rows'} excluded as non-settled.` +
        (unmapped.length ? ` ${unmapped.length} rows carried a status with no canonical mapping and are surfaced below, not dropped silently.` : ''),
      rows: unmapped.map((r) => ({ rowId: r.rowId, source: r.source, detail: `raw status "${r.rawStatus}" has no canonical mapping` })),
      warnings: unmapped.length
        ? [`${unmapped.length} rows have an unmapped status ("${[...new Set(unmapped.map((r) => r.rawStatus))].join('", "')}") and are excluded from the reconciled total until mapped.`]
        : [],
    })
  }

  // --- Step 04: currency conversion -----------------------------------------
  {
    const nonUsd = allRows.filter((r) => r.kept && r.canonicalStatus === 'settled' && r.rawCurrency !== 'USD')
    const byCurrency: Record<string, { rows: number; delta: number }> = {}
    for (const r of nonUsd) {
      const converted = r.rawAmount / SOURCES.find((s) => s.currency === r.rawCurrency)!.rate
      const delta = converted - r.amountUsd
      byCurrency[r.rawCurrency] ??= { rows: 0, delta: 0 }
      byCurrency[r.rawCurrency].rows++
      byCurrency[r.rawCurrency].delta += delta
    }
    const totalDelta = Object.values(byCurrency).reduce((s, v) => s + v.delta, 0)
    adjustments.push({
      step: 4,
      name: 'Currency conversion',
      rowsAffected: nonUsd.length,
      delta: Math.round(totalDelta * 100) / 100,
      explanation:
        Object.entries(byCurrency)
          .map(([cur, v]) => {
            const src = SOURCES.find((s) => s.currency === cur)!
            return `${v.rows} ${cur} rows converted at ${src.rate} (${src.rateSource}, ${src.rateDate}), delta $${v.delta.toFixed(2)}`
          })
          .join('; ') || 'all rows already in USD',
      rows: nonUsd.slice(0, 25).map((r) => ({ rowId: r.rowId, source: r.source, detail: `${r.rawAmount} ${r.rawCurrency} -> $${r.amountUsd.toFixed(2)}` })),
      warnings: [],
    })
  }

  // --- Step 05: cross-source deduplication ----------------------------------
  {
    const before = runningTotal(allRows)
    const kept = allRows.filter((r) => r.kept && r.canonicalStatus === 'settled')
    const byGtid = new Map<string, WorkRow[]>()
    for (const r of kept) {
      if (!byGtid.has(r.groundTruthId)) byGtid.set(r.groundTruthId, [])
      byGtid.get(r.groundTruthId)!.push(r)
    }
    const priority: Record<string, number> = { CoreBanking: 0, LedgerExport: 1, PaymentGateway: 2 }
    let exactRemoved = 0
    let exactValue = 0
    let fuzzyRemoved = 0
    let fuzzyValue = 0
    const removedRows: WorkRow[] = []
    for (const [, group] of byGtid) {
      if (group.length <= 1) continue
      group.sort((a, b) => priority[a.source] - priority[b.source])
      const [, ...dupes] = group
      for (const d of dupes) {
        d.kept = false
        removedRows.push(d)
        if (d.source === 'LedgerExport') {
          exactRemoved++
          exactValue += d.amountUsd
        } else {
          fuzzyRemoved++
          fuzzyValue += d.amountUsd
        }
      }
    }
    const after = runningTotal(allRows)
    adjustments.push({
      step: 5,
      name: 'Cross-source deduplication',
      rowsAffected: exactRemoved + fuzzyRemoved,
      delta: Math.round((after - before) * 100) / 100,
      explanation: `${exactRemoved} rows removed as exact duplicates (same underlying transaction reference, $${exactValue.toFixed(2)}); ${fuzzyRemoved} rows removed as fuzzy duplicates matched by account, amount, and timing rather than a shared reference ($${fuzzyValue.toFixed(2)}).`,
      rows: removedRows.slice(0, 25).map((r) => ({ rowId: r.rowId, source: r.source, detail: `duplicate of ${r.groundTruthId}, $${r.amountUsd.toFixed(2)}` })),
      warnings: [],
    })
  }

  // --- Step 06: reversals and chargebacks netted ----------------------------
  {
    const before = runningTotal(allRows)
    const coreRowsByGtid = new Map(rowsBySource['CoreBanking'].map((r) => [r.groundTruthId, r]))
    const reversalTxns = dataset.transactions.filter(
      (t) =>
        (t.status === 'reversed' || t.status === 'chargeback') &&
        dataset.providerDirection[t.providerId] === direction &&
        inWindow(t.timestampUtc, start, end) &&
        coreRowsByGtid.has(t.id)
    )
    let matchedValue = 0
    const matchedRefs: AdjustmentRowRef[] = []
    const unmatchedRefs: AdjustmentRowRef[] = []
    for (const rev of reversalTxns) {
      if (rev.reversesTransactionId) {
        const originalRow = allRows.find((r) => r.groundTruthId === rev.reversesTransactionId && r.kept && r.canonicalStatus === 'settled')
        if (originalRow) {
          matchedValue += rev.amount
          matchedRefs.push({ rowId: rev.id, source: 'CoreBanking', detail: `nets $${rev.amount.toFixed(2)} against ${rev.reversesTransactionId}` })
          originalRow.amountUsd = Math.round((originalRow.amountUsd - rev.amount) * 100) / 100
          continue
        }
      }
      unmatchedRefs.push({ rowId: rev.id, source: 'CoreBanking', detail: `$${rev.amount.toFixed(2)}, no matching original in this window` })
    }
    const after = runningTotal(allRows)
    adjustments.push({
      step: 6,
      name: 'Reversals and chargebacks netted',
      rowsAffected: matchedRefs.length,
      delta: Math.round((after - before) * 100) / 100,
      explanation: `${matchedRefs.length} reversals or chargebacks netted a total of $${matchedValue.toFixed(2)} against their original settled transaction. ${unmatchedRefs.length} could not be matched to an original in this window and are listed separately, not netted.`,
      rows: [...matchedRefs, ...unmatchedRefs],
      warnings: unmatchedRefs.length ? [`${unmatchedRefs.length} unmatched reversal(s) — listed, not netted.`] : [],
    })
  }

  // --- Step 07: late arrivals -------------------------------------------------
  {
    const before = runningTotal(allRows)
    const notYetVisible = allRows.filter((r) => r.kept && r.canonicalStatus === 'settled' && new Date(r.reportedAtUtc) > asOf)
    const lateValue = Math.round(notYetVisible.reduce((s, r) => s + r.amountUsd, 0) * 100) / 100
    for (const r of notYetVisible) r.kept = false
    const after = runningTotal(allRows)
    const lateInWindow = allRows.filter((r) => dataset.lateArrivalTxnIds.includes(r.groundTruthId))
    const latestArrival = lateInWindow.length
      ? lateInWindow.reduce((max, r) => (new Date(r.reportedAtUtc) > max ? new Date(r.reportedAtUtc) : max), new Date(0))
      : null
    adjustments.push({
      step: 7,
      name: 'Late arrivals',
      rowsAffected: notYetVisible.length,
      delta: Math.round((after - before) * 100) / 100,
      explanation:
        `${notYetVisible.length} rows had not yet been reported as of ${asOf.toISOString()} ($${lateValue.toFixed(2)}).` +
        (latestArrival ? ` Latest arrival recorded at ${latestArrival.toISOString()}.` : ' No late-arriving rows in this window.'),
      rows: notYetVisible.map((r) => ({ rowId: r.rowId, source: r.source, detail: `reported ${r.reportedAtUtc}, after as-of` })),
      warnings: [],
    })
  }

  const reconciledTotal = runningTotal(allRows)

  const compositionBySource: { source: string; amount: number }[] = SOURCES.map((s) => ({
    source: s.key,
    amount: Math.round(allRows.filter((r) => r.kept && r.canonicalStatus === 'settled' && r.source === s.key).reduce((sum, r) => sum + r.amountUsd, 0) * 100) / 100,
  }))

  // Ground truth reference total (what actually happened, unattenuated by
  // any source's reporting gaps) — used only to compute the honest residual.
  // Reversal netting here must mirror step 06 exactly (only reversals that
  // are themselves within the window get netted), or the residual would mix
  // in a timing difference instead of isolating the one deliberate gap.
  const groundTruthTotal =
    Math.round(
      dataset.transactions
        .filter(
          (t) =>
            dataset.providerDirection[t.providerId] === direction &&
            t.status === 'settled' &&
            inWindow(t.timestampUtc, start, end) &&
            new Date(t.timestampUtc) <= asOf &&
            !dataset.accounts.find((a) => a.id === t.accountId)?.isTest
        )
        .reduce((s, t) => {
          const reversal = dataset.transactions.find(
            (r) => r.reversesTransactionId === t.id && inWindow(r.timestampUtc, start, end)
          )
          return s - (reversal?.amount ?? 0) + t.amount
        }, 0) *
        100
    ) / 100

  const residual = Math.round((groundTruthTotal - reconciledTotal) * 100) / 100
  const residualPercent = groundTruthTotal !== 0 ? Math.round((residual / groundTruthTotal) * 10000) / 100 : 0

  const residualDrilldown: ResidualDrilldown = {
    groundTruthOnly: dataset.transactions
      .filter(
        (t) =>
          dataset.providerDirection[t.providerId] === direction &&
          t.status === 'settled' &&
          inWindow(t.timestampUtc, start, end) &&
          new Date(t.timestampUtc) <= asOf &&
          !SOURCES.some((s) => rowsBySource[s.key].some((r) => r.groundTruthId === t.id))
      )
      .map((t) => ({ id: t.id, accountId: t.accountId, amountUsd: t.amount })),
  }

  const unmappedRowCount = allRows.filter((r) => r.canonicalStatus === 'unmapped').length

  const confidenceStatement = `Reconciled from ${SOURCES.length} sources. ${unmappedRowCount} unmapped status value${unmappedRowCount === 1 ? '' : 's'}. Residual ${Math.abs(residualPercent).toFixed(1)} percent.`

  return {
    key,
    label,
    isCount: false,
    window,
    windowLabel,
    asOf: asOf.toISOString(),
    asOfLabel: asOfInput === 'now' || !asOfInput ? 'Now' : asOf.toISOString(),
    sources: sourceContributions,
    adjustments,
    reconciledTotal,
    compositionBySource,
    residual,
    residualPercent,
    residualDrilldown,
    confidenceStatement,
    rawRowsById,
  }
}

function computeActiveAccounts(dataset: Dataset, window: WindowInput, asOfInput: string | 'now' | undefined): MetricResult {
  const { start, end, label: windowLabel } = resolveWindow(window)
  const asOf = resolveAsOf(asOfInput)
  const testAccountSet = new Set(dataset.testAccountIds)
  const lateSet = new Set(dataset.lateArrivalTxnIds)

  const rows = dataset.transactions.filter((t) => t.status === 'settled' && inWindow(t.timestampUtc, start, end))
  const rawRowsById: Record<string, RawRow> = {}
  for (const t of rows) {
    rawRowsById[`CoreBanking:${t.id}`] = {
      rowId: `CoreBanking:${t.id}`,
      source: 'CoreBanking',
      groundTruthId: t.id,
      accountId: t.accountId,
      providerId: t.providerId,
      rawAmount: t.amount,
      rawCurrency: 'USD',
      rawStatus: 'posted',
      canonicalStatus: 'settled',
      timestampUtc: t.timestampUtc,
      timestampLocal: localTimestamp(new Date(t.timestampUtc), CORE_BANKING.timezoneOffsetMinutes),
      reportedAtUtc: lateSet.has(t.id) ? new Date(new Date(t.timestampUtc).getTime() + 4 * DAY_MS).toISOString() : t.timestampUtc,
      isTestAccount: testAccountSet.has(t.accountId),
      amountUsd: t.amount,
    }
  }

  const testRows = rows.filter((t) => testAccountSet.has(t.accountId))
  const afterTest = rows.filter((t) => !testAccountSet.has(t.accountId))
  const notYetVisible = afterTest.filter((t) => new Date(rawRowsById[`CoreBanking:${t.id}`].reportedAtUtc) > asOf)
  const visible = afterTest.filter((t) => new Date(rawRowsById[`CoreBanking:${t.id}`].reportedAtUtc) <= asOf)

  const accountsBeforeAdjustments = new Set(rows.map((t) => t.accountId)).size
  const accountsAfterTestExclusion = new Set(afterTest.map((t) => t.accountId)).size
  const accountsFinal = new Set(visible.map((t) => t.accountId)).size

  const adjustments: Adjustment[] = [
    {
      step: 2,
      name: 'Test and internal account exclusion',
      rowsAffected: testRows.length,
      delta: accountsAfterTestExclusion - accountsBeforeAdjustments,
      explanation: `${new Set(testRows.map((t) => t.accountId)).size} test account(s) removed from the active count.`,
      rows: testRows.map((t) => ({ rowId: `CoreBanking:${t.id}`, source: 'CoreBanking', detail: `account ${t.accountId}` })),
      warnings: [],
    },
    {
      step: 7,
      name: 'Late arrivals',
      rowsAffected: notYetVisible.length,
      delta: accountsFinal - accountsAfterTestExclusion,
      explanation: `${notYetVisible.length} rows not yet reported as of ${asOf.toISOString()}; this can drop an account from the active count if it was its only activity in the window.`,
      rows: notYetVisible.map((t) => ({ rowId: `CoreBanking:${t.id}`, source: 'CoreBanking', detail: `reported ${rawRowsById[`CoreBanking:${t.id}`].reportedAtUtc}` })),
      warnings: [],
    },
  ]

  return {
    key: 'active_accounts',
    label: 'Active accounts',
    isCount: true,
    window,
    windowLabel,
    asOf: asOf.toISOString(),
    asOfLabel: asOfInput === 'now' || !asOfInput ? 'Now' : asOf.toISOString(),
    sources: [
      {
        source: 'CoreBanking',
        currency: 'n/a (count)',
        amountField: 'account_id',
        statusField: 'status',
        timezoneLabel: CORE_BANKING.timezoneLabel,
        rowCount: rows.length,
        rawTotal: accountsBeforeAdjustments,
        windowLabel,
      },
    ],
    adjustments,
    reconciledTotal: accountsFinal,
    compositionBySource: [{ source: 'CoreBanking', amount: accountsFinal }],
    residual: 0,
    residualPercent: 0,
    residualDrilldown: { groundTruthOnly: [] },
    confidenceStatement: `Reconciled from 1 source. No residual — single-source count.`,
    rawRowsById,
  }
}

export interface MetricDef {
  key: string
  label: string
  sources: string[]
  adjustmentSteps: number[]
}

export const METRIC_REGISTRY: Record<string, MetricDef> = {
  deposits_total: { key: 'deposits_total', label: 'Deposits total', sources: ['CoreBanking', 'PaymentGateway', 'LedgerExport'], adjustmentSteps: [1, 2, 3, 4, 5, 6, 7] },
  withdrawals_total: { key: 'withdrawals_total', label: 'Withdrawals total', sources: ['CoreBanking', 'PaymentGateway', 'LedgerExport'], adjustmentSteps: [1, 2, 3, 4, 5, 6, 7] },
  active_accounts: { key: 'active_accounts', label: 'Active accounts', sources: ['CoreBanking'], adjustmentSteps: [2, 7] },
}

export function getMetric(
  dataset: Dataset,
  key: string,
  opts: { window?: WindowInput; asOf?: string | 'now' } = {}
): MetricResult {
  const window = opts.window ?? '7d'
  if (key === 'deposits_total') return computeAmountMetric(dataset, 'deposits_total', 'Deposits total', 'deposit', window, opts.asOf)
  if (key === 'withdrawals_total') return computeAmountMetric(dataset, 'withdrawals_total', 'Withdrawals total', 'withdrawal', window, opts.asOf)
  if (key === 'active_accounts') return computeActiveAccounts(dataset, window, opts.asOf)
  throw new Error(`Unknown metric: ${key}`)
}
