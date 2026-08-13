import type { TabId } from '../types/tabs'

export type DemoStepId = 'overview' | 'meaning' | 'identity' | 'reasoning' | 'prediction' | 'exposure' | 'timeline'

export interface DemoStepDef {
  id: DemoStepId
  n: number
  tabId: TabId
  title: string
  narration: string[]
  durationSec: number
}

export const DEMO_STEPS: DemoStepDef[] = [
  { id: 'overview', n: 1, tabId: 'overview', title: 'Overview', narration: ['Hover the degraded source and watch conclusions dim in proportion to what actually depends on it.', 'Five systems in. One understanding out.'], durationSec: 25 },
  { id: 'meaning', n: 2, tabId: 'meaning', title: 'Meaning', narration: ['Raw payload on the left, plain-English sentences on the right.', 'Your connector delivered the left. We produced the right.'], durationSec: 25 },
  { id: 'identity', n: 3, tabId: 'identity', title: 'Identity', narration: ['Three records become one person.', 'Drag the match threshold and watch precision move against ground truth.'], durationSec: 30 },
  { id: 'reasoning', n: 4, tabId: 'reasoning', title: 'Reasoning', narration: ['The ruled-out hypotheses first, then the chain, then the counterfactual.', 'Without the weather feed, we could not have told you this.'], durationSec: 30 },
  { id: 'prediction', n: 5, tabId: 'prediction', title: 'Prediction', narration: ['One climber at 68%, with the drivers behind it.', 'When we say 70%, we are right 66% of the time. Here are the ones we got wrong.'], durationSec: 35 },
  { id: 'exposure', n: 6, tabId: 'exposure', title: 'Exposure', narration: ['Kill the permit registry.', 'Watch what stops being knowable.'], durationSec: 30 },
  { id: 'timeline', n: 7, tabId: 'revision', title: 'Timeline', narration: ['Scrub back to 14:02.', 'This is what we knew when the decision was made.'], durationSec: 25 },
]

export const DEMO_CLOSING_LINE =
  'The model is data. Swap it for mining or logistics and everything you just saw still works.'

export const DEMO_TOTAL_SECONDS: number = DEMO_STEPS.reduce((a, s) => a + s.durationSec, 0)

export type DemoAudience = 'executive' | 'engineer' | 'medic' | 'auditor'

export const DEMO_AUDIENCE_LABEL: Record<DemoAudience, string> = {
  executive: 'Executive',
  engineer: 'Engineer',
  medic: 'Medic',
  auditor: 'Auditor',
}

/** Which of the 7 steps (by index) each audience cut actually walks — the executive gets all seven in the stated ~3.5 minutes; the engineer gets all seven plus a closing stop in Connections; the medic and auditor cuts are narrower. */
export const DEMO_AUDIENCE_STEP_INDICES: Record<DemoAudience, number[]> = {
  executive: [0, 1, 2, 3, 4, 5, 6],
  engineer: [0, 1, 2, 3, 4, 5, 6],
  medic: [4, 5],
  auditor: [6],
}

export const DEMO_AUDIENCE_NOTE: Record<DemoAudience, string> = {
  executive: 'All seven steps, roughly three and a half minutes.',
  engineer: 'All seven steps, plus a closing stop in Trust → Connections to show the schema.',
  medic: 'Focused on Prediction and Exposure.',
  auditor: 'Focused on Revision → Record and this Trust tab.',
}

export type DemoStatus = 'idle' | 'playing' | 'paused' | 'failed' | 'complete'
