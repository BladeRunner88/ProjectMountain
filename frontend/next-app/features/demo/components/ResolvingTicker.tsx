'use client'

import { useEffect, useState, type ReactElement } from 'react'

const MESSAGE =
  'Resolving entities... 5 countries - 14 lines - 30 operators - 50 individuals - 14 environmental sensors'

export function ResolvingTicker(): ReactElement | null {
  const [visibleChars, setVisibleChars] = useState(0)
  const [fading, setFading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timers: number[] = []

    if (reduced) {
      const show = requestAnimationFrame(() => setVisibleChars(MESSAGE.length))
      timers.push(window.setTimeout(() => setFading(true), 500))
      timers.push(window.setTimeout(() => setDone(true), 900))
      return () => {
        cancelAnimationFrame(show)
        timers.forEach((id) => window.clearTimeout(id))
      }
    }

    let i = 0
    const interval = window.setInterval(() => {
      i++
      setVisibleChars(i)
      if (i >= MESSAGE.length) {
        window.clearInterval(interval)
        timers.push(window.setTimeout(() => setFading(true), 700))
        timers.push(window.setTimeout(() => setDone(true), 1300))
      }
    }, 18)

    return () => {
      window.clearInterval(interval)
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  if (done) return null

  return (
    <div
      className="flex h-8 shrink-0 items-center border-t border-white/10 px-6 transition-opacity duration-500 ease-out motion-reduce:transition-none"
      style={{ backgroundColor: '#0B0E12', opacity: fading ? 0 : 1 }}
    >
      <p className="font-mono text-[12px] text-white/50">{MESSAGE.slice(0, visibleChars)}</p>
    </div>
  )
}
