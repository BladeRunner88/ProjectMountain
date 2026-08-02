import { useEffect, useState } from 'react'

const MESSAGE =
  'Resolving entities... 5 countries - 14 routes - 30 operators - 50 individuals - 14 environmental sensors'

export function ResolvingTicker() {
  const [visibleChars, setVisibleChars] = useState(0)
  const [fading, setFading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timers: ReturnType<typeof setTimeout>[] = []

    if (reduced) {
      setVisibleChars(MESSAGE.length)
      timers.push(setTimeout(() => setFading(true), 500))
      timers.push(setTimeout(() => setDone(true), 900))
      return () => timers.forEach(clearTimeout)
    }

    let i = 0
    const interval = setInterval(() => {
      i++
      setVisibleChars(i)
      if (i >= MESSAGE.length) {
        clearInterval(interval)
        timers.push(setTimeout(() => setFading(true), 700))
        timers.push(setTimeout(() => setDone(true), 1300))
      }
    }, 18)

    return () => {
      clearInterval(interval)
      timers.forEach(clearTimeout)
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
