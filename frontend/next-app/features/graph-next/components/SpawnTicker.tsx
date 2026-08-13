'use client'

// S8.4b/8.5R: the ticker now accumulates — "Ticker lines accumulate (never
// replace) — each stage's line stays visible while the next appears below
// it." Was a single line with a flat fade at 2200ms; now consumes
// spawnPlan.tickerLines (one entry per stage, real dataset counts already
// baked in by spawnStages.ts) and fades the WHOLE block once, starting at
// tickerFadeStartMs.

import { useEffect, useState, type ReactElement } from 'react'
import { TEXT_SECONDARY } from '@/features/ase/tokens'
import { TICKER_FADE_MS, type SpawnPlan } from '../services/spawnStages'

export function SpawnTicker({ spawnPlan, renderFinal }: { spawnPlan: SpawnPlan; renderFinal: boolean }): ReactElement | null {
  // renderFinal covers reduced-motion, a remount after the first-ever spawn,
  // and a mid-reveal skip — in every case the reveal has already "happened"
  // as far as this mount is concerned, so the ticker has nothing left to
  // narrate and never appears at all (mirrors "a view switch or a remount
  // must render everything final and visible, not replay").
  const [visibleCount, setVisibleCount] = useState(renderFinal ? 0 : 0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (renderFinal) return
    const timers = spawnPlan.tickerLines.map((line, i) => setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), line.atMs))
    const fadeTimer = setTimeout(() => setFading(true), spawnPlan.tickerFadeStartMs)
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(fadeTimer)
    }
  }, [spawnPlan, renderFinal])

  if (renderFinal || visibleCount === 0) return null

  return (
    <div
      className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5 font-mono"
      style={{
        fontSize: 12,
        letterSpacing: '0.04em',
        color: TEXT_SECONDARY,
        opacity: fading ? 0 : 1,
        transition: `opacity ${TICKER_FADE_MS}ms ease-out`,
      }}
    >
      {spawnPlan.tickerLines.slice(0, visibleCount).map((line) => (
        <p key={line.atMs}>{line.text}</p>
      ))}
    </div>
  )
}
