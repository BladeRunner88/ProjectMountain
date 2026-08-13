// S9.13: TRUST AND PERFORMANCE — closes the product. Unlike every other
// tab, this one is not describing the expedition domain — it is describing
// the SYSTEM ITSELF: its engineering decisions, its security posture, its
// test health, its API surface, its performance budgets. There is no
// TracedValue chain for "is GraphQL introspection enabled" — that's not a
// fact about a climber, it's a fact about this codebase, so this file is
// plain structured data rather than `observed()`/`derived()` calls.
//
// What stays real, the same way it does everywhere else in ASE: every
// number that's a COUNT of something else in this same file (open findings,
// how many are high-severity, how many decisions, how many limitations) is
// COMPUTED from the underlying array, never hand-typed twice — so the
// posture header can never quietly drift from the findings list beneath it.
//
// The whole tab is governed by one rule stated in the spec itself: zero
// findings is not credible. Every section here shows real, specific,
// unresolved problems, not a clean sheet.

import type { TabId } from '../types/tabs'

// -- Decisions --------------------------------------------------------------

export type DecisionStatus = 'proposed' | 'under-review' | 'active' | 'superseded' | 'deprecated'
export type DecisionConfidence = 'proven' | 'strong' | 'moderate' | 'tentative'

export interface DecisionAlternative {
  option: string
  whyItLost: string
}

export interface Decision {
  id: number
  title: string
  status: DecisionStatus
  date: string
  by: string
  context: string
  whatWasChosen: string
  whatWasRejected: DecisionAlternative[]
  tradeOff: string
  evidence: string
  impact: string[]
  supersededById: number | null
  supersededReason: string | null
  confidence: DecisionConfidence
  confidenceNote: string
  implementation: { files: string[]; configs: string[]; modelVersions: string[] }
  reviewDueDate: string | null
}

export const DECISIONS: Decision[] = [
  {
    id: 1,
    title: 'Why confidence is computed rather than stored',
    status: 'active',
    date: '2025-11-03',
    by: 'S. Chen',
    context:
      'Early prototypes stored a confidence number alongside every fact, set once at write time. Once a source\'s reliability changed or an upstream value was corrected, every stored confidence downstream of it was silently wrong until someone re-ran a batch job.',
    whatWasChosen:
      'Confidence is a fold over a value\'s derivation tree, computed on read from `sourceReliability`/`matchScore`/`ruleAuthority` and the fold formulas in folds.ts, memoised per (TracedId, asOf) and invalidated on any graph write. Nothing in the system ever assigns a confidence number directly.',
    whatWasRejected: [
      { option: 'Store confidence at write time', whyItLost: 'goes stale the instant anything upstream changes; requires a batch recompute job that is itself a new source of drift.' },
      { option: 'Cache confidence with a TTL', whyItLost: 'a TTL is a guess at how often upstream facts change — it is either too short (defeats the cache) or too long (serves stale numbers as if current).' },
    ],
    tradeOff: 'A fold costs real CPU on first read of a deep chain (see Performance: fold of a 7-hop chain) in exchange for a confidence number that is provably always current, with no separate recompute pipeline to keep in sync.',
    evidence: 'folds.ts confidence()/computeConfidence(); measured fold latency in Performance.',
    impact: ['Every tab that renders a confidence figure', 'Performance budget: fold of a 7-hop chain'],
    supersededById: null,
    supersededReason: null,
    confidence: 'proven',
    confidenceNote: 'The memoisation cache hit rate and fold latency are both measured, not estimated — see Performance.',
    implementation: { files: ['ase/folds.ts', 'ase/traced.ts'], configs: [], modelVersions: [] },
    reviewDueDate: '2026-11-03',
  },
  {
    id: 2,
    title: 'Why we keep two time axes instead of one',
    status: 'active',
    date: '2025-11-18',
    by: 'S. Chen',
    context:
      'A fact has both when it was true in the world (valid time) and when ASE learned it (transaction time). Collapsing these into one timestamp made "what did we know when the decision was made" unanswerable — a correction recorded today about something that happened yesterday would misreport as having been known yesterday.',
    whatWasChosen:
      'Every TracedValue carries both `validFrom`/`validTo` and `recordedAt`, and the as-of scrubber (S3) reconstructs the graph as it was KNOWN at a past instant, not as the world was at that instant — the distinction the Timeline\'s "this is what we knew when the decision was made" line depends on.',
    whatWasRejected: [{ option: 'Single timestamp per fact', whyItLost: 'cannot distinguish a late-arriving correction from a fact that was always true — the exact ambiguity an incident review needs resolved.' }],
    tradeOff: 'Every TracedValue carries more bookkeeping fields and every fold that reads "as of" has to reason about two axes, in exchange for a genuinely reconstructable audit history.',
    evidence: 'ase/bitemporal.ts; the as-of scrubber\'s "reconciliation vs. correction" test cases.',
    impact: ['as-of scrubbing (nav bar)', 'Revision → Timeline', 'Trust → Connections (asOf on read queries)'],
    supersededById: null,
    supersededReason: null,
    confidence: 'strong',
    confidenceNote: 'Pilot data from the reconciliation-vs-correction test cases; not yet exercised at multi-month scale in production.',
    implementation: { files: ['ase/bitemporal.ts', 'ase/asOfContext.tsx'], configs: [], modelVersions: [] },
    reviewDueDate: '2026-11-18',
  },
  {
    id: 3,
    title: 'Why human corrections supersede rather than overwrite',
    status: 'active',
    date: '2025-12-01',
    by: 'R. Gurung',
    context: 'An early build let a human correction directly mutate a stored value. When a correction was later found to be wrong, there was no way to tell what the system had originally concluded.',
    whatWasChosen:
      'A human correction is `asserted()` as a new TracedValue and the original is marked `supersededBy`, never deleted or mutated. Both remain walkable in the graph — `latest()` returns the correction, but the original is still there for anyone who asks.',
    whatWasRejected: [{ option: 'In-place overwrite with a change log', whyItLost: 'a change log describes a mutation after the fact; supersession makes the original a first-class, still-queryable node instead of a footnote.' }],
    tradeOff: 'The graph never shrinks — every correction adds a node rather than replacing one — in exchange for the original ASE conclusion always being recoverable, which the audit chain\'s seal-verification depends on.',
    evidence: 'ase/graph.ts supersede(); ase/traced.ts asserted().',
    impact: ['Every tab with a correctable value', 'Revision → Record (audit chain)'],
    supersededById: null,
    supersededReason: null,
    confidence: 'proven',
    confidenceNote: 'Directly testable — every superseded value is provably still in the registry.',
    implementation: { files: ['ase/graph.ts', 'ase/traced.ts'], configs: [], modelVersions: [] },
    reviewDueDate: '2026-12-01',
  },
  {
    id: 4,
    title: 'Why the model is data and not code',
    status: 'active',
    date: '2026-01-14',
    by: 'S. Chen',
    context: 'The reasoning rules, detection thresholds and prediction drivers were originally hardcoded per deployment. Adapting ASE to a new domain meant a code change and a redeploy for every rule.',
    whatWasChosen:
      'Rules, thresholds and driver weights are data: DetectionRule.thresholdValue, context rules, prediction driver weights. The reasoning ENGINE — the fold formulas, the derivation kinds — is the one thing that stays code, shared across every domain.',
    whatWasRejected: [{ option: 'Domain-specific code per deployment', whyItLost: 'every new domain (mining, logistics) would need its own codebase to maintain and re-audit from scratch.' }],
    tradeOff: 'A data-driven rule is less expressive than arbitrary code, in exchange for one auditable engine that every domain shares — the industry-repeatability claim Connections\' example integrations make checkable.',
    evidence: 'ase/detection.ts DetectionRule; ase/contextEngine.ts ContextRule; Connections → example integrations diff.',
    impact: ['Detection → Tuning', 'Connections → example integrations', 'Roadmap → model expansion'],
    supersededById: null,
    supersededReason: null,
    confidence: 'moderate',
    confidenceNote: 'Proven for this one domain; a second domain\'s pilot is what would move this to "strong" — see Known Limitations.',
    implementation: { files: ['ase/detection.ts', 'ase/contextEngine.ts', 'ase/prediction.ts'], configs: ['detection rule thresholds', 'context rule bindings'], modelVersions: ['ase-decision-capacity-forecaster-v1'] },
    reviewDueDate: '2027-01-14',
  },
  {
    id: 5,
    title: 'Why ASE stays silent below 72% confidence',
    status: 'superseded',
    date: '2026-02-02',
    by: 'S. Chen',
    context:
      'Early pilot deployments surfaced every detection regardless of confidence, producing 34 false alarms a day and an acknowledgement rate of 31% — coordinators started ignoring the alert feed entirely, which is worse than not alerting at all.',
    whatWasChosen:
      'A single global confidence floor of 72%: anything below it is computed and stored, but not surfaced as an alert. Alert load fell to 3 a day; acknowledgement rose to 94%.',
    whatWasRejected: [
      { option: 'Per-operator thresholds', whyItLost: 'too inconsistent — the same underlying signal meant a different bar depending on which operator\'s climber it was about.' },
      { option: 'No floor at all', whyItLost: '34 false alarms a day in pilot, alert fatigue, 31% acknowledgement.' },
      { option: '60% floor', whyItLost: 'still 12 false alarms a day — not enough of a cut to fix acknowledgement.' },
      { option: '85% floor', whyItLost: 'missed 3 critical early warnings that were correct but under 85% at first detection.' },
    ],
    tradeOff:
      'Alert load fell to 3 a day and acknowledgement rose from 31% to 94%. The cost: 8% of genuine early warnings were suppressed below the floor and only surfaced later once confidence climbed — later than an ideal system would have caught them.',
    evidence: 'Pilot alert-load and acknowledgement-rate data, 2026-01 through 2026-02; Learning → prediction feedback.',
    impact: ['Detection alert surfacing', 'Prediction alert surfacing', 'Superseded by Decision 7'],
    supersededById: 7,
    supersededReason:
      'One global floor was too blunt — Identity needs 85% (a wrong merge is expensive to unwind), Detection needs 70%, Prediction needs 60% (a directional early warning is still useful well below where Identity would trust a merge). The global 72% floor suppressed 18% of valid detection alerts while letting 4% of weak identity merges through — a floor tuned for one class was wrong for the other two.',
    confidence: 'strong',
    confidenceNote: 'Superseded on real pilot data, not opinion — the 18%/4% figures are what forced the change.',
    implementation: { files: ['ase/tokens.ts CONFIDENCE_FLOOR_DEFAULT (historical)'], configs: [], modelVersions: [] },
    reviewDueDate: null,
  },
  {
    id: 6,
    title: 'Why we never replace your existing connectors',
    status: 'active',
    date: '2026-03-09',
    by: 'R. Gurung',
    context: 'Every operator already has a permit registry, a roster system, medical logging and route sensors. Asking them to replace any of it before ASE could run was the single biggest sales objection in early conversations.',
    whatWasChosen: 'ASE only ever reads from existing sources through a connector (`observed()`); it never becomes the system of record for anything it did not originate. Losing ASE never loses the underlying operational data.',
    whatWasRejected: [{ option: 'ASE as the primary system of record', whyItLost: 'creates a migration project and a single point of failure operators explicitly said they would not accept.' }],
    tradeOff: 'ASE inherits whatever data quality problems its sources already have (see Exposure — Fragility, Staleness) in exchange for zero migration cost and zero new single point of failure.',
    evidence: 'Sales objection log, 2025 Q4; Exposure tab\'s whole premise.',
    impact: ['Exposure (the whole tab)', 'Connections → SDKs and integration model'],
    supersededById: null,
    supersededReason: null,
    confidence: 'proven',
    confidenceNote: 'Structural — the connector model makes replacement architecturally impossible, not just a policy.',
    implementation: { files: ['ase/dataset.ts SOURCE_DEFS', 'ase/traced.ts observed()'], configs: [], modelVersions: [] },
    reviewDueDate: '2027-03-09',
  },
  {
    id: 7,
    title: 'Why confidence floors are per conclusion class',
    status: 'active',
    date: '2026-04-20',
    by: 'S. Chen',
    context: 'Decision 5\'s single global floor was measurably wrong in two directions at once — see Decision 5\'s superseded-by note for the exact figures.',
    whatWasChosen: 'A confidence floor per conclusion class: Identity 85%, Detection 70%, Prediction 60%, Meaning uses Detection\'s figure (60% carried over as the practical default where no class-specific pilot data exists yet). Exposure\'s own Staleness panel reads and can adjust these live, per class.',
    whatWasRejected: [{ option: 'Keep the single 72% floor', whyItLost: 'superseded — see Decision 5.' }, { option: 'Per-operator floors', whyItLost: 'same inconsistency problem Decision 5 already rejected, one level down.' }],
    tradeOff: 'Four numbers to maintain and explain instead of one, in exchange for each class alerting at the threshold that\'s actually right for its own cost of a false positive vs. a missed signal.',
    evidence: 'The 18%/4% pilot figures cited in Decision 5; Exposure → Staleness → Confidence floors.',
    impact: ['Exposure → Staleness', 'Detection alert surfacing', 'Identity merge confirmation', 'Prediction alert surfacing'],
    supersededById: null,
    supersededReason: null,
    confidence: 'strong',
    confidenceNote: 'Identity\'s 85% and Detection\'s 70% are pilot-backed; Prediction\'s 60% and Meaning\'s carried-over 60% have less data behind them yet.',
    implementation: { files: ['ase/tokens.ts CONFIDENCE_FLOOR_DEFAULT', 'ase/exposure.ts buildConfidenceFloors'], configs: ['per-class floor values'], modelVersions: [] },
    reviewDueDate: '2027-04-20',
  },
]

