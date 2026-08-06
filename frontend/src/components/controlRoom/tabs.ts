// The eleven tabs, left to right (S1d). Stage captions map each tab to the
// ASE architecture from S0's L3 — this mapping is inferred from that stage
// list, not separately specified, and is the one part of this file most
// worth a second pair of eyes before it goes in front of a client.

export type TabId =
  | 'overview'
  | 'processing'
  | 'model'
  | 'identity'
  | 'meaning'
  | 'reasoning'
  | 'detection'
  | 'prediction'
  | 'revision'
  | 'exposure'
  | 'trust'

export interface TabDef {
  id: TabId
  label: string
  /** Dim caption after the middot in the section header — the ASE stage this tab surfaces, or a cross-cutting label for tabs that aren't one stage. */
  stage: string
  /** The one plain sentence in the section header saying what this surface shows. */
  description: string
  /** Identity and Revision only (S1d) — the two tabs where a number means something is waiting for a human. */
  hasBadge: boolean
  /** 1-9,0,- keyboard shortcut (S1d). */
  key: string
}

export const TABS: TabDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    stage: 'All stages',
    description: 'A single read on whether the pipeline is healthy and what ASE currently knows.',
    hasBadge: false,
    key: '1',
  },
  {
    id: 'processing',
    label: 'Processing',
    stage: 'Stages 1–5 · Observe & resolve',
    description: 'Live throughput and health for every connected source, end to end.',
    hasBadge: false,
    key: '2',
  },
  {
    id: 'model',
    label: 'Model',
    stage: '02 · Ontology',
    description: "The model is ASE's understanding of your world — what things exist, what facts they carry, and how they connect.",
    hasBadge: false,
    key: '3',
  },
  {
    id: 'identity',
    label: 'Identity',
    stage: '03 · Entity Resolution',
    description: 'Every person ASE has resolved, who they are, and how it worked them out.',
    hasBadge: true,
    key: '4',
  },
  {
    id: 'meaning',
    label: 'Meaning',
    stage: '04 · Context Engine',
    description: 'Your systems send numbers. ASE turns them into statements about people and places.',
    hasBadge: false,
    key: '5',
  },
  {
    id: 'reasoning',
    label: 'Reasoning',
    stage: '05 · Reasoning Engine',
    description: 'When something is wrong, ASE traces it back across every system to find why — and shows what it ruled out.',
    hasBadge: false,
    key: '6',
  },
  {
    id: 'detection',
    label: 'Detection',
    stage: '06 · Anomaly Detection',
    description: 'What ASE is watching for, what is firing right now, and on whom.',
    hasBadge: false,
    key: '7',
  },
  {
    id: 'prediction',
    label: 'Prediction',
    stage: 'Stage 8 · Pattern Learning',
    description: 'What ASE expects next, projected from the patterns it has already learned.',
    hasBadge: false,
    key: '8',
  },
  {
    id: 'revision',
    label: 'Revision',
    stage: 'Stage 12 · Human Feedback Loop',
    description: 'Corrections a person has made, and everything downstream that changed as a result.',
    hasBadge: true,
    key: '9',
  },
  {
    id: 'exposure',
    label: 'Exposure',
    stage: 'Stage 11 · Graph API',
    description: 'What ASE makes available to the rest of the business, and to whom.',
    hasBadge: false,
    key: '0',
  },
  {
    id: 'trust',
    label: 'Trust',
    stage: 'System integrity',
    description: 'Whether every figure on screen is actually traced to a source, checked live.',
    hasBadge: false,
    key: '-',
  },
]

export const DEFAULT_TAB_ID: TabId = 'overview'

export function isTabId(value: string): value is TabId {
  return TABS.some((t) => t.id === value)
}

export function tabById(id: string): TabDef | undefined {
  return TABS.find((t) => t.id === id)
}
