import { type TabId, isTabId } from '@/features/ase/types/tabs'

export type { TabId }
export { isTabId }

export const CONTROL_ROOM_BASE = '/app/control-room'

/**
 * Every Control Room tab URL, as a literal union. Narrower than next's `Route`
 * on purpose: keeping the literal shape lets callers append a query string
 * (`${tabHref('identity')}?sub=method`) and still satisfy typedRoutes.
 */
export type TabRoute = `${typeof CONTROL_ROOM_BASE}/${TabId}`

export function tabHref(id: TabId): TabRoute {
  return `${CONTROL_ROOM_BASE}/${id}`
}

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
  href: TabRoute
}

export const TABS: TabDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    stage: 'All stages',
    description: 'A single read on whether the pipeline is healthy and what ASE currently knows.',
    hasBadge: false,
    key: '1',
    href: tabHref('overview'),
  },
  {
    id: 'processing',
    label: 'Processing',
    stage: 'Stages 1–5 · Observe & resolve',
    description: 'Live throughput and health for every connected source, end to end.',
    hasBadge: false,
    key: '2',
    href: tabHref('processing'),
  },
  {
    id: 'model',
    label: 'Model',
    stage: '02 · Ontology',
    description: "The model is ASE's understanding of your world — what things exist, what facts they carry, and how they connect.",
    hasBadge: false,
    key: '3',
    href: tabHref('model'),
  },
  {
    id: 'identity',
    label: 'Identity',
    stage: '03 · Entity Resolution',
    description: 'Every person ASE has resolved, who they are, and how it worked them out.',
    hasBadge: true,
    key: '4',
    href: tabHref('identity'),
  },
  {
    id: 'meaning',
    label: 'Meaning',
    stage: '04 · Context Engine',
    description: 'Your systems send numbers. ASE turns them into statements about people and places.',
    hasBadge: false,
    key: '5',
    href: tabHref('meaning'),
  },
  {
    id: 'reasoning',
    label: 'Reasoning',
    stage: '05 · Reasoning Engine',
    description: 'When something is wrong, ASE traces it back across every system to find why — and shows what it ruled out.',
    hasBadge: false,
    key: '6',
    href: tabHref('reasoning'),
  },
  {
    id: 'detection',
    label: 'Detection',
    stage: '06 · Anomaly Detection',
    description: 'What ASE is watching for, what is firing right now, and on whom.',
    hasBadge: false,
    key: '7',
    href: tabHref('detection'),
  },
  {
    id: 'prediction',
    label: 'Prediction',
    stage: '09 · Intelligence Synthesis',
    description: "How the mountain is changing this person — their body, their judgement, and what happens next.",
    hasBadge: false,
    key: '8',
    href: tabHref('prediction'),
  },
  {
    id: 'revision',
    label: 'Revision',
    stage: '10 · Human Feedback Loop',
    description: 'Everything waiting on a human, everything decided, and what each decision changed.',
    hasBadge: true,
    key: '9',
    href: tabHref('revision'),
  },
  {
    id: 'exposure',
    label: 'Exposure',
    stage: 'Source resilience',
    description: 'What happens to what we know when a source fails.',
    hasBadge: false,
    key: '0',
    href: tabHref('exposure'),
  },
  {
    id: 'trust',
    label: 'Trust',
    stage: 'Trust and performance',
    description: 'How it is built, how it is secured, how it is tested, and how it connects to everything else.',
    hasBadge: false,
    key: '-',
    href: tabHref('trust'),
  },
]

export const DEFAULT_TAB_ID: TabId = 'overview'

export function tabById(id: string): TabDef | undefined {
  return TABS.find((t) => t.id === id)
}

export function tabFromPathname(pathname: string): TabDef {
  const segment = pathname.split('/').filter(Boolean).pop() ?? DEFAULT_TAB_ID
  return tabById(segment) ?? tabById(DEFAULT_TAB_ID) ?? TABS[0]
}