// -- Security -----------------------------------------------------------

export type Severity = 'high' | 'medium' | 'low'
export type FindingStatus = 'open' | 'closed'

export interface SecurityFinding {
  id: string
  finding: string
  severity: Severity
  status: FindingStatus
  opened: string
  closed: string | null
  owner: string
  eta: string | null
  what: string
  impact: string
  whySeverity: string
  whyStillOpen: string
  fixRequires: string
  mitigationNow: string
  blockedBy: string | null
}

export const SECURITY_FINDINGS: SecurityFinding[] = [
  {
    id: 'SEC-008',
    finding: 'GraphQL introspection enabled in production',
    severity: 'high',
    status: 'open',
    opened: '2026-05-02',
    closed: null,
    owner: 'Security team',
    eta: '2026-09-30',
    what: 'The production GraphQL endpoint answers introspection queries, exposing the full schema (every type, field and mutation) to anyone who can reach the endpoint.',
    impact: 'An attacker can map the entire API surface without any prior knowledge, including mutations like simulateSourceOutage and adjustConfidenceFloor — reconnaissance that should require legitimate documentation access.',
    whySeverity: 'HIGH: schema disclosure alone is not a breach, but it removes the cost of reconnaissance entirely and reveals mutation names an attacker would otherwise have to guess.',
    whyStillOpen:
      'Disabling introspection breaks two things that currently depend on it: the auto-generated API documentation in Connections, and the agent interface\'s field-discovery mechanism. Fixing this requires shipping a static schema snapshot for docs and a hardcoded schema for the agent interface FIRST, so both can stop calling introspection live — and that work is blocked on the agent interface release.',
    fixRequires: 'A versioned static schema export (already a Connections deliverable) consumed by docs and by the agent interface, then introspection disabled at the gateway.',
    mitigationNow: 'Rate limiting on the introspection query specifically; WAF rule alerting on introspection queries from outside the known documentation-generator IP range.',
    blockedBy: 'Agent interface release (Roadmap, Q3)',
  },
  {
    id: 'SEC-011',
    finding: 'Radio logs retained 90 days against a 30-day policy',
    severity: 'medium',
    status: 'open',
    opened: '2026-04-11',
    closed: null,
    owner: 'Engineer — data pipeline',
    eta: '2026-08-31',
    what: 'The radio-check-in-log connector\'s retention job was configured with a 90-day window during initial setup and never corrected to match the 30-day data-minimisation policy.',
    impact: 'No unauthorised access has occurred, but 60 days of retained records exceed what the stated policy and, in some jurisdictions, applicable regulation permits.',
    whySeverity: 'MEDIUM: a configuration/compliance gap, not an active exposure — no evidence of misuse, but a real policy violation with regulatory exposure if audited.',
    whyStillOpen: 'The retention job runs as part of the shared ingestion pipeline; changing its window requires a migration to purge the existing 60-day excess without deleting records still inside an active investigation hold, and that purge logic hasn\'t been written yet.',
    fixRequires: 'A retention-purge job that respects investigation holds, then a config change to the 30-day window.',
    mitigationNow: 'Access to radio logs older than 30 days is manually reviewed monthly and logged.',
    blockedBy: null,
  },
  {
    id: 'SEC-014',
    finding: 'Backup logbook not encrypted at rest',
    severity: 'medium',
    status: 'open',
    opened: '2026-05-20',
    closed: null,
    owner: 'Engineer — infrastructure',
    eta: '2026-09-15',
    what: 'The paper-logbook digitisation backup (a nightly export used only for disaster recovery) is written to encrypted-in-transit but plaintext-at-rest storage on the backup volume.',
    impact: 'If the backup volume itself were compromised, the logbook backup — names, camp assignments, medical notes — would be readable without needing to break any encryption.',
    whySeverity: 'MEDIUM: the primary datastore is encrypted at rest; this is a secondary, less-frequently-accessed backup, but it contains the same sensitive fields.',
    whyStillOpen: 'The backup volume is provisioned by the same infrastructure-as-code module used for three other, unrelated backup jobs; encrypting it in place requires a coordinated cutover for all four so a shared key-rotation window doesn\'t break the others mid-backup.',
    fixRequires: 'A coordinated infra change across all four backup jobs sharing the module, plus a key-rotation window.',
    mitigationNow: 'The backup volume sits in a network segment with no external route and access is restricted to two infrastructure engineers.',
    blockedBy: 'Infra module refactor (Roadmap, Q3)',
  },
  {
    id: 'SEC-017',
    finding: 'Operator session timeout 4h against a 2h policy',
    severity: 'low',
    status: 'open',
    opened: '2026-06-04',
    closed: null,
    owner: 'Engineer — auth',
    eta: '2026-08-20',
    what: 'The stated session policy is a 2-hour idle timeout for operator (coordinator/medic/guide) sessions; the deployed configuration still uses the 4-hour default set before the policy was tightened.',
    impact: 'A device left unattended for up to 4 hours keeps an authenticated session live, double the stated policy window.',
    whySeverity: 'LOW: field devices are typically kept on-person at altitude and physical access is already limited; this is a policy-conformance gap rather than an active exploited weakness.',
    whyStillOpen: 'Shortening the timeout without a "save your place" mechanism risks losing an in-progress overrule-reason form mid-entry at altitude, where re-authenticating can be slow on poor connectivity — the fix is tied to shipping session-preserving form drafts first.',
    fixRequires: 'Client-side form-draft persistence across a re-auth, then the timeout config change.',
    mitigationNow: 'Idle sessions are flagged (not terminated) after 2 hours and require a lightweight re-confirmation, not a full re-login, to continue.',
    blockedBy: null,
  },
  {
    id: 'SEC-002',
    finding: 'JWT moved from HS256 to RS256',
    severity: 'low',
    status: 'closed',
    opened: '2025-09-14',
    closed: '2025-10-02',
    owner: 'Engineer — auth',
    eta: null,
    what: 'Operator session tokens were signed with a symmetric HS256 secret shared across every service that needed to verify a token — any service that could verify could also forge.',
    impact: 'A compromised low-privilege service could have forged tokens for any role.',
    whySeverity: 'Was rated MEDIUM at open; closed after the RS256 migration removed the shared-secret forgery path entirely.',
    whyStillOpen: '',
    fixRequires: '',
    mitigationNow: '',
    blockedBy: null,
  },
  {
    id: 'SEC-006',
    finding: 'Weather feed API key rotation established',
    severity: 'low',
    status: 'closed',
    opened: '2025-12-08',
    closed: '2025-12-19',
    owner: 'Engineer — data pipeline',
    eta: null,
    what: 'The weather feed connector used a single, never-rotated API key issued at initial integration.',
    impact: 'An indefinitely-lived key is a bigger blast radius if ever leaked, with no forcing function to notice.',
    whySeverity: 'Was rated LOW — the key only grants read access to public weather data — but rotation hygiene was still worth fixing.',
    whyStillOpen: '',
    fixRequires: '',
    mitigationNow: '',
    blockedBy: null,
  },
]

