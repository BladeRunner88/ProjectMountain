'use client'

import type { ReactNode } from 'react'
import { type DemoModeValue, useDemoModeStore } from '../stores/demoModeStore'

export type { DemoModeValue } from '../stores/demoModeStore'
export {
  DEMO_AUDIENCE_LABEL,
  DEMO_AUDIENCE_NOTE,
  DEMO_AUDIENCE_STEP_INDICES,
  DEMO_CLOSING_LINE,
  DEMO_STEPS,
  DEMO_TOTAL_SECONDS,
  type DemoAudience,
  type DemoStatus,
  type DemoStepDef,
  type DemoStepId,
} from '../services/demoScript'

/** Pass-through for drop-in replacement of the old React context provider. State lives in the Zustand store. */
export function DemoModeProvider({ children }: { children: ReactNode }): ReactNode {
  return children
}

export function useDemoMode(): DemoModeValue {
  const snapshot = useDemoModeStore()
  return {
    active: snapshot.status !== 'idle',
    status: snapshot.status,
    stepIndex: snapshot.stepIndex,
    audience: snapshot.audience,
    stepValidations: snapshot.stepValidations,
    start: snapshot.start,
    goToStep: snapshot.goToStep,
    next: snapshot.next,
    prev: snapshot.prev,
    pause: snapshot.pause,
    resume: snapshot.resume,
    retryStep: snapshot.retryStep,
    skipStep: snapshot.skipStep,
    restart: snapshot.restart,
    exit: snapshot.exit,
    recordValidation: snapshot.recordValidation,
    markFailed: snapshot.markFailed,
  }
}
