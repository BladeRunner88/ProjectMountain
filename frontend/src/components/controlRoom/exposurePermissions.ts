// S9.12 cross-cutting: unlike Revision's one uniform role matrix (S9.11),
// Exposure's spec calls for permissions that differ BY PANEL — flagging a
// health alert for review is a routine, low-stakes call any guide can make;
// changing a confidence floor changes what every downstream tab treats as
// trustworthy, so that's coordinator-only; running an outage simulation
// rehearses a real hazard scenario and needs someone senior watching, so
// medic and coordinator only, though anyone may still WATCH one run. A
// disabled action always says why, same discipline as Revision's.

export type Role = 'coordinator' | 'medic' | 'guide' | 'observer'
export type ExposurePanel = 'health' | 'matrix' | 'fragility' | 'staleness' | 'simulation'
export type ExposureActionId = 'flag-for-review' | 'change-confidence-floor' | 'run-simulation' | 'request-backup-source'

export const ROLE_LABEL: Record<Role, string> = { coordinator: 'Coordinator', medic: 'Medic', guide: 'Guide', observer: 'Observer' }

const PANEL_MATRIX: Record<ExposurePanel, Partial<Record<ExposureActionId, Set<Role>>>> = {
  health: { 'flag-for-review': new Set(['coordinator', 'medic', 'guide']) },
  matrix: { 'flag-for-review': new Set(['coordinator', 'medic']) },
  fragility: {
    'flag-for-review': new Set(['coordinator', 'medic']),
    'request-backup-source': new Set(['coordinator']),
  },
  staleness: { 'change-confidence-floor': new Set(['coordinator']) },
  simulation: { 'run-simulation': new Set(['coordinator', 'medic']) },
}

const REASON: Record<ExposureActionId, string> = {
  'flag-for-review': 'requires at least guide',
  'change-confidence-floor': 'changes what every downstream tab treats as trustworthy — coordinator only',
  'run-simulation': 'rehearses a real hazard scenario — requires coordinator or medic',
  'request-backup-source': 'commits operations budget — coordinator only',
}

export function canDoOnPanel(panel: ExposurePanel, role: Role, action: ExposureActionId): boolean {
  return PANEL_MATRIX[panel][action]?.has(role) ?? false
}

/** Why a disabled action button is disabled — never just a greyed-out control with no explanation. */
export function disabledReasonOnPanel(panel: ExposurePanel, role: Role, action: ExposureActionId): string {
  void panel
  return `${ROLE_LABEL[role]}s cannot do this — ${REASON[action]}.`
}