export function securityPosture(findings: SecurityFinding[]): { level: 'green' | 'amber' | 'red'; openCount: number; highCount: number } {
  const open = findings.filter((f) => f.status === 'open')
  const highCount = open.filter((f) => f.severity === 'high').length
  const level: 'green' | 'amber' | 'red' = highCount > 0 ? 'amber' : 'green'
  return { level, openCount: open.length, highCount }
}

export type ExposureRole = 'coordinator' | 'medic' | 'guide' | 'observer' | 'auditor' | 'system'
export type AccessLevel = 'rw' | 'rw-own' | 'rw-team' | 'r' | 'r-team' | 'w-auto' | 'none'

export const ACCESS_MATRIX_TABS: TabId[] = ['identity', 'meaning', 'detection', 'prediction', 'exposure', 'revision', 'trust']
export const ACCESS_MATRIX: Record<ExposureRole, Partial<Record<TabId, AccessLevel>>> = {
  coordinator: { identity: 'rw', meaning: 'rw', detection: 'rw', prediction: 'rw', exposure: 'rw', revision: 'rw', trust: 'r' },
  medic: { identity: 'r', meaning: 'r', detection: 'rw', prediction: 'rw', exposure: 'rw', revision: 'rw-own', trust: 'r' },
  guide: { identity: 'r-team', meaning: 'r', detection: 'r-team', prediction: 'r-team', exposure: 'r-team', revision: 'rw-team', trust: 'r' },
  observer: { identity: 'r', meaning: 'r', detection: 'r', prediction: 'r', exposure: 'r', revision: 'r', trust: 'r' },
  auditor: { identity: 'r', meaning: 'r', detection: 'r', prediction: 'r', exposure: 'r', revision: 'r', trust: 'r' },
  system: { revision: 'w-auto' },
}
export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = { rw: 'R/W', 'rw-own': 'R/W own', 'rw-team': 'R/W team', r: 'R', 'r-team': 'R team', 'w-auto': 'W auto', none: '—' }

export interface DataClassResidency {
  dataClass: string
  primaryRegion: string
  backupRegion: string
  encryptedAtRest: boolean
  encryptedInTransit: boolean
  note: string
}

export const DATA_RESIDENCY: DataClassResidency[] = [
  { dataClass: 'Radio logs', primaryRegion: 'Local edge node, Base Camp', backupRegion: 'ap-south-1, synced every 15 min when connectivity allows', encryptedAtRest: true, encryptedInTransit: true, note: 'Held locally first because satellite uplink is intermittent above Base Camp — the edge node is the durable copy until sync succeeds.' },
  { dataClass: 'PII — name, date of birth, permit ID', primaryRegion: 'ap-south-1', backupRegion: 'ap-southeast-1', encryptedAtRest: true, encryptedInTransit: true, note: 'AES-256 at rest, TLS 1.3 in transit.' },
  { dataClass: 'Health — oxygen, heart rate, cognitive indices', primaryRegion: 'ap-south-1', backupRegion: 'ap-southeast-1', encryptedAtRest: true, encryptedInTransit: true, note: 'Same encryption as PII; access additionally logged per S9.5b.' },
  { dataClass: 'Location and behavioural data', primaryRegion: 'ap-south-1', backupRegion: 'ap-southeast-1', encryptedAtRest: true, encryptedInTransit: true, note: 'Includes GPS tracker readings and rope-partner proximity.' },
]

export const KEY_MANAGEMENT = {
  provider: 'Cloud KMS, envelope encryption per data class',
  rotationPeriodDays: 90,
  lastRotation: '2026-06-15',
  accessThreshold: 'Two-person approval required for any key access outside automated encrypt/decrypt calls — no single engineer can access a raw key.',
}

export interface DataFlowStep {
  id: string
  label: string
  encryption: 'in-transit-tls' | 'at-rest-encrypted' | 'both' | 'none'
  dataClassification: string
}
export const DATA_FLOW: DataFlowStep[] = [
  { id: 'sources', label: 'Sources (6 connectors)', encryption: 'in-transit-tls', dataClassification: 'Raw operational' },
  { id: 'ingestion', label: 'Ingestion', encryption: 'both', dataClassification: 'Raw, source-tagged' },
  { id: 'processing', label: 'Processing (Entity Resolution → Reasoning)', encryption: 'both', dataClassification: 'Resolved / derived' },
  { id: 'storage', label: 'Storage (graph + audit chain)', encryption: 'at-rest-encrypted', dataClassification: 'PII, health, location' },
  { id: 'api', label: 'API (GraphQL + subscriptions)', encryption: 'in-transit-tls', dataClassification: 'Role-filtered' },
  { id: 'consumers', label: 'Consumers (operators, agents)', encryption: 'in-transit-tls', dataClassification: 'Role-filtered' },
]

export const AUDIT_LOGGING_SAMPLE = '2026-08-09T11:42:07Z | who: R. Gurung (medic) | what: READ | resource: identity-record:climber-12 | from: 10.4.2.18 (Base Camp edge) | result: 200 OK'

export interface IncidentResponseStep {
  n: number
  step: string
}
export const INCIDENT_RESPONSE_STEPS: IncidentResponseStep[] = [
  { n: 1, step: 'Detect — automated alert or manual report' },
  { n: 2, step: 'Contain — isolate the affected component or revoke the affected credential' },
  { n: 3, step: 'Assess — determine scope, affected data classes and affected people' },
  { n: 4, step: 'Notify — internal stakeholders immediately, affected parties and regulators per applicable timelines' },
  { n: 5, step: 'Remediate and record — fix, verify, and write the incident to Trust → Breach History' },
]
export const LAST_INCIDENT_DRILL = '2026-06-01'

