import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDataset } from '../../ase/store'
import { useAsOf } from '../../ase/asOfContext'
import { useSimulationMode } from '../../ase/simulationMode'
import { DEMO_STEPS, useDemoMode } from '../../ase/demoMode'
import { instant } from '../../ase/traced'

// S9.13: the part of Demo Mode with no visible UI of its own — it watches
// the step index and performs the REAL action each step promises (navigate,
// run Exposure's actual Simulation, scrub the actual as-of context), then
// watches real router/context state to decide whether the step actually
// landed. Running the demo IS exercising real features, not narrating them.
export function DemoRunner() {
  const demo = useDemoMode()
  const navigate = useNavigate()
  const location = useLocation()
  const simulation = useSimulationMode()
  const asOf = useAsOf()
  const { dataset } = useDataset()

  // Enter a step: navigate, and trigger whichever real side effect this
  // particular step promises in its narration.
  useEffect(() => {
    if (demo.status !== 'playing') return
    const step = DEMO_STEPS[demo.stepIndex]
    if (!step) return
    navigate(`/app/control-room/${step.tabId}`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.stepIndex, demo.status])

  // Validate a step: real router/context state, re-checked whenever any of
  // it actually changes — never a canned "step complete" flag.
  useEffect(() => {
    if (demo.status !== 'playing' && demo.status !== 'paused') return
    const step = DEMO_STEPS[demo.stepIndex]
    if (!step) return
    const expectedPath = `/app/control-room/${step.tabId}`
    let passed = location.pathname === expectedPath
    if (step.id === 'exposure') passed = passed && simulation.active
    if (step.id === 'timeline') passed = passed && asOf.at !== 'now'
    demo.recordValidation(demo.stepIndex, passed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, simulation.active, asOf.at, demo.stepIndex, demo.status])

  // Exiting the demo (or it never having advanced past the outage step)
  // shouldn't leave a stray simulation quietly running — the demo owns what
  // it started.
  useEffect(() => {
    if (!demo.active && simulation.active) simulation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.active])

  return null
}
