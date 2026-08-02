// The one shared instance of the live simulation store. Both the demo graph
// (ClimberGraphCanvas) and the pit-wall Dashboard read from this exact same
// instance — mounting useGraphSimulation a second time would spin up an
// independent copy with its own timers, drifting out of sync with whatever
// the other page shows. Provided once, above both route trees, so it keeps
// ticking across navigation between them rather than resetting on mount.

import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { climbers as rawClimbers } from '../../../demo/climbers.js'
import {
  countries as rawCountries,
  regions as rawRegions,
  companies as rawCompanies,
  environments as rawEnvironments,
} from '../../../demo/topology.js'
import type { Climber, Company, Country, Environment, Region } from '../../../demo/types'
import { useGraphSimulation } from './useGraphSimulation'
import type { GraphSimulation } from './useGraphSimulation'
import { buildHierarchyLayout, computeStatusOf } from './layout'
import type { HierarchyLayout } from './layout'

export const climbers = rawClimbers as Climber[]
export const countries = rawCountries as Country[]
export const regions = rawRegions as Region[]
export const companies = rawCompanies as Company[]
export const environments = rawEnvironments as Environment[]

interface GraphSimulationContextValue extends GraphSimulation {
  layout: HierarchyLayout
  statusOf: Map<string, import('../../../demo/types').NodeStatus>
}

const GraphSimulationContext = createContext<GraphSimulationContextValue | null>(null)

export function GraphSimulationProvider({ children }: { children: ReactNode }) {
  const sim = useGraphSimulation(climbers, environments, regions)
  const layout = useMemo(
    () => buildHierarchyLayout(countries, regions, companies, climbers, environments),
    []
  )
  const statusOf = useMemo(
    () => computeStatusOf({ parentOf: layout.parentOf, tierOf: layout.tierOf }, sim.climberStatus, sim.environmentStatus),
    [layout, sim.climberStatus, sim.environmentStatus]
  )

  const value = useMemo(() => ({ ...sim, layout, statusOf }), [sim, layout, statusOf])

  return <GraphSimulationContext.Provider value={value}>{children}</GraphSimulationContext.Provider>
}

export function useGraphSimulationContext(): GraphSimulationContextValue {
  const ctx = useContext(GraphSimulationContext)
  if (!ctx) throw new Error('useGraphSimulationContext must be used within GraphSimulationProvider')
  return ctx
}