export interface DependencyEntry {
  name: string
  version: string
  licence: string
  lastScan: string
  knownCves: number
  updateStatus: 'current' | 'update-available' | 'update-recommended'
}
export const DEPENDENCIES: DependencyEntry[] = [
  { name: 'react', version: '19.1.0', licence: 'MIT', lastScan: '2026-08-05', knownCves: 0, updateStatus: 'current' },
  { name: 'react-router-dom', version: '7.6.0', licence: 'MIT', lastScan: '2026-08-05', knownCves: 0, updateStatus: 'current' },
  { name: 'vite', version: '6.3.1', licence: 'MIT', lastScan: '2026-08-05', knownCves: 0, updateStatus: 'update-available' },
  { name: 'vitest', version: '4.1.10', licence: 'MIT', lastScan: '2026-08-05', knownCves: 0, updateStatus: 'current' },
  { name: 'oxlint', version: '0.15.0', licence: 'MIT', lastScan: '2026-08-05', knownCves: 0, updateStatus: 'current' },
  { name: 'graphql (agent interface, planned)', version: '16.9.0', licence: 'MIT', lastScan: '2026-07-22', knownCves: 1, updateStatus: 'update-recommended' },
]

export const SECRET_MANAGEMENT = {
  where: 'Cloud secrets manager, injected as environment variables at deploy time',
  rotationCadence: '90 days, or immediately on suspected exposure',
  lastRotation: '2026-06-15',
  noSecretsInCode: true,
  note: 'No secrets in code, and the SEC-006 near-closure below is what that policy is enforcing against.',
}

export interface NetworkSegment {
  segment: string
  contains: string
  exposedPublicly: boolean
  crossesInto: string[]
}
export const NETWORK_SEGMENTATION: NetworkSegment[] = [
  { segment: 'Public edge', contains: 'API gateway, GraphQL endpoint, webhook receivers', exposedPublicly: true, crossesInto: ['Application tier (auth-checked only)'] },
  { segment: 'Application tier', contains: 'Reasoning engine, detection engine, prediction service', exposedPublicly: false, crossesInto: ['Data tier'] },
  { segment: 'Data tier', contains: 'Graph store, audit chain, backups', exposedPublicly: false, crossesInto: [] },
  { segment: 'Edge nodes (Base Camp, etc.)', contains: 'Local radio-log buffer', exposedPublicly: false, crossesInto: ['Public edge, via scheduled sync only'] },
]

export interface ComplianceItem {
  item: string
  status: string
}
export const COMPLIANCE: ComplianceItem[] = [
  { item: 'Data minimisation', status: 'Enforced at connector level — only fields a bound context rule reads are retained past ingestion; see SEC-011 for the one known exception.' },
  { item: 'Retention', status: '7 years for the audit chain (expedition protocol); 30 days for radio logs per policy (SEC-011 tracks a live gap); PII retained for the expedition duration plus 1 year.' },
  { item: 'Deletion method', status: 'Cryptographic erasure (key destruction) for encrypted-at-rest data classes, followed by storage-level overwrite confirmation.' },
  { item: 'DPO contact', status: 'dpo@isildur.example (placeholder)' },
]

export interface StaticDynamicScanResult {
  kind: 'static' | 'dynamic' | 'dependency'
  tool: string
  lastRun: string
  findings: number
}
export const TEST_RESULTS_SECURITY: StaticDynamicScanResult[] = [
  { kind: 'static', tool: 'oxlint + check-confidence-casts.mjs', lastRun: '2026-08-09', findings: 0 },
  { kind: 'dynamic', tool: 'DAST scan against staging', lastRun: '2026-07-28', findings: 2 },
  { kind: 'dependency', tool: 'Dependency CVE scan', lastRun: '2026-08-05', findings: 1 },
]

export interface BreachHistoryEntry {
  date: string
  kind: 'confirmed-breach' | 'near-miss'
  summary: string
  rootCause: string
  remediation: string
  detectedWithinMinutes: number | null
}
export const BREACH_HISTORY: BreachHistoryEntry[] = [
  {
    date: '2026-03-22',
    kind: 'near-miss',
    summary: 'An API key for the weather feed connector was committed to a test repository during a debugging session.',
    rootCause: 'A developer copied a local .env file into a scratch test fixture and committed it without reviewing the diff.',
    remediation: 'Key revoked and rotated within 4 minutes of the automated secret-scan alert firing on the push. A pre-commit secret scanner was added to block this specific pattern going forward.',
    detectedWithinMinutes: 4,
  },
]

// -- Quality --------------------------------------------------------------

export interface TestHealth {
  total: number
  passing: number
  failing: number
  quarantinedFlaky: number
  lastFullRunAt: string
  lastFullRunDurationSec: number
  ciStatusOnMain: 'green' | 'amber' | 'red'
  lastFailureOnMain: { at: string; fixedAfterMinutes: number } | null
}
export const TEST_HEALTH: TestHealth = {
  total: 239,
  passing: 239,
  failing: 0,
  quarantinedFlaky: 41,
  lastFullRunAt: '2026-08-09T09:14:00Z',
  lastFullRunDurationSec: 12,
  ciStatusOnMain: 'green',
  lastFailureOnMain: { at: '2026-07-30T16:02:00Z', fixedAfterMinutes: 38 },
}

export type CoverageStatus = 'good' | 'amber' | 'red'
export interface CoverageAreaRow {
  area: string
  tests: number
  coveragePct: number
  trend: 'up' | 'down' | 'flat'
}
function coverageStatus(pct: number): CoverageStatus {
  if (pct < 60) return 'red'
  if (pct < 80) return 'amber'
  return 'good'
}
export const COVERAGE_BY_AREA: CoverageAreaRow[] = [
  { area: 'Identity', tests: 34, coveragePct: 88, trend: 'flat' },
  { area: 'Meaning', tests: 18, coveragePct: 82, trend: 'up' },
  { area: 'Detection', tests: 22, coveragePct: 85, trend: 'flat' },
  { area: 'Prediction', tests: 12, coveragePct: 79, trend: 'down' },
  { area: 'Exposure', tests: 11, coveragePct: 71, trend: 'up' },
  { area: 'Revision', tests: 14, coveragePct: 84, trend: 'flat' },
  { area: 'Trust', tests: 9, coveragePct: 52, trend: 'down' },
  { area: 'API (planned schema)', tests: 0, coveragePct: 0, trend: 'flat' },
  { area: 'Store and folds', tests: 22, coveragePct: 91, trend: 'up' },
  { area: 'UI components', tests: 8, coveragePct: 61, trend: 'down' },
]
export function coverageAreaStatus(row: CoverageAreaRow): CoverageStatus {
  return coverageStatus(row.coveragePct)
}

export type ProductQuestionStatus = 'answered' | 'partial'
export interface ProductQuestion {
  id: string
  question: string
  status: ProductQuestionStatus
  evidenceLabel: string
  evidenceTabId: TabId | null
}
export const PRODUCT_QUESTIONS: ProductQuestion[] = [
  { id: 'pq-1', question: 'Can we trace any conclusion back to its raw inputs?', status: 'answered', evidenceLabel: 'Prediction → Cascade, Revision → Record', evidenceTabId: 'prediction' },
  { id: 'pq-2', question: 'Can we reproduce any prediction from the same inputs?', status: 'answered', evidenceLabel: 'Prediction → Forecast, counterfactual()', evidenceTabId: 'prediction' },
  { id: 'pq-3', question: 'Can we prove the model has not been tampered with?', status: 'answered', evidenceLabel: 'Revision → Record, seal verification', evidenceTabId: 'revision' },
  { id: 'pq-4', question: 'Can we show when a human overruled ASE and who was right?', status: 'answered', evidenceLabel: 'Revision → Learning, Prediction → Calibration', evidenceTabId: 'revision' },
  { id: 'pq-5', question: 'Can we demonstrate the system works without each source?', status: 'answered', evidenceLabel: 'Exposure → Simulation', evidenceTabId: 'exposure' },
  { id: 'pq-6', question: 'Can we show what the system knew at any past moment?', status: 'answered', evidenceLabel: 'As-of scrubbing (nav bar)', evidenceTabId: null },
  { id: 'pq-7', question: 'Can we prove data is encrypted and access controlled?', status: 'answered', evidenceLabel: 'Trust → Security', evidenceTabId: 'trust' },
  { id: 'pq-8', question: 'Can we show performance stays in budget under load?', status: 'partial', evidenceLabel: 'Trust → Performance → Load Tests — one synthetic run, no sustained production load data yet', evidenceTabId: 'trust' },
  { id: 'pq-9', question: 'Can we demonstrate the model improves with feedback?', status: 'answered', evidenceLabel: 'Revision → Learning', evidenceTabId: 'revision' },
  { id: 'pq-10', question: 'Can we swap the model for another domain and prove it works?', status: 'partial', evidenceLabel: 'Trust → Connections → example integrations — architecture proven, no operational pilot yet', evidenceTabId: 'trust' },
]

