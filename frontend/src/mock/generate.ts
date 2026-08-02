import { Rng } from './rng'
import type {
  Account,
  CanonicalStatus,
  Edge,
  Entity,
  Flag,
  Organization,
  Provider,
  Transaction,
} from './types'

// Anchor "now" for the whole dataset — every window/asOf calculation in
// reconciliation.ts is relative to this, so the demo is stable across loads.
export const NOW_UTC = new Date('2026-07-28T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_START = new Date(NOW_UTC.getTime() - 45 * DAY_MS)

const SEED = 20260728

const SUBSIDIARY_NAMES = [
  'Argent Retail Payments',
  'Argent Freight Finance',
  'Argent Card Services',
  'Argent Trade Credit',
  'Argent Digital Lending',
  'Argent Merchant Solutions',
  'Argent Treasury Ops',
  'Argent International Settlements',
]

const ACCOUNT_LABELS = [
  'Operating Account',
  'Settlement Account',
  'Reserve Account',
  'Payables Account',
  'Collections Account',
  'Escrow Account',
]

export const PROVIDER_DEFS: {
  name: string
  category: string
  direction: 'deposit' | 'withdrawal'
}[] = [
  { name: 'Meridian Card Network', category: 'Card Processor', direction: 'deposit' },
  { name: 'Northfield ACH', category: 'ACH Processor', direction: 'deposit' },
  { name: 'Solano Wire Services', category: 'Wire Network', direction: 'deposit' },
  { name: 'Kestrel Bank Partners', category: 'Bank Partner', direction: 'deposit' },
  { name: 'Verdant Payout Network', category: 'Payout Network', direction: 'withdrawal' },
  { name: 'Ashford Merchant Settlement', category: 'Merchant Settlement', direction: 'withdrawal' },
]

const STATUS_POOL: { status: CanonicalStatus; weight: number }[] = [
  { status: 'settled', weight: 78 },
  { status: 'pending', weight: 6 },
  { status: 'failed', weight: 9 },
  { status: 'reversed', weight: 4 },
  { status: 'chargeback', weight: 3 },
]

function weightedStatus(rng: Rng): CanonicalStatus {
  const total = STATUS_POOL.reduce((s, p) => s + p.weight, 0)
  let r = rng.float(0, total)
  for (const p of STATUS_POOL) {
    if (r < p.weight) return p.status
    r -= p.weight
  }
  return 'settled'
}

function randomTimestamp(rng: Rng): Date {
  const t = rng.float(WINDOW_START.getTime(), NOW_UTC.getTime())
  return new Date(t)
}

export interface Dataset {
  organizations: Organization[]
  accounts: Account[]
  providers: Provider[]
  transactions: Transaction[]
  edges: Edge[]
  flags: Flag[]
  testAccountIds: string[]
  lateArrivalTxnIds: string[]
  ghostTransaction: Transaction
  providerDirection: Record<string, 'deposit' | 'withdrawal'>
}

export function generateDataset(): Dataset {
  const rng = new Rng(SEED)
  const organizations: Organization[] = []
  const accounts: Account[] = []
  const providers: Provider[] = []
  const transactions: Transaction[] = []
  const edges: Edge[] = []
  const flags: Flag[] = []

  // --- Organizations -------------------------------------------------------
  const holding: Organization = {
    kind: 'organization',
    id: 'org-holding',
    name: 'Argent Holdings',
    type: 'holding',
    sourceSystems: ['CoreBanking', 'LedgerExport'],
    reconciled: true,
    parentId: null,
  }
  organizations.push(holding)

  const subsidiaries: Organization[] = SUBSIDIARY_NAMES.map((name, i) => ({
    kind: 'organization' as const,
    id: `org-sub-${i + 1}`,
    name,
    type: 'subsidiary' as const,
    sourceSystems: ['CoreBanking', 'LedgerExport'],
    reconciled: true,
    parentId: holding.id,
  }))
  organizations.push(...subsidiaries)

  for (const sub of subsidiaries) {
    edges.push({ source: holding.id, target: sub.id, relType: 'parent_of' })
  }

  // --- Providers -------------------------------------------------------------
  const providerDirection: Record<string, 'deposit' | 'withdrawal'> = {}
  for (let i = 0; i < PROVIDER_DEFS.length; i++) {
    const def = PROVIDER_DEFS[i]
    const id = `provider-${i + 1}`
    providers.push({
      kind: 'provider',
      id,
      name: def.name,
      category: def.category,
      sourceSystems: ['CoreBanking', 'PaymentGateway'],
    })
    providerDirection[id] = def.direction
  }

  // Irregularity #1 — silent source: this provider's last transaction is
  // well before NOW while every other provider stays active through NOW.
  const silentProvider = providers[3] // Kestrel Bank Partners
  const silentCutoff = new Date(NOW_UTC.getTime() - 22 * DAY_MS)

  // --- Accounts --------------------------------------------------------------
  let accountCounter = 0
  let testAccountsAssigned = 0
  const testAccountIds: string[] = []
  let duplicateAccountAssigned = false
  let mismatchAccountId: string | null = null

  for (const sub of subsidiaries) {
    const n = rng.int(3, 6)
    for (let i = 0; i < n; i++) {
      accountCounter++
      const isTest =
        testAccountsAssigned < 2 && i === 0 && rng.bool(0.5) && sub.id !== subsidiaries[0].id
      const id = `account-${accountCounter}`
      const label = `${rng.pick(ACCOUNT_LABELS)}`

      // Irregularity #4 — duplicate account, resolved from two source
      // records. Give it exactly one to keep the flag traceable.
      const isDuplicate = !duplicateAccountAssigned && sub === subsidiaries[2] && i === 1

      const account: Account = {
        kind: 'account',
        id,
        label: `${label} ${accountCounter}`,
        orgId: sub.id,
        sourceSystems: isDuplicate ? ['CoreBanking', 'PaymentGateway'] : ['CoreBanking', 'LedgerExport'],
        reconciled: !isDuplicate,
        isTest,
      }
      accounts.push(account)
      edges.push({ source: sub.id, target: id, relType: 'holds' })

      if (isTest) {
        testAccountIds.push(id)
        testAccountsAssigned++
      }
      if (isDuplicate) {
        duplicateAccountAssigned = true
        flags.push({
          entityId: id,
          entityKind: 'account',
          kind: 'duplicate_account',
          reason:
            'This account was resolved from two separate source records that refer to the same underlying account, one carried in CoreBanking and one in PaymentGateway. The merge has not been confirmed.',
          sources: ['CoreBanking', 'PaymentGateway'],
        })
      }
      if (!isTest && !isDuplicate && mismatchAccountId === null && sub === subsidiaries[4] && i === 1) {
        mismatchAccountId = id
      }
    }
  }

  // --- Transactions ------------------------------------------------------
  let txnCounter = 0
  const lateArrivalTxnIds: string[] = []
  const reversalCandidates: { id: string; accountId: string; providerId: string }[] = []

  for (const account of accounts) {
    const isMismatchAccount = account.id === mismatchAccountId
    const count = rng.int(4, 10)
    const amounts: number[] = []

    for (let i = 0; i < count; i++) {
      txnCounter++
      const id = `txn-${txnCounter}`

      let provider = rng.pick(providers)
      if (provider.id === silentProvider.id) {
        // keep this provider's own transactions before the cutoff; let other
        // txns use other providers so the silent-source contrast is real
      }

      let timestamp = randomTimestamp(rng)
      if (provider.id === silentProvider.id && timestamp > silentCutoff) {
        // push this specific row before the cutoff instead of discarding it,
        // so the provider still has a believable transaction history
        timestamp = new Date(rng.float(WINDOW_START.getTime(), silentCutoff.getTime()))
      }

      const status = weightedStatus(rng)
      let amount = Math.round(rng.float(120, 18000) * 100) / 100

      // Irregularity #2 — account whose total won't reconcile across two
      // source systems: skew CoreBanking-tagged rows higher than
      // LedgerExport-tagged rows for this one account.
      let sourceSystem = rng.pick(['CoreBanking', 'LedgerExport'])
      if (isMismatchAccount) {
        sourceSystem = i % 2 === 0 ? 'CoreBanking' : 'LedgerExport'
        if (sourceSystem === 'CoreBanking') amount = Math.round(amount * 1.35 * 100) / 100
      }

      const txn: Transaction = {
        kind: 'transaction',
        id,
        accountId: account.id,
        providerId: provider.id,
        amount,
        currency: 'USD',
        status,
        timestampUtc: timestamp.toISOString(),
        sourceSystem,
        reversesTransactionId: null,
      }
      transactions.push(txn)
      amounts.push(amount)
      edges.push({ source: account.id, target: id, relType: 'transacted' })
      edges.push({ source: id, target: provider.id, relType: 'processed_by' })

      if (status === 'settled' && rng.bool(0.15) && lateArrivalTxnIds.length < 6) {
        lateArrivalTxnIds.push(id)
      }
      if ((status === 'reversed' || status === 'chargeback') && rng.bool(0.7)) {
        reversalCandidates.push({ id, accountId: account.id, providerId: provider.id })
      }
    }

    // Irregularity #3 — statistical outlier: one transaction far outside
    // this account's own distribution.
    if (amounts.length >= 3 && !isMismatchAccount && account.id === accounts[8]?.id) {
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
      const outlierAmount = Math.round(mean * 22 * 100) / 100
      const targetTxn = transactions[transactions.length - amounts.length]
      targetTxn.amount = outlierAmount
      targetTxn.status = 'settled'
      flags.push({
        entityId: targetTxn.id,
        entityKind: 'transaction',
        kind: 'statistical_outlier',
        reason: `This transaction is $${outlierAmount.toLocaleString()}, far outside this account's typical range (other transactions average $${mean.toFixed(2)}). Flagged for review before it is treated as routine activity.`,
        sources: [targetTxn.sourceSystem],
      })
    }
  }

  // Wire up a few reversals to an earlier settled transaction on the same
  // account/provider, leaving exactly one unmatched on purpose.
  let unmatchedAssigned = false
  for (const rev of reversalCandidates) {
    const earlierSettled = transactions.find(
      (t) =>
        t.accountId === rev.accountId &&
        t.providerId === rev.providerId &&
        t.status === 'settled' &&
        t.id !== rev.id &&
        new Date(t.timestampUtc) < new Date(transactions.find((x) => x.id === rev.id)!.timestampUtc)
    )
    const revTxn = transactions.find((t) => t.id === rev.id)!
    if (earlierSettled && !unmatchedAssigned && rng.bool(0.25)) {
      unmatchedAssigned = true // deliberately leave this one unmatched
      continue
    }
    if (earlierSettled) {
      revTxn.reversesTransactionId = earlierSettled.id
    }
  }

  // Flag the silent-source provider now that its transactions exist.
  const silentTxns = transactions.filter((t) => t.providerId === silentProvider.id)
  const lastSeen = silentTxns.reduce(
    (max, t) => (new Date(t.timestampUtc) > max ? new Date(t.timestampUtc) : max),
    new Date(0)
  )
  flags.push({
    entityId: silentProvider.id,
    entityKind: 'provider',
    kind: 'silent_source',
    reason: `No transactions have been recorded through ${silentProvider.name} since ${lastSeen.toISOString().slice(0, 10)}, while every other provider remains active through the current reporting window. CoreBanking still lists it as an active provider; PaymentGateway has not carried it since that date.`,
    sources: ['CoreBanking', 'PaymentGateway'],
  })

  // Flag the reconciliation-mismatch account now that its rows exist.
  if (mismatchAccountId) {
    const rows = transactions.filter((t) => t.accountId === mismatchAccountId)
    const coreTotal = rows
      .filter((t) => t.sourceSystem === 'CoreBanking')
      .reduce((s, t) => s + t.amount, 0)
    const ledgerTotal = rows
      .filter((t) => t.sourceSystem === 'LedgerExport')
      .reduce((s, t) => s + t.amount, 0)
    flags.push({
      entityId: mismatchAccountId,
      entityKind: 'account',
      kind: 'reconciliation_mismatch',
      reason: `CoreBanking reports $${coreTotal.toFixed(2)} in transaction value for this account; LedgerExport reports $${ledgerTotal.toFixed(2)} for the same account. The difference of $${Math.abs(coreTotal - ledgerTotal).toFixed(2)} has not been explained.`,
      sources: ['CoreBanking', 'LedgerExport'],
      metricKey: 'deposits_total',
    })
    accounts.find((a) => a.id === mismatchAccountId)!.reconciled = false
  }

  // A ground-truth deposit transaction that no source ever reports — the
  // honest, permanent residual in the deposits_total reconciliation.
  txnCounter++
  const ghostAccount = accounts.find((a) => !a.isTest && a.id !== mismatchAccountId)!
  const ghostProvider = providers.find((p) => p.category === 'Card Processor')!
  const ghostTransaction: Transaction = {
    kind: 'transaction',
    id: `txn-${txnCounter}`,
    accountId: ghostAccount.id,
    providerId: ghostProvider.id,
    amount: 842.17,
    currency: 'USD',
    status: 'settled',
    timestampUtc: new Date(NOW_UTC.getTime() - 4 * DAY_MS).toISOString(),
    sourceSystem: 'CoreBanking',
    reversesTransactionId: null,
  }
  transactions.push(ghostTransaction)
  edges.push({ source: ghostAccount.id, target: ghostTransaction.id, relType: 'transacted' })
  edges.push({ source: ghostTransaction.id, target: ghostProvider.id, relType: 'processed_by' })

  for (const rev of transactions.filter((t) => t.reversesTransactionId)) {
    edges.push({ source: rev.id, target: rev.reversesTransactionId!, relType: 'reverses' })
  }

  return {
    organizations,
    accounts,
    providers,
    transactions,
    edges,
    flags,
    testAccountIds,
    lateArrivalTxnIds,
    ghostTransaction,
    providerDirection,
  }
}

export function allEntities(d: Dataset): Entity[] {
  return [...d.organizations, ...d.accounts, ...d.providers, ...d.transactions]
}
