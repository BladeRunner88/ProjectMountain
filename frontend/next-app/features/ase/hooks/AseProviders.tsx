'use client'

import type { ReactNode } from 'react'
import { AsOfProvider } from './useAsOf'
import { DatasetProvider } from './useDataset'
import { DemoModeProvider } from './useDemoMode'
import { HoverProvider } from './useHover'
import { SelectionProvider } from './useSelection'
import { SimulationModeProvider } from './useSimulationMode'

/** Mounts DatasetProvider (live graph + 5s tick). Other providers are pass-throughs kept for the old nesting shape. */
export function AseProviders({ children }: { children: ReactNode }): ReactNode {
  return (
    <DatasetProvider>
      <AsOfProvider>
        <SelectionProvider>
          <HoverProvider>
            <DemoModeProvider>
              <SimulationModeProvider>{children}</SimulationModeProvider>
            </DemoModeProvider>
          </HoverProvider>
        </SelectionProvider>
      </AsOfProvider>
    </DatasetProvider>
  )
}