export interface FlakyTest {
  id: string
  test: string
  area: string
  failureRatePct: number
  quarantinedSince: string
  owner: string
  plan: string
}
export const FLAKY_TESTS: FlakyTest[] = [
  { id: 'flaky-1', test: 'entity resolution: concurrent merge does not double-count', area: 'Identity', failureRatePct: 12, quarantinedSince: '2026-07-02', owner: 'S. Chen', plan: 'A real race in the merge queue when two matches resolve in the same tick — needs a mutex around the merge-apply step, not a longer timeout.' },
  { id: 'flaky-2', test: 'staleness projection stays within its stated range', area: 'Exposure', failureRatePct: 8, quarantinedSince: '2026-07-14', owner: 'R. Gurung', plan: 'Timing dependency on Date.now() inside the projection — needs clock injection so the test controls elapsed time instead of racing the real clock.' },
  { id: 'flaky-3', test: 'node-graph drag settles at the dropped position', area: 'UI components', failureRatePct: 15, quarantinedSince: '2026-06-28', owner: 'S. Chen', plan: 'An animation-frame issue on slow CI runners — the settle check reads position before the last rAF commits; needs to wait on a real settle event, not a fixed delay.' },
  { id: 'flaky-4', test: 'subscription reconnect resumes at the correct sequence number', area: 'API (planned schema)', failureRatePct: 6, quarantinedSince: '2026-08-01', owner: 'S. Chen', plan: 'Depends on the mock socket\'s close timing, which isn\'t deterministic yet — needs a fake timer instead of a real setTimeout in the mock.' },
]
export const FLAKY_QUARANTINE_POLICY = 'A test is quarantined after 5 flaky failures in 7 days. It still runs but does not block CI. The owner has 14 days to fix it or it is deleted.'
export const FLAKY_TOTAL_COUNT = 41

export interface TestPyramidRow {
  layer: 'unit' | 'integration' | 'e2e'
  count: number
  passRatePct: number
}
export const TEST_PYRAMID: TestPyramidRow[] = [
  { layer: 'unit', count: 198, passRatePct: 100 },
  { layer: 'integration', count: 34, passRatePct: 100 },
  { layer: 'e2e', count: 7, passRatePct: 86 },
]

export interface EnvironmentRow {
  env: 'local' | 'CI' | 'staging' | 'production (read-only)'
  lastRun: string
  result: 'pass' | 'fail'
}
export const ENVIRONMENTS: EnvironmentRow[] = [
  { env: 'local', lastRun: '2026-08-09T09:14:00Z', result: 'pass' },
  { env: 'CI', lastRun: '2026-08-09T09:20:00Z', result: 'pass' },
  { env: 'staging', lastRun: '2026-08-08T22:00:00Z', result: 'pass' },
  { env: 'production (read-only)', lastRun: '2026-08-09T06:00:00Z', result: 'pass' },
]

export interface PipelineStageHealth {
  stage: 'lint' | 'unit' | 'integration' | 'e2e' | 'security scan' | 'budget check' | 'deploy'
  status: 'green' | 'amber' | 'red'
}
export const PIPELINE_HEALTH: PipelineStageHealth[] = [
  { stage: 'lint', status: 'green' },
  { stage: 'unit', status: 'green' },
  { stage: 'integration', status: 'green' },
  { stage: 'e2e', status: 'amber' },
  { stage: 'security scan', status: 'amber' },
  { stage: 'budget check', status: 'green' },
  { stage: 'deploy', status: 'green' },
]

export const REGRESSION_SUITE_NAMES = [
  'Every TracedValue has walkable provenance (no dangling refs)',
  'Confidence casts only occur in folds.ts',
  'Conflict resolution keeps both inputs in the graph',
  'Audit chain seal verification detects tampering',
  'Source split integrity (8 sources, 6 named for Exposure)',
]

export interface TestDebtEntry {
  month: string
  quarantinedTestDays: number
  newlyQuarantined: number
  fixedOrDeleted: number
}
export const TEST_DEBT_TREND: TestDebtEntry[] = [
  { month: '2026-05', quarantinedTestDays: 310, newlyQuarantined: 4, fixedOrDeleted: 1 },
  { month: '2026-06', quarantinedTestDays: 402, newlyQuarantined: 3, fixedOrDeleted: 2 },
  { month: '2026-07', quarantinedTestDays: 489, newlyQuarantined: 2, fixedOrDeleted: 1 },
]
export const PROPERTY_TEST_COUNT = 6
export const MUTATION_SCORE = { scorePct: 71, survivingMutants: 19 }

// -- Connections ------------------------------------------------------------

export interface GraphQLField {
  name: string
  type: string
  resolver: string
  dataSource: string
  performanceBudgetMs: number
  hasAsOf?: boolean
}
export const GRAPHQL_QUERIES: GraphQLField[] = [
  { name: 'climber(id: ID!, asOf: DateTime)', type: 'Climber', resolver: 'resolveClimber', dataSource: 'Identity graph', performanceBudgetMs: 20, hasAsOf: true },
  { name: 'climbers(filter: ClimberFilter, asOf: DateTime)', type: '[Climber!]!', resolver: 'resolveClimbers', dataSource: 'Identity graph', performanceBudgetMs: 80, hasAsOf: true },
  { name: 'prediction(climberId: ID!, asOf: DateTime)', type: 'Prediction', resolver: 'resolvePrediction', dataSource: 'Prediction engine', performanceBudgetMs: 40, hasAsOf: true },
  { name: 'predictions(status: PredictionStatus, asOf: DateTime)', type: '[Prediction!]!', resolver: 'resolvePredictions', dataSource: 'Prediction engine', performanceBudgetMs: 100, hasAsOf: true },
  { name: 'source(id: ID!)', type: 'Source', resolver: 'resolveSource', dataSource: 'Source registry', performanceBudgetMs: 10 },
  { name: 'sources(status: SourceStatus)', type: '[Source!]!', resolver: 'resolveSources', dataSource: 'Source registry', performanceBudgetMs: 15 },
  { name: 'conclusion(id: ID!, asOf: DateTime)', type: 'Conclusion', resolver: 'resolveConclusion', dataSource: 'Graph store, folds.ts', performanceBudgetMs: 20, hasAsOf: true },
  { name: 'queueItems(status: QueueStatus)', type: '[QueueItem!]!', resolver: 'resolveQueueItems', dataSource: 'Revision queue', performanceBudgetMs: 30 },
  { name: 'auditChain(from: DateTime!, to: DateTime!)', type: '[AuditEntry!]!', resolver: 'resolveAuditChain', dataSource: 'Audit chain', performanceBudgetMs: 120 },
  { name: 'asOfState(at: DateTime!)', type: 'AsOfState', resolver: 'resolveAsOfState', dataSource: 'Bitemporal store', performanceBudgetMs: 150 },
]
export const GRAPHQL_MUTATIONS: GraphQLField[] = [
  { name: 'acknowledgeQueueItem(id: ID!)', type: 'QueueItem', resolver: 'mutateAcknowledge', dataSource: 'Revision queue', performanceBudgetMs: 30 },
  { name: 'overridePrediction(id: ID!, reason: OverruleReason!, note: String)', type: 'Prediction', resolver: 'mutateOverride', dataSource: 'Prediction engine, audit chain', performanceBudgetMs: 50 },
  { name: 'simulateSourceOutage(sourceId: ID!)', type: 'SimulationScenario', resolver: 'mutateSimulate', dataSource: 'Exposure engine (read-only compute)', performanceBudgetMs: 60 },
  { name: 'restoreSource(sourceId: ID!)', type: 'Source', resolver: 'mutateRestore', dataSource: 'Source registry', performanceBudgetMs: 20 },
  { name: 'adjustConfidenceFloor(className: ConclusionClass!, pct: Int!)', type: 'ConfidenceFloor', resolver: 'mutateFloor', dataSource: 'Exposure engine', performanceBudgetMs: 15 },
]
export const GRAPHQL_SUBSCRIPTIONS: GraphQLField[] = [
  { name: 'predictionUpdated(climberId: ID)', type: 'Prediction', resolver: 'subscribePrediction', dataSource: 'Prediction engine', performanceBudgetMs: 500 },
  { name: 'sourceStatusChanged', type: 'Source', resolver: 'subscribeSourceStatus', dataSource: 'Source registry', performanceBudgetMs: 500 },
  { name: 'queueItemAdded', type: 'QueueItem', resolver: 'subscribeQueueAdded', dataSource: 'Revision queue', performanceBudgetMs: 500 },
  { name: 'alert(severity: Severity)', type: 'Alert', resolver: 'subscribeAlert', dataSource: 'Detection + Exposure engines', performanceBudgetMs: 500 },
]
export const GRAPHQL_SCHEMA_VERSION = 'v2.3.0'
export const GRAPHQL_LAST_BREAKING_CHANGE = '2026-05-14 — Prediction.likelihood renamed to Prediction.likelihoodPct (see Breaking Changes)'
export const GRAPHQL_EXAMPLE_QUERY = `query HeroPrediction {
  prediction(climberId: "climber-2", asOf: null) {
    name
    serial
    likelihoodPct
    withinHours
    drivers { label weightPct }
  }
}`
export const GRAPHQL_EXAMPLE_RESPONSE = `{
  "data": {
    "prediction": {
      "name": "Nima Tamang",
      "serial": "NP-4412",
      "likelihoodPct": 68,
      "withinHours": 6,
      "drivers": [
        { "label": "Oxygen recovery vs. own baseline", "weightPct": 34 },
        { "label": "Wind exposure above 70kph", "weightPct": 21 }
      ]
    }
  }
}`

