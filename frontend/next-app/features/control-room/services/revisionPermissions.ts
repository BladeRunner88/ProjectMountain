export type Role = 'coordinator' | 'medic' | 'guide' | 'observer'
export type RevisionActionId = 'approve' | 'reject' | 'correct' | 'annotate' | 'defer' | 'witness' | 'revert' | 'export'

export const ROLE_LABEL: Record<Role, string> = {
  coordinator: 'Coordinator',
  medic: 'Medic',
  guide: 'Guide',
  observer: 'Observer',
}

const MATRIX: Record<Role, Set<RevisionActionId>> = {
  coordinator: new Set(['approve', 'reject', 'correct', 'annotate', 'defer', 'witness', 'revert', 'export']),
  medic: new Set(['approve', 'reject', 'correct', 'annotate', 'defer', 'witness']),
  guide: new Set(['annotate', 'defer']),
  observer: new Set(),
}

const REASON: Record<RevisionActionId, string> = {
  approve: 'requires coordinator or medic',
  reject: 'requires coordinator or medic',
  correct: 'requires coordinator or medic',
  annotate: 'requires at least guide',
  defer: 'requires at least guide',
  witness: 'requires coordinator or medic',
  revert: 'model changes may only be reverted by a coordinator',
  export: 'record export requires a coordinator',
}

export function canDo(role: Role, action: RevisionActionId): boolean {
  return MATRIX[role].has(action)
}

export function disabledReason(role: Role, action: RevisionActionId): string {
  return `${ROLE_LABEL[role]}s cannot do this — ${REASON[action]}.`
}
