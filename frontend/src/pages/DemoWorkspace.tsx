import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LensesScreen } from '../components/demo/LensesScreen'
import { LegendScreen } from '../components/demo/LegendScreen'
import { GraphTopBar } from '../components/demo/graph/GraphTopBar'
import { ClimberGraphCanvas } from '../components/demo/graph/ClimberGraphCanvas'
import { ResolvingTicker } from '../components/demo/graph/ResolvingTicker'

type Stage = 'lenses' | 'legend' | 'graph'

// Deep-link entry point for "show me in graph" links elsewhere in the app
// (the Records pill, most notably): ?selectType=climber|environment&selectId=...
// skips the lenses/legend intro and seeds the canvas's initial selection.
// Purely additive — absent params reproduce the exact prior behaviour.
export function DemoWorkspace() {
  const [searchParams] = useSearchParams()
  const selectType = searchParams.get('selectType')
  const selectId = searchParams.get('selectId')
  const initialSelection =
    (selectType === 'climber' || selectType === 'environment') && selectId ? ({ type: selectType, id: selectId } as const) : null

  const [stage, setStage] = useState<Stage>(initialSelection ? 'graph' : 'lenses')
  const [lenses, setLenses] = useState<Set<string>>(new Set())

  function toggleLens(option: string) {
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
