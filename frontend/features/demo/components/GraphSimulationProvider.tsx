'use client'

import {
  createContext,
  useContext,
  useEffect,
  type ReactElement,
  type ReactNode,
} from 'react'

import {
  startGraphSimulation,
  stopGraphSimulation,
  useGraphSimulationStore,
  type GraphSimulationSnapshot,
} from '../stores/graphSimulationStore'

const GraphSimulationMountedContext = createContext(false)

export function GraphSimulationProvider({ children }: { children: ReactNode }): ReactElement {
  useEffect(() => {
    startGraphSimulation()
    return () => {
      stopGraphSimulation()
    }
  }, [])

  return (
    <GraphSimulationMountedContext.Provider value={true}>
      {children}
    </GraphSimulationMountedContext.Provider>
  )
}

export function useGraphSimulationContext(): GraphSimulationSnapshot {
  const mounted = useContext(GraphSimulationMountedContext)
  if (!mounted) {
    throw new Error('useGraphSimulationContext must be used within GraphSimulationProvider')
  }
  return useGraphSimulationStore()
}
