import { useEffect, useState } from 'react'
import { useAccess } from '../../../lib/access'

function formatUtcClock(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss} UTC`
}

export function GraphTopBar() {
  const { summary } = useAccess()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-6"
      style={{ backgroundColor: '#0B0E12' }}
    >
      <p className="text-[15px] text-white">
        Welcome <span className="font-bold">Sentinet</span>
      </p>
      <p className="font-mono text-[12px] text-white/40">
        {summary?.companyName} · {formatUtcClock(now)}
      </p>
    </div>
  )
}
