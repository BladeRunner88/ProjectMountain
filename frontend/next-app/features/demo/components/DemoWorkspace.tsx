'use client'

import { useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'

import type { GraphSelection } from '../types/simulation'
import { ClimberGraphCanvas } from './ClimberGraphCanvas'
import { GraphTopBar } from './GraphTopBar'
import { LegendScreen } from './LegendScreen'
import { LensesScreen } from './LensesScreen'
import { ResolvingTicker } from './ResolvingTicker'

type Stage = 'lenses' | 'legend' | 'graph'

export function DemoWorkspace(): ReactElement {
  const searchParams = useSearchParams()
  const selectType = searchParams.get('selectType')
  const selectId = searchParams.get('selectId')
  const initialSelection: GraphSelection | null =
    (selectType === 'climber' || selectType === 'environment') && selectId
      ? { type: selectType, id: selectId }
      : null

  const [stage, setStage] = useState<Stage>(initialSelection ? 'graph' : 'lenses')
  const [lenses, setLenses] = useState<Set<string>>(new Set())

  function toggleLens(option: string): void {
    setLenses((prev) => {
      const next = new Set(prev)
      if (next.has(option)) next.delete(option)
      else next.add(option)
      return next
    })
  }

  const modalOpen = stage === 'lenses' || stage === 'legend'

  if (stage === 'graph') {
    return (
      <div className="flex h-full w-full flex-col">
        <GraphTopBar />
        <div className="relative min-h-0 flex-1">
          <ClimberGraphCanvas lenses={lenses} initialSelection={initialSelection} />
        </div>
        <ResolvingTicker />
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#0B0E12]">
      {modalOpen && (
        <div
          className={`w-full rounded-card border border-hairline bg-app p-10 shadow-soft transition-[max-width] duration-fast ease-out ${
            stage === 'legend' ? 'max-w-[680px]' : 'max-w-[560px]'
          }`}
        >
          {stage === 'lenses' ? (
            <LensesScreen selected={lenses} onToggle={toggleLens} onNext={() => setStage('legend')} />
          ) : (
            <LegendScreen onBack={() => setStage('lenses')} onOpenGraph={() => setStage('graph')} />
          )}
        </div>
      )}
    </div>
  )
}
