export type Role = 'coordinator' | 'medic' | 'guide' | 'observer'
export type ExposurePanel = 'health' | 'matrix' | 'fragility' | 'staleness' | 'simulation'
export type ExposureActionId = 'flag-for-review' | 'change-confidence-floor' | 'run-simulation' | 'request-backup-source'

export const ROLE_LABEL: Record<Role, string> = {
  coordinator: 'Coordinator',
  medic: 'Medic',
  guide: 'Guide',
  observer: 'Observer',
}

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

export function disabledReasonOnPanel(panel: ExposurePanel, role: Role, action: ExposureActionId): string {
  void panel
  return `${ROLE_LABEL[role]}s cannot do this — ${REASON[action]}.`
}