export const LIVE_UPDATE_CONTRACT = {
  endpoint: 'wss://api.isildur.example/v1/subscriptions',
  authMethod: 'Bearer token, same as REST/GraphQL',
  tokenLifetimeMinutes: 120,
  heartbeatIntervalSec: 15,
  reconnectionStrategy: 'Exponential backoff, 1s → 30s cap, with a resume token carrying the last-seen sequence number',
  envelope: { type: 'string — the event name', payload: 'object — event-specific', timestamp: 'ISO 8601', sequence: 'monotonic integer per connection' },
  guarantees: [
    'Messages ordered by sequence within one connection.',
    'A detected gap in sequence triggers a client replay request rather than silently skipping.',
    'At-least-once delivery — handlers must be idempotent.',
    'Maximum latency budget: 500ms; measured p99 currently 340ms.',
  ],
}

export const AGENT_INTERFACE = {
  healthCheck: 'GET /agent/health → { status, sourcesReachable, lastGraphWrite }',
  bulkQuery: 'POST /agent/bulk-query — rate limit 60/min, timeout 10s',
  webhookRegistration: 'POST /agent/webhooks — HMAC-SHA256 signed payloads, secret rotated with the standard 90-day cadence',
  schemaIntrospectionEndpoint: 'GET /agent/schema — a static snapshot, for when live introspection is disabled (see SEC-008)',
}

export const VERSIONING = {
  current: 'v2.3.0',
  policy: 'Breaking changes only in a major version bump.',
  deprecationNoticePeriodDays: 90,
  supportedVersions: [
    { version: 'v2.x', status: 'supported', until: 'current' },
    { version: 'v1.x', status: 'deprecated', until: '2026-12-31' },
  ],
}

export interface RateLimitRow {
  scope: string
  limit: string
  burst: string
}
export const RATE_LIMITS: RateLimitRow[] = [
  { scope: 'Per API key, queries', limit: '600/min', burst: '50 in a 1s window' },
  { scope: 'Per API key, mutations', limit: '60/min', burst: '10 in a 1s window' },
  { scope: 'Per agent, bulk query', limit: '60/min', burst: '5 concurrent' },
]
export const RATE_LIMIT_HEADERS = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']

export interface AuthMethodRow {
  method: string
  usedFor: string
  status: 'active' | 'roadmap'
}
export const AUTH_METHODS: AuthMethodRow[] = [
  { method: 'Bearer tokens', usedFor: 'Operators (coordinator/medic/guide)', status: 'active' },
  { method: 'API keys', usedFor: 'Agents and integrations', status: 'active' },
  { method: 'Mutual TLS', usedFor: 'Internal service-to-service calls', status: 'active' },
  { method: 'Enterprise SSO (SAML/OIDC)', usedFor: 'Operator organisations', status: 'roadmap' },
]

export interface WebhookCatalogEntry {
  event: string
  payloadSchema: string
  deliveryGuarantee: string
  retryPolicy: string
  example: string
}
export const WEBHOOK_CATALOG: WebhookCatalogEntry[] = [
  { event: 'queue_item.added', payloadSchema: '{ id, kind, priority, fromTab, about }', deliveryGuarantee: 'at-least-once', retryPolicy: 'exponential backoff, 5 attempts over 15 minutes', example: '{"event":"queue_item.added","id":"queue-...","priority":"critical"}' },
  { event: 'prediction.updated', payloadSchema: '{ climberId, likelihoodPct, withinHours }', deliveryGuarantee: 'at-least-once', retryPolicy: 'exponential backoff, 5 attempts over 15 minutes', example: '{"event":"prediction.updated","climberId":"climber-2","likelihoodPct":68}' },
  { event: 'source.status_changed', payloadSchema: '{ sourceId, status, healthPct }', deliveryGuarantee: 'at-least-once', retryPolicy: 'exponential backoff, 5 attempts over 15 minutes', example: '{"event":"source.status_changed","sourceId":"weather-feed","status":"critical"}' },
]

export const STREAMING = { topic: 'ase.conclusions.v1', schemaFormat: 'Avro, schema-registry backed', retentionDays: 14, partitioning: 'by climberId hash, 12 partitions' }

export interface SdkRow {
  language: string
  version: string
  coveragePct: number
  installCommand: string
}
export const SDKS: SdkRow[] = [
  { language: 'TypeScript', version: '2.3.0', coveragePct: 100, installCommand: 'npm install @isildur/ase-sdk' },
  { language: 'Python', version: '2.1.0', coveragePct: 90, installCommand: 'pip install isildur-ase' },
  { language: 'Go', version: '1.4.0', coveragePct: 65, installCommand: 'go get github.com/isildur/ase-go' },
]

export interface BreakingChangeEntry {
  version: string
  date: string
  change: string
  migration: string
  consumersAffected: number
}
export const BREAKING_CHANGES: BreakingChangeEntry[] = [
  { version: 'v2.3.0', date: '2026-05-14', change: 'Prediction.likelihood renamed to Prediction.likelihoodPct', migration: 'Rename the field in queries; the old name returns a deprecation warning header through v2.3.x, removed in v3.', consumersAffected: 4 },
  { version: 'v2.0.0', date: '2026-01-20', change: 'Source.reliability changed from a 0-1 float to reliabilityPct, a 0-100 integer', migration: 'Multiply existing 0-1 consumers by 100 or switch to the new field name.', consumersAffected: 7 },
]

export const HEALTH_ENDPOINTS = {
  liveness: 'GET /health/live → 200 if the process is running',
  readiness: 'GET /health/ready → 200 if the process can serve traffic',
  deep: 'GET /health/deep → checks every one of the 6 named sources is reachable, returns per-source status',
}

export interface ExampleIntegration {
  domain: string
  sameSchema: boolean
  changedFrom: string
  changes: { field: string; expedition: string; thisDomain: string }[]
}
export const EXAMPLE_INTEGRATIONS: ExampleIntegration[] = [
  {
    domain: 'Mining',
    sameSchema: true,
    changedFrom: 'Expedition safety',
    changes: [
      { field: 'Entity', expedition: 'Climber', thisDomain: 'Miner / shift worker' },
      { field: 'Source: wearable sensor', expedition: 'Wearable oximeter (SpO2)', thisDomain: 'Wearable gas detector (CO/CH4 ppm)' },
      { field: 'Source: position', expedition: 'GPS tracker', thisDomain: 'Underground beacon triangulation' },
      { field: 'Detection rule', expedition: 'Low blood oxygen', thisDomain: 'Gas concentration above threshold' },
      { field: 'Prediction model', expedition: 'Requires-descent forecaster', thisDomain: 'Requires-evacuation forecaster' },
      { field: 'Engine (folds, derivation kinds, confidence formulas)', expedition: 'unchanged', thisDomain: 'unchanged' },
    ],
  },
  {
    domain: 'Logistics',
    sameSchema: true,
    changedFrom: 'Expedition safety',
    changes: [
      { field: 'Entity', expedition: 'Climber', thisDomain: 'Shipment' },
      { field: 'Source: wearable sensor', expedition: 'Wearable oximeter (SpO2)', thisDomain: 'Cold-chain temperature sensor' },
      { field: 'Source: position', expedition: 'GPS tracker', thisDomain: 'Fleet GPS tracker (same connector type)' },
      { field: 'Detection rule', expedition: 'Low blood oxygen', thisDomain: 'Temperature excursion above threshold' },
      { field: 'Prediction model', expedition: 'Requires-descent forecaster', thisDomain: 'Spoilage-risk forecaster' },
      { field: 'Engine (folds, derivation kinds, confidence formulas)', expedition: 'unchanged', thisDomain: 'unchanged' },
    ],
  },
]

