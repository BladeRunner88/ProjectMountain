'use client'

import { useEffect, useEffectEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DEMO_STEPS, useAsOf, useDataset, useDemoMode, useSimulationMode } from '@/features/ase/client'
import { instant } from '@/features/ase/services/traced'
import { tabHref } from '../types/tabs'

export function DemoRunner(): null {
  const demo = useDemoMode()
  const router = useRouter()
  const pathname = usePathname()
  const simulation = useSimulationMode()
  const asOf = useAsOf()
  const { dataset } = useDataset()

  // The demo is a scripted sequence: only the step index and the run status may
  // advance it. `router`, `simulation`, `asOf` and `dataset` are read when a step
  // fires but must not be reactive — `useDataset` returns a fresh object on every
  // 5s live tick, so depending on them would re-fire the current step (re-pushing
  // the route, restarting the simulation) on a timer. An Effect Event keeps those
  // reads current without making them trigger the effect.
  const applyStep = useEffectEvent((): void => {
    const step = DEMO_STEPS[demo.stepIndex]
    if (!step) return
    router.push(tabHref(step.tabId))
    if (step.id === 'exposure' && !simulation.active) {
      const permit = dataset.sources.find((s) => s.def.name === 'Permit registry')
      if (permit) simulation.start(permit.def.id, permit.def.name)
    }
    if (step.id === 'timeline' && asOf.at === 'now') {
      const target = new Date()
      target.setHours(14, 2, 0, 0)
      if (target.getTime() > Date.now()) target.setDate(target.getDate() - 1)
      asOf.setAt(instant(target.toISOString()))
    }
  })

  useEffect(() => {
    if (demo.status !== 'playing') return
    applyStep()
  }, [demo.stepIndex, demo.status])

  // Validation re-runs whenever something a step is checked against moves: the
  // route, the simulation flag, the as-of instant, or the step itself. Those stay
  // as dependencies; `demo` is only read (it is a fresh object each render, but
  // `recordValidation` is a stable Zustand action).
  const validateStep = useEffectEvent((): void => {
    const step = DEMO_STEPS[demo.stepIndex]
    if (!step) return
    const expectedPath = tabHref(step.tabId)
    let passed = pathname === expectedPath
    if (step.id === 'exposure') passed = passed && simulation.active
    if (step.id === 'timeline') passed = passed && asOf.at !== 'now'
    demo.recordValidation(demo.stepIndex, passed)
  })

  useEffect(() => {
    if (demo.status !== 'playing' && demo.status !== 'paused') return
    validateStep()
  }, [pathname, simulation.active, asOf.at, demo.stepIndex, demo.status])

  // Leaving the demo tears down the simulation the demo started.
  const stopSimulation = useEffectEvent((): void => {
    if (simulation.active) simulation.stop()
  })

  useEffect(() => {
    if (demo.active) return
    stopSimulation()
  }, [demo.active])

  return null
}
