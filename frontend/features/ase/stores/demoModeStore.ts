'use client'

import { create } from 'zustand'
import {
  DEMO_AUDIENCE_STEP_INDICES,
  type DemoAudience,
  type DemoStatus,
} from '../services/demoScript'

export interface DemoModeValue {
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

interface DemoModeStoreState {
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

function stepsFor(audience: DemoAudience): number[] {
  return DEMO_AUDIENCE_STEP_INDICES[audience]
}

export const useDemoModeStore = create<DemoModeStoreState>((set, get) => ({
  status: 'idle',
  stepIndex: 0,
  audience: 'executive',
  stepValidations: {},
  start: (audience: DemoAudience): void => {
    set({
      audience,
      stepIndex: stepsFor(audience)[0],
      status: 'playing',
      stepValidations: {},
    })
  },
  goToStep: (index: number): void => {
    set({ stepIndex: index, status: 'playing' })
  },
  next: (): void => {
    const { audience, stepIndex } = get()
    const seq = stepsFor(audience)
    const pos = seq.indexOf(stepIndex)
    if (pos === -1 || pos === seq.length - 1) {
      set({ status: 'complete' })
      return
    }
    set({ stepIndex: seq[pos + 1], status: 'playing' })
  },
  prev: (): void => {
    const { audience, stepIndex } = get()
    const seq = stepsFor(audience)
    const pos = seq.indexOf(stepIndex)
    if (pos <= 0) return
    set({ stepIndex: seq[pos - 1], status: 'playing' })
  },
  pause: (): void => {
    set((s) => (s.status === 'playing' ? { status: 'paused' } : s))
  },
  resume: (): void => {
    set((s) => (s.status === 'paused' ? { status: 'playing' } : s))
  },
  retryStep: (): void => {
    set({ status: 'playing' })
  },
  skipStep: (): void => {
    const { audience, stepIndex } = get()
    const seq = stepsFor(audience)
    const pos = seq.indexOf(stepIndex)
    if (pos === -1 || pos === seq.length - 1) {
      set({ status: 'complete' })
      return
    }
    set({ stepIndex: seq[pos + 1], status: 'playing' })
  },
  restart: (): void => {
    const { audience } = get()
    set({
      stepIndex: stepsFor(audience)[0],
      status: 'playing',
      stepValidations: {},
    })
  },
  exit: (): void => {
    set({ status: 'idle', stepValidations: {} })
  },
  recordValidation: (index: number, passed: boolean): void => {
    set((s) => ({ stepValidations: { ...s.stepValidations, [index]: passed } }))
  },
  markFailed: (): void => {
    set({ status: 'failed' })
  },
}))