// -- Performance --------------------------------------------------------

export interface PerformanceBudget {
  id: string
  budget: string
  targetLabel: string
  p50: string
  p99: string
  status: 'within' | 'watch' | 'over'
  lastViolation: string
}
export const PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  { id: 'fold-7hop', budget: 'Fold of a 7-hop chain', targetLabel: 'under 5 ms', p50: '1.2 ms', p99: '4.1 ms', status: 'within', lastViolation: '2026-07-19 — 6.8ms during a 200-climber synthetic load test' },
  { id: 'counterfactual', budget: 'Counterfactual compute', targetLabel: 'under 40 ms', p50: '9 ms', p99: '31 ms', status: 'within', lastViolation: 'Never' },
  { id: 'tab-switch', budget: 'Tab switch', targetLabel: 'under 150 ms', p50: '48 ms', p99: '162 ms', status: 'watch', lastViolation: '2026-08-02 — 210ms switching into Exposure with Matrix pre-computed' },
  { id: 'asof-rerender', budget: 'As-of re-render', targetLabel: 'under 400 ms', p50: '110 ms', p99: '380 ms', status: 'within', lastViolation: '2026-06-30 — 512ms scrubbing across a 24h window with the palette open' },
  { id: 'initial-load', budget: 'Initial load', targetLabel: 'under 2 s', p50: '1.4 s', p99: '2.3 s', status: 'watch', lastViolation: '2026-08-01 — 2.6s on a throttled 3G profile' },
  { id: 'virtual-scroll', budget: 'Virtual scroll, 1000 rows', targetLabel: 'under 16 ms/frame', p50: '9 ms', p99: '15 ms', status: 'within', lastViolation: 'Never' },
  { id: 'subscription-latency', budget: 'Subscription latency', targetLabel: 'under 500 ms', p50: '180 ms', p99: '340 ms', status: 'within', lastViolation: 'Never' },
  { id: 'api-p99', budget: 'API response p99', targetLabel: 'under 200 ms', p50: '38 ms', p99: '188 ms', status: 'within', lastViolation: '2026-07-05 — 240ms on auditChain over a 90-day range' },
  { id: 'bundle', budget: 'Initial bundle', targetLabel: 'under 250 KB', p50: '—', p99: '238 KB', status: 'within', lastViolation: '2026-05-14 — 267KB before the GraphQL client was code-split out' },
  { id: 'memory-per-tab', budget: 'Memory per tab', targetLabel: 'under 64 MB', p50: '41 MB', p99: '58 MB', status: 'within', lastViolation: 'Never' },
]

export const PERFORMANCE_ARCHITECTURE = {
  memoisation: 'Fold results memoised on (TracedId, asOf), invalidated wholesale on graphVersion() bump (any register/supersede/clearRegistry). Cache size ~4,200 entries at steady state, no TTL, measured hit rate 94% over a typical tab session.',
  timers: 'One animation loop and one interval set, both owned by the store (the 5s live tick in store.tsx). No component-level setInterval/requestAnimationFrame.',
  virtualization: 'Any table over 100 rows virtualises (EvidenceTable); each tab subscribes to its own store slice; an unmounted tab\'s slice is frozen rather than destroyed, so remount is instant.',
  debounce: 'Scrubbing: 80ms. Search: 150ms. Filters: 100ms.',
  profiling: 'React Profiler enabled in staging only, 10% sampling. Custom performance.mark/measure pairs emitted around every fold call and every counterfactual call.',
}

export interface LiveDashboardMetric {
  metric: string
  current: string
}
export const LIVE_DASHBOARD: LiveDashboardMetric[] = [
  { metric: 'Fold latency (p50/p99)', current: '1.2ms / 4.1ms' },
  { metric: 'Counterfactual latency (p50/p99)', current: '9ms / 31ms' },
  { metric: 'Tab switch (p50/p99)', current: '48ms / 162ms' },
  { metric: 'Memory (current tab)', current: '46 MB' },
  { metric: 'Bundle (initial)', current: '238 KB' },
]

export interface BudgetViolationLogEntry {
  id: string
  budgetId: string
  at: string
  measuredValue: string
  raisedQueueItem: boolean
}
export const BUDGET_VIOLATIONS_LOG: BudgetViolationLogEntry[] = [
  { id: 'viol-1', budgetId: 'tab-switch', at: '2026-08-02T14:12:00Z', measuredValue: '210ms', raisedQueueItem: true },
  { id: 'viol-2', budgetId: 'initial-load', at: '2026-08-01T08:40:00Z', measuredValue: '2.6s', raisedQueueItem: true },
]

export interface RegressionDetectionEntry {
  metric: string
  changePct: number
  direction: 'up' | 'down'
  sinceRelease: string
  commitRange: string
  likelyCause: string
}
export const REGRESSION_DETECTION: RegressionDetectionEntry[] = [
  { metric: 'Tab switch (p99)', changePct: 18, direction: 'up', sinceRelease: 'v2.3.0', commitRange: 'a1b2c3d..e4f5g6h', likelyCause: 'Exposure\'s Matrix panel computing all 6 rows eagerly on mount instead of on first view' },
]

export interface LoadTestRun {
  id: string
  concurrentOperators: number
  activePredictions: number
  sources: number
  peakMemoryMb: number
  peakCpuPct: number
  budgetsHeld: boolean
  note: string
}
export const LOAD_TESTS: LoadTestRun[] = [
  { id: 'load-1', concurrentOperators: 25, activePredictions: 9, sources: 6, peakMemoryMb: 210, peakCpuPct: 62, budgetsHeld: true, note: 'Synthetic run, single instance — see Known Limitations for the production-scale gap.' },
]

export interface BundleBreakdownEntry {
  name: string
  sizeKb: number
}
export const BUNDLE_TOTAL_KB = 238
export const BUNDLE_BY_DEPENDENCY: BundleBreakdownEntry[] = [
  { name: 'react + react-dom', sizeKb: 132 },
  { name: 'react-router-dom', sizeKb: 34 },
  { name: 'app code (ase/*, components/*)', sizeKb: 58 },
  { name: 'other', sizeKb: 14 },
]
export const BUNDLE_BY_TAB: BundleBreakdownEntry[] = [
  { name: 'Shared shell (nav, inspector, tokens)', sizeKb: 46 },
  { name: 'Identity', sizeKb: 22 },
  { name: 'Detection', sizeKb: 28 },
  { name: 'Prediction', sizeKb: 24 },
  { name: 'Exposure', sizeKb: 21 },
  { name: 'Revision', sizeKb: 19 },
  { name: 'Trust', sizeKb: 26 },
  { name: 'Other tabs', sizeKb: 52 },
]

// -- Known Limitations ----------------------------------------------------

export interface KnownLimitation {
  id: string
  text: string
  linkLabel: string
  linkTabId: TabId | null
}
export const KNOWN_LIMITATIONS: KnownLimitation[] = [
  { id: 'lim-1', text: 'Cognitive state is inferred, not measured. We do not read minds. We infer decision-making risk from behaviour.', linkLabel: 'Prediction → Cognitive state', linkTabId: 'prediction' },
  { id: 'lim-2', text: 'Single-source conclusions are fragile. We flag them, but we cannot always corroborate in time.', linkLabel: 'Exposure → Fragility', linkTabId: 'exposure' },
  { id: 'lim-3', text: 'Below 200 resolved predictions, calibration is advisory. Early in an expedition, treat likelihoods as directional rather than precise.', linkLabel: 'Prediction → Calibration', linkTabId: 'prediction' },
  { id: 'lim-4', text: 'Model transfer to other domains is proven in principle, not in production. The architecture supports it. We have no operational history there.', linkLabel: 'Trust → Connections → example integrations', linkTabId: 'trust' },
  { id: 'lim-5', text: 'GraphQL introspection is enabled, which is a known risk. It is required by the agent interface. A fix is scheduled.', linkLabel: 'Trust → Security, SEC-008', linkTabId: 'trust' },
  { id: 'lim-6', text: 'Coverage in Exposure and UI components is below 80%, and 41 tests are quarantined. This is technical debt and we are aware of it.', linkLabel: 'Trust → Quality', linkTabId: 'trust' },
]

// -- Roadmap, versions, support -------------------------------------------

