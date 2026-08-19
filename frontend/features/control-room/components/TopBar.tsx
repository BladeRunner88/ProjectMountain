'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { Route } from 'next'
import Link from 'next/link'
import {
  ACCENT_INDICATOR_WIDTH,
  ANOMALY,
  BAR_HEIGHT,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PAGE_GUTTER,
  PANEL,
  SPACE_8,
  SPACE_12,
  SPACE_16,
  STATUS_DOT_SIZE,
  TAB_GAP,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  VERIFIED,
  WATCH,
} from '@/features/ase/tokens'
import { formatHistoricalMoment } from '@/features/ase/services/bitemporal'
import { DEMO_STEPS, useAsOf, useDemoMode, useSimulationMode } from '@/features/ase/client'
import type { Instant } from '@/features/ase/services/traced'
import { TABS, tabHref, type TabId } from '../types/tabs'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'
import { Scrubber } from './Scrubber'

export type LiveStatus = 'nominal' | 'watch' | 'anomaly'

const LIVE_COLOR: Record<LiveStatus, string> = {
  nominal: NOMINAL,
  watch: WATCH,
  anomaly: ANOMALY,
}
const LIVE_LABEL: Record<LiveStatus, string> = {
  nominal: 'Live',
  watch: 'Catching up',
  anomaly: 'Degraded',
}

export interface TopBarProps {
  activeTabId: TabId
  liveStatus: LiveStatus
  pendingCounts?: Partial<Record<TabId, number>>
}

export function TopBar({ activeTabId, liveStatus, pendingCounts }: TopBarProps): ReactElement {
  const { at } = useAsOf()
  const historical = at !== 'now'
  const simulation = useSimulationMode()
  const demo = useDemoMode()
  const demoStep = demo.active ? DEMO_STEPS[demo.stepIndex] : null

  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{
        height: BAR_HEIGHT,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        background: historical || simulation.active || demo.active ? WATCH : PANEL,
        paddingLeft: PAGE_GUTTER,
        paddingRight: SPACE_16,
      }}
    >
      <TabRow activeTabId={activeTabId} pendingCounts={pendingCounts} />

      <div className="flex shrink-0 items-center" style={{ gap: SPACE_16, marginLeft: SPACE_16 }}>
        {demo.active && demoStep ? (
          <div className="flex items-center" style={{ gap: SPACE_8, ...TYPE_BODY, color: TEXT_PRIMARY }}>
            <span aria-hidden>▶</span>
            <span>{`DEMO — step ${demoStep.n}/7: ${demoStep.title}`}</span>
            <button type="button" onClick={demo.prev} className="pressable" style={{ ...TYPE_CAPTION, textDecoration: 'underline' }} title="Previous step">
              PREV
            </button>
            <button
              type="button"
              onClick={() => (demo.status === 'paused' ? demo.resume() : demo.pause())}
              className="pressable"
              style={{ ...TYPE_CAPTION, textDecoration: 'underline' }}
            >
              {demo.status === 'paused' ? 'RESUME' : 'PAUSE'}
            </button>
            <button type="button" onClick={demo.next} className="pressable" style={{ ...TYPE_CAPTION, textDecoration: 'underline' }} title="Next step">
              NEXT
            </button>
            <button type="button" onClick={demo.exit} className="pressable" style={{ ...TYPE_CAPTION, textDecoration: 'underline' }}>
              EXIT
            </button>
          </div>
        ) : (
          simulation.active && (
            <button
              type="button"
              onClick={simulation.stop}
              className="pressable flex items-center"
              style={{ ...TYPE_BODY, color: TEXT_PRIMARY, gap: SPACE_8 }}
              title="Leave the simulation — nothing simulated here was ever written to the real graph"
            >
              <span aria-hidden>⚠</span>
              {`SIMULATING — ${simulation.sourceName} offline`}
              <span style={{ ...TYPE_CAPTION, textDecoration: 'underline' }}>EXIT</span>
            </button>
          )
        )}
        <LivePill status={liveStatus} />
        <NowControl at={at} />
      </div>
    </div>
  )
}

function TabRow({
  activeTabId,
  pendingCounts,
}: {
  activeTabId: TabId
  pendingCounts?: Partial<Record<TabId, number>>
}): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    function measure(): void {
      if (!el) return
      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    measure()
    el.addEventListener('scroll', measure)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return (): void => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={scrollRef}
        className="flex items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ gap: TAB_GAP }}
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            href={tab.href}
            label={tab.label}
            active={tab.id === activeTabId}
            badge={tab.hasBadge ? pendingCounts?.[tab.id] : undefined}
          />
        ))}
      </div>
      {canScrollLeft ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full"
          style={{ width: PAGE_GUTTER, background: `linear-gradient(to right, ${PANEL}, ${PANEL}00)` }}
        />
      ) : null}
      {canScrollRight ? (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-full"
          style={{ width: PAGE_GUTTER, background: `linear-gradient(to left, ${PANEL}, ${PANEL}00)` }}
        />
      ) : null}
    </div>
  )
}

function TabButton({
  href,
  label,
  active,
  badge,
}: {
  href: Route
  label: string
  active: boolean
  badge?: number
}): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <Link
      href={href}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_BODY,
        display: 'flex',
        alignItems: 'center',
        gap: SPACE_8,
        whiteSpace: 'nowrap',
        color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
        borderBottom: `${ACCENT_INDICATOR_WIDTH}px solid ${active ? VERIFIED : 'transparent'}`,
        paddingTop: SPACE_16,
        paddingBottom: SPACE_12,
        ...focusRingStyle(focused),
      }}
    >
      {label}
      {badge !== undefined && badge > 0 ? <span style={{ ...TYPE_CAPTION, color: ANOMALY }}>{badge}</span> : null}
    </Link>
  )
}

function LivePill({ status }: { status: LiveStatus }): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <Link
      href={tabHref('processing')}
      {...handlers}
      className="flex items-center"
      style={{ ...TYPE_BODY, color: TEXT_PRIMARY, gap: SPACE_8, ...focusRingStyle(focused) }}
    >
      <span
        aria-hidden
        style={{
          width: STATUS_DOT_SIZE,
          height: STATUS_DOT_SIZE,
          borderRadius: '50%',
          background: LIVE_COLOR[status],
          display: 'inline-block',
        }}
      />
      {LIVE_LABEL[status]}
    </Link>
  )
}

function NowControl({ at }: { at: 'now' | Instant }): ReactElement {
  const { focused, handlers } = useFocusRing()
  const [open, setOpen] = useState(false)
  const label = at === 'now' ? 'Now' : formatHistoricalMoment(at)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        {...handlers}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="pressable"
        style={{
          ...TYPE_BODY,
          color: TEXT_PRIMARY,
          display: 'flex',
          alignItems: 'center',
          gap: SPACE_8,
          ...focusRingStyle(focused),
        }}
      >
        <span aria-hidden>⏱</span>
        {label}
        <span aria-hidden>▾</span>
      </button>
      {open ? <Scrubber onClose={() => setOpen(false)} /> : null}
    </div>
  )
}
