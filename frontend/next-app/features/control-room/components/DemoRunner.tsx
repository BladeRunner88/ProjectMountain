'use client'

import { useEffect } from 'react'
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

  useEffect(() => {
    if (demo.status !== 'playing') return
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
  }, [demo.stepIndex, demo.status])

  useEffect(() => {
    if (demo.status !== 'playing' && demo.status !== 'paused') return
    const step = DEMO_STEPS[demo.stepIndex]
    if (!step) return
    const expectedPath = tabHref(step.tabId)
    let passed = pathname === expectedPath
    if (step.id === 'exposure') passed = passed && simulation.active
    if (step.id === 'timeline') passed = passed && asOf.at !== 'now'
    demo.recordValidation(demo.stepIndex, passed)
  }, [pathname, simulation.active, asOf.at, demo.stepIndex, demo.status])

  useEffect(() => {
    if (!demo.active && simulation.active) simulation.stop()
  }, [demo.active])

  return null
}
