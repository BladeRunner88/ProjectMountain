import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
} from '../../ase/tokens'
import { formatHistoricalMoment } from '../../ase/bitemporal'
import { useAsOf } from '../../ase/asOfContext'
import type { Instant } from '../../ase/traced'
import { TABS, type TabId } from './tabs'
import { focusRingStyle, useFocusRing } from './focusRing'
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
  /** Stubbed until 9.1f wires real per-stage status — see the Live pill below. */
  liveStatus: LiveStatus
  /** Only Identity and Revision read this; absent (not zero) means "nothing to report yet", so no badge renders rather than an authored 0. */
  pendingCounts?: Partial<Record<TabId, number>>
}

export function TopBar({ activeTabId, liveStatus, pendingCounts }: TopBarProps) {
  const { at } = useAsOf()
  const historical = at !== 'now'

  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{
        height: BAR_HEIGHT,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        // Full WATCH fill, not a tint — S1d: "a historical view can never be
        // mistaken for the present."
        background: historical ? WATCH : PANEL,
        // The page gutter, same as every tab's own content — S1g: this was
        // already 24px (SPACE_24, numerically identical to PAGE_GUTTER), so
        // the clipped-looking "Overview" label wasn't a missing-padding bug.
        // The real cause: the left scroll-fade below rendered unconditionally,
        // permanently washing the first tab's text toward the panel colour
        // even when the row had nothing scrolled off to hide.
        paddingLeft: PAGE_GUTTER,
        paddingRight: SPACE_16,
      }}
    >
      <TabRow activeTabId={activeTabId} pendingCounts={pendingCounts} />

      <div className="flex shrink-0 items-center" style={{ gap: SPACE_16, marginLeft: SPACE_16 }}>
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
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function measure() {
      if (!el) return
      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    measure()
    el.addEventListener('scroll', measure)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="relative min-w-0 flex-1">
      <div ref={scrollRef} className="scrollbar-none flex items-center overflow-x-auto" style={{ gap: TAB_GAP }}>
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            id={tab.id}
            label={tab.label}
            active={tab.id === activeTabId}
            badge={tab.hasBadge ? pendingCounts?.[tab.id] : undefined}
          />
        ))}
      </div>
      {/* Fade at each end, per S1d — only while there's actually something scrolled off that way, or the fade itself washes out real content (the bug this replaced). */}
      {canScrollLeft && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full"
          style={{ width: PAGE_GUTTER, background: `linear-gradient(to right, ${PANEL}, ${PANEL}00)` }}
        />
      )}
      {canScrollRight && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-full"
          style={{ width: PAGE_GUTTER, background: `linear-gradient(to left, ${PANEL}, ${PANEL}00)` }}
        />
      )}
    </div>
  )
}

function TabButton({ id, label, active, badge }: { id: TabId; label: string; active: boolean; badge?: number }) {
  const { focused, handlers } = useFocusRing()
  return (
    <Link
      to={`/app/control-room/${id}`}
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
      {badge !== undefined && badge > 0 && (
        <span style={{ ...TYPE_CAPTION, color: ANOMALY }}>{badge}</span>
      )}
    </Link>
  )
}

function LivePill({ status }: { status: LiveStatus }) {
  const { focused, handlers } = useFocusRing()
  return (
    <Link
      to="/app/control-room/processing"
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

function NowControl({ at }: { at: 'now' | Instant }) {
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
      {open && <Scrubber onClose={() => setOpen(false)} />}
    </div>
  )
}
