import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccess } from '../lib/access'

const FADE_IN_MS = 900
const HOLD_MS = 1600
const FADE_OUT_MS = 500
const REDUCED_HOLD_MS = 1200

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function DemoEnter() {
  const { summary } = useAccess()
  const navigate = useNavigate()
  const reduced = useRef(prefersReducedMotion()).current
  const [visible, setVisible] = useState(reduced)
  const [fadingOut, setFadingOut] = useState(false)
  const navigatedRef = useRef(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    function goToWorkspace() {
      if (navigatedRef.current) return
      navigatedRef.current = true
      navigate('/demo/workspace')
    }

    if (reduced) {
      timers.push(setTimeout(goToWorkspace, REDUCED_HOLD_MS))
      return () => timers.forEach(clearTimeout)
    }

    // flip to visible on the next frame so the opacity/translate transition runs
    const raf = requestAnimationFrame(() => setVisible(true))
    timers.push(setTimeout(() => setFadingOut(true), FADE_IN_MS + HOLD_MS))
    timers.push(setTimeout(goToWorkspace, FADE_IN_MS + HOLD_MS + FADE_OUT_MS))
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClick() {
    if (navigatedRef.current) return
    navigatedRef.current = true
    navigate('/demo/workspace')
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
