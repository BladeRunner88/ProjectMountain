import { useEffect, useRef, useState } from 'react'
import { TEXT_PRIMARY } from './tokens'
import { PanelLabel } from './primitives'

const COUNT_UP_MS = 900

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t)
}

// Counts up from 0 to `value` once, on first mount — afterward it just
// tracks `value` directly as the store ticks, no re-animating each change.
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const settledRef = useRef(false)

  useEffect(() => {
    if (settledRef.current) return
    let raf = 0
    const start = performance.now()
    const from = 0
    const to = value
    function tick(now: number) {
      const t = Math.min(1, (now - start) / COUNT_UP_MS)
      setDisplay(Math.round(from + (to - from) * easeOutQuad(t)))
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        settledRef.current = true
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // intentionally runs once — see settledRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (settledRef.current) setDisplay(value)
  }, [value])

  return <>{display.toLocaleString()}</>
}

export function SystemCounters({
  entitiesResolved,
  linksBuilt,
  anomaliesOpen,
  recordsIngested,
}: {
  entitiesResolved: number
  linksBuilt: number
  anomaliesOpen: number
  recordsIngested: number
}) {
  const counters = [
    { label: 'Entities resolved', value: entitiesResolved },
    { label: 'Links built', value: linksBuilt },
    { label: 'Anomalies open', value: anomaliesOpen },
    { label: 'Records ingested', value: recordsIngested },
  ]
  return (
    <div className="grid grid-cols-4 gap-6">
      {counters.map((counter) => (
        <div key={counter.label} className="flex flex-col gap-2">
          <PanelLabel>{counter.label}</PanelLabel>
          <p className="font-mono text-[32px] leading-none tracking-tight tabular-nums" style={{ color: TEXT_PRIMARY }}>
            <CountUp value={counter.value} />
          </p>
        </div>
      ))}
    </div>
  )
}
