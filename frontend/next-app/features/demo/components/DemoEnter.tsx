'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import { useAccess } from '@/hooks/use-access'
import { useIsClient } from '@/hooks/use-client'

import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const FADE_IN_MS = 900
const HOLD_MS = 1600
const FADE_OUT_MS = 500
const REDUCED_HOLD_MS = 1200

export function DemoEnter(): ReactElement {
  const { summary } = useAccess()
  const router = useRouter()
  const reduced = usePrefersReducedMotion()
  const ready = useIsClient()
  const [visible, setVisible] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const navigatedRef = useRef(false)

  useEffect(() => {
    if (!ready) return
    const timers: number[] = []

    function goToWorkspace(): void {
      if (navigatedRef.current) return
      navigatedRef.current = true
      router.push('/demo/workspace')
    }

    if (reduced) {
      const show = requestAnimationFrame(() => setVisible(true))
      timers.push(window.setTimeout(goToWorkspace, REDUCED_HOLD_MS))
      return () => {
        cancelAnimationFrame(show)
        timers.forEach((id) => window.clearTimeout(id))
      }
    }

    const raf = requestAnimationFrame(() => setVisible(true))
    timers.push(window.setTimeout(() => setFadingOut(true), FADE_IN_MS + HOLD_MS))
    timers.push(window.setTimeout(goToWorkspace, FADE_IN_MS + HOLD_MS + FADE_OUT_MS))
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [ready, reduced, router])

  function handleClick(): void {
    if (navigatedRef.current) return
    navigatedRef.current = true
    router.push('/demo/workspace')
  }

  return (
    <div
      onClick={handleClick}
      className="fixed inset-0 z-50 flex h-screen w-full cursor-pointer flex-col items-center justify-center bg-black transition-opacity motion-reduce:transition-none"
      style={{ opacity: fadingOut ? 0 : 1, transitionDuration: `${FADE_OUT_MS}ms` }}
    >
      <p
        className="whitespace-nowrap text-[32px] font-normal tracking-[0.05em] text-white transition-all ease-out motion-reduce:transition-none sm:text-[44px] md:text-[56px]"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(12px)',
          transitionDuration: `${FADE_IN_MS}ms`,
        }}
      >
        Welcome <span className="font-bold">Sentinet</span> to ASE
      </p>
      <p className="mt-4 font-mono text-[13px] text-white/40">{summary?.companyName}</p>
    </div>
  )
}
