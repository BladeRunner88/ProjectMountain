// Shared schema for the Part A mock dataset. Every view in the app reads
// through this module's public API (see index.ts) — nothing here is fetched,
// nothing here can fail at runtime.

export type EntityKind = 'organization' | 'account' | 'provider' | 'transaction'

export interface Organization {
  kind: 'organization'
  id: string
  name: string
  type: 'holding' | 'subsidiary'
  sourceSystems: string[]
  reconciled: boolean
  parentId: string | null
}

export interface Account {
  kind: 'account'
  id: string
  label: string
  orgId: string
  sourceSystems: string[]
  reconciled: boolean
  isTest: boolean
}

export interface Provider {
  kind: 'provider'
  id: string
  name: string
  category: string
  sourceSystems: string[]
}

export type CanonicalStatus = 'settled' | 'pending' | 'failed' | 'reversed' | 'chargeback'

export interface Transaction {
  kind: 'transaction'
  id: string
  accountId: string
  providerId: string
  amount: number
  currency: string
  status: CanonicalStatus
  timestampUtc: string
  sourceSystem: string
  reversesTransactionId: string | null
}

export type Entity = Organization | Account | Provider | Transaction

export type RelationType = 'parent_of' | 'holds' | 'transacted' | 'processed_by' | 'reverses'

export interface Edge {
  source: string
  target: string
  relType: RelationType
}

export type FlagKind =
  | 'silent_source'
  | 'reconciliation_mismatch'
  | 'statistical_outlier'
  | 'duplicate_account'

export interface Flag {
  entityId: string
  entityKind: EntityKind
  kind: FlagKind
  reason: string
  sources: string[]
  metricKey?: string
}