export interface RoadmapQuarter {
  quarter: string
  focus: string
  deliverables: string[]
}
export const ROADMAP: RoadmapQuarter[] = [
  { quarter: '2026 Q3', focus: 'Security hardening', deliverables: ['Close SEC-008 (introspection) via the agent interface schema snapshot', 'Close SEC-017 (session timeout) via form-draft persistence', 'Ship the agent interface release'] },
  { quarter: '2026 Q4', focus: 'Quality', deliverables: ['Raise Exposure coverage above 80%', 'Raise UI component coverage above 80%', 'Cut quarantined-flaky count from 41 toward 15'] },
  { quarter: '2027 Q1', focus: 'Model expansion', deliverables: ['First operational pilot in a second domain (mining or logistics)', 'Promote Decision 4 confidence from moderate to strong on pilot data'] },
  { quarter: '2027 Q2', focus: 'Performance and compliance', deliverables: ['Sustained production load test (current gap: synthetic-only, see Known Limitations)', 'Third-party compliance audit', 'Close SEC-011 (retention) and SEC-014 (backup encryption)'] },
]

export interface VersionHistoryEntry {
  version: string
  date: string
  summary: string
  breaking: boolean
}
export const VERSION_HISTORY: VersionHistoryEntry[] = [
  { version: 'v2.3.0', date: '2026-05-14', summary: 'Prediction.likelihood renamed to likelihoodPct; Exposure tab shipped.', breaking: true },
  { version: 'v2.2.0', date: '2026-04-02', summary: 'Revision tab shipped, audit chain seal verification added.', breaking: false },
  { version: 'v2.1.0', date: '2026-02-20', summary: 'Prediction tab shipped.', breaking: false },
  { version: 'v2.0.0', date: '2026-01-20', summary: 'Source.reliability changed to reliabilityPct; Detection tab shipped.', breaking: true },
]

export const SUPPORT = {
  documentation: 'docs.isildur.example (placeholder)',
  apiReference: 'api.isildur.example/reference (placeholder)',
  statusPage: 'status.isildur.example (placeholder)',
  engineeringContact: { name: 'S. Chen', responseTime: 'within 1 business day' },
  securityContact: { name: 'Security team', responseTime: 'within 4 hours for HIGH severity reports' },
  emergencyChannel: 'expedition-critical-only pager, placeholder — not yet provisioned',
}

// -- bundle -----------------------------------------------------------------
// S9.13, same discipline as every other tab (S1g): a component reads this
// through `useDataset().dataset.trust`, never by importing ase/trust.ts's
// consts directly — so if Trust's own data ever needed to become real
// TracedValues (a security finding's status, say), only this file and
// dataset.ts would need to change, not every panel.

export interface TrustState {
  decisions: Decision[]
  securityFindings: SecurityFinding[]
  accessMatrixTabs: TabId[]
  accessMatrix: Record<ExposureRole, Partial<Record<TabId, AccessLevel>>>
  dataResidency: DataClassResidency[]
  keyManagement: typeof KEY_MANAGEMENT
  dataFlow: DataFlowStep[]
  auditLoggingSample: string
  incidentResponseSteps: IncidentResponseStep[]
  lastIncidentDrill: string
  dependencies: DependencyEntry[]
  secretManagement: typeof SECRET_MANAGEMENT
  networkSegmentation: NetworkSegment[]
  compliance: ComplianceItem[]
  testResultsSecurity: StaticDynamicScanResult[]
  breachHistory: BreachHistoryEntry[]
  testHealth: TestHealth
  coverageByArea: CoverageAreaRow[]
  productQuestions: ProductQuestion[]
  flakyTests: FlakyTest[]
  flakyQuarantinePolicy: string
  flakyTotalCount: number
  testPyramid: TestPyramidRow[]
  environments: EnvironmentRow[]
  pipelineHealth: PipelineStageHealth[]
  regressionSuiteNames: string[]
  testDebtTrend: TestDebtEntry[]
  propertyTestCount: number
  mutationScore: typeof MUTATION_SCORE
  graphqlQueries: GraphQLField[]
  graphqlMutations: GraphQLField[]
  graphqlSubscriptions: GraphQLField[]
  graphqlSchemaVersion: string
  graphqlLastBreakingChange: string
  graphqlExampleQuery: string
  graphqlExampleResponse: string
  liveUpdateContract: typeof LIVE_UPDATE_CONTRACT
  agentInterface: typeof AGENT_INTERFACE
  versioning: typeof VERSIONING
  rateLimits: RateLimitRow[]
  rateLimitHeaders: string[]
  authMethods: AuthMethodRow[]
  webhookCatalog: WebhookCatalogEntry[]
  streaming: typeof STREAMING
  sdks: SdkRow[]
  breakingChanges: BreakingChangeEntry[]
  healthEndpoints: typeof HEALTH_ENDPOINTS
  exampleIntegrations: ExampleIntegration[]
  performanceBudgets: PerformanceBudget[]
  performanceArchitecture: typeof PERFORMANCE_ARCHITECTURE
  liveDashboard: LiveDashboardMetric[]
  budgetViolationsLog: BudgetViolationLogEntry[]
  regressionDetection: RegressionDetectionEntry[]
  loadTests: LoadTestRun[]
  bundleTotalKb: number
  bundleByDependency: BundleBreakdownEntry[]
  bundleByTab: BundleBreakdownEntry[]
  knownLimitations: KnownLimitation[]
  roadmap: RoadmapQuarter[]
  versionHistory: VersionHistoryEntry[]
  support: typeof SUPPORT
}

export function buildTrustState(): TrustState {
  return {
    decisions: DECISIONS,
    securityFindings: SECURITY_FINDINGS,
    accessMatrixTabs: ACCESS_MATRIX_TABS,
    accessMatrix: ACCESS_MATRIX,
    dataResidency: DATA_RESIDENCY,
    keyManagement: KEY_MANAGEMENT,
    dataFlow: DATA_FLOW,
    auditLoggingSample: AUDIT_LOGGING_SAMPLE,
    incidentResponseSteps: INCIDENT_RESPONSE_STEPS,
    lastIncidentDrill: LAST_INCIDENT_DRILL,
    dependencies: DEPENDENCIES,
    secretManagement: SECRET_MANAGEMENT,
    networkSegmentation: NETWORK_SEGMENTATION,
    compliance: COMPLIANCE,
    testResultsSecurity: TEST_RESULTS_SECURITY,
    breachHistory: BREACH_HISTORY,
    testHealth: TEST_HEALTH,
    coverageByArea: COVERAGE_BY_AREA,
    productQuestions: PRODUCT_QUESTIONS,
    flakyTests: FLAKY_TESTS,
    flakyQuarantinePolicy: FLAKY_QUARANTINE_POLICY,
    flakyTotalCount: FLAKY_TOTAL_COUNT,
    testPyramid: TEST_PYRAMID,
    environments: ENVIRONMENTS,
    pipelineHealth: PIPELINE_HEALTH,
    regressionSuiteNames: REGRESSION_SUITE_NAMES,
    testDebtTrend: TEST_DEBT_TREND,
    propertyTestCount: PROPERTY_TEST_COUNT,
    mutationScore: MUTATION_SCORE,
    graphqlQueries: GRAPHQL_QUERIES,
    graphqlMutations: GRAPHQL_MUTATIONS,
    graphqlSubscriptions: GRAPHQL_SUBSCRIPTIONS,
    graphqlSchemaVersion: GRAPHQL_SCHEMA_VERSION,
    graphqlLastBreakingChange: GRAPHQL_LAST_BREAKING_CHANGE,
    graphqlExampleQuery: GRAPHQL_EXAMPLE_QUERY,
    graphqlExampleResponse: GRAPHQL_EXAMPLE_RESPONSE,
    liveUpdateContract: LIVE_UPDATE_CONTRACT,
    agentInterface: AGENT_INTERFACE,
    versioning: VERSIONING,
    rateLimits: RATE_LIMITS,
    rateLimitHeaders: RATE_LIMIT_HEADERS,
    authMethods: AUTH_METHODS,
    webhookCatalog: WEBHOOK_CATALOG,
    streaming: STREAMING,
    sdks: SDKS,
    breakingChanges: BREAKING_CHANGES,
    healthEndpoints: HEALTH_ENDPOINTS,
    exampleIntegrations: EXAMPLE_INTEGRATIONS,
    performanceBudgets: PERFORMANCE_BUDGETS,
    performanceArchitecture: PERFORMANCE_ARCHITECTURE,
    liveDashboard: LIVE_DASHBOARD,
    budgetViolationsLog: BUDGET_VIOLATIONS_LOG,
    regressionDetection: REGRESSION_DETECTION,
    loadTests: LOAD_TESTS,
    bundleTotalKb: BUNDLE_TOTAL_KB,
    bundleByDependency: BUNDLE_BY_DEPENDENCY,
    bundleByTab: BUNDLE_BY_TAB,
    knownLimitations: KNOWN_LIMITATIONS,
    roadmap: ROADMAP,
    versionHistory: VERSION_HISTORY,
    support: SUPPORT,
  }
}
