// S9.13: THE DEMO — a real, scripted walkthrough of features already built
// this session, not a fabricated slideshow. Each step navigates to a real
// tab and, where the spec calls for it, triggers a REAL state change: step
// 6 runs Exposure's actual Simulation (S9.12), step 7 scrubs the actual
// as-of context (S3). Validation checks real router/context state, not a
// canned "step complete" flag — so running the demo IS the regression test
// the spec asks for ("run it before you walk on stage").

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { TabId } from '../components/controlRoom/tabs'

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
export const DEMO_CLOSING_LINE = 'The model is data. Swap it for mining or logistics and everything you just saw still works.'
export const DEMO_TOTAL_SECONDS = DEMO_STEPS.reduce((a, s) => a + s.durationSec, 0)

export type DemoAudience = 'executive' | 'engineer' | 'medic' | 'auditor'
export const DEMO_AUDIENCE_LABEL: Record<DemoAudience, string> = { executive: 'Executive', engineer: 'Engineer', medic: 'Medic', auditor: 'Auditor' }
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

interface DemoModeValue {
  active: boolean
  status: DemoStatus
  stepIndex: number
  audience: DemoAudience
  stepValidations: Record<number, boolean | null>
  start: (audience: DemoAudience) => void
  goToStep: (index: number) => void
  next: () => void
  prev: () => void
  pause: () => void
  resume: () => void
  retryStep: () => void
  skipStep: () => void
  restart: () => void
  exit: () => void
  recordValidation: (index: number, passed: boolean) => void
  markFailed: () => void
}

const DemoModeCtx = createContext<DemoModeValue | null>(null)

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DemoStatus>('idle')
  const [stepIndex, setStepIndex] = useState(0)
  const [audience, setAudience] = useState<DemoAudience>('executive')
  const [stepValidations, setStepValidations] = useState<Record<number, boolean | null>>({})

  const value = useMemo<DemoModeValue>(() => {
    function stepsFor(a: DemoAudience): number[] {
      return DEMO_AUDIENCE_STEP_INDICES[a]
    }
    return {
      active: status !== 'idle',
      status,
      stepIndex,
      audience,
      stepValidations,
      start: (a) => {
        setAudience(a)
        setStepIndex(stepsFor(a)[0])
        setStatus('playing')
        setStepValidations({})
      },
      goToStep: (index) => {
        setStepIndex(index)
        setStatus('playing')
      },
      next: () => {
        const seq = stepsFor(audience)
        const pos = seq.indexOf(stepIndex)
        if (pos === -1 || pos === seq.length - 1) {
          setStatus('complete')
          return
        }
        setStepIndex(seq[pos + 1])
        setStatus('playing')
      },
      prev: () => {
        const seq = stepsFor(audience)
        const pos = seq.indexOf(stepIndex)
        if (pos <= 0) return
        setStepIndex(seq[pos - 1])
        setStatus('playing')
      },
      pause: () => setStatus((s) => (s === 'playing' ? 'paused' : s)),
      resume: () => setStatus((s) => (s === 'paused' ? 'playing' : s)),
      retryStep: () => setStatus('playing'),
      skipStep: () => {
        const seq = stepsFor(audience)
        const pos = seq.indexOf(stepIndex)
        if (pos === -1 || pos === seq.length - 1) {
          setStatus('complete')
          return
        }
        setStepIndex(seq[pos + 1])
        setStatus('playing')
      },
      restart: () => {
        setStepIndex(stepsFor(audience)[0])
        setStatus('playing')
        setStepValidations({})
      },
      exit: () => {
        setStatus('idle')
        setStepValidations({})
      },
      recordValidation: (index, passed) => setStepValidations((v) => ({ ...v, [index]: passed })),
      markFailed: () => setStatus('failed'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, stepIndex, audience, stepValidations])

  return <DemoModeCtx.Provider value={value}>{children}</DemoModeCtx.Provider>
}

export function useDemoMode(): DemoModeValue {
  const ctx = useContext(DemoModeCtx)
  if (!ctx) throw new Error('useDemoMode must be used within DemoModeProvider')
  return ctx
}
