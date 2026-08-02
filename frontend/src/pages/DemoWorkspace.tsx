import { useState } from 'react'
import { LensesScreen } from '../components/demo/LensesScreen'
import { LegendScreen } from '../components/demo/LegendScreen'
import { GraphTopBar } from '../components/demo/graph/GraphTopBar'
import { ClimberGraphCanvas } from '../components/demo/graph/ClimberGraphCanvas'
import { ResolvingTicker } from '../components/demo/graph/ResolvingTicker'

type Stage = 'lenses' | 'legend' | 'graph'

export function DemoWorkspace() {
  const [stage, setStage] = useState<Stage>('lenses')
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
          <ClimberGraphCanvas lenses={lenses} />
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
