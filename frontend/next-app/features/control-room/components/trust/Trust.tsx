'use client'

import { useRef, useState, type ReactElement } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  PAGE_GUTTER,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_12,
  SPACE_32,
  SPACE_48,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_CAPTION,
  TYPE_DISPLAY,
} from '@/features/ase/tokens'
import { useDataset } from '@/features/ase/client'
import { TrustDecisions } from './TrustDecisions'
import { TrustSecurity } from './TrustSecurity'
import { TrustQuality } from './TrustQuality'
import { TrustConnections } from './TrustConnections'
import { TrustPerformance } from './TrustPerformance'
import { TrustLimitations } from './TrustLimitations'
import { TrustRoadmap } from './TrustRoadmap'
import { TrustDemoControl } from './TrustDemo'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

export type TrustPill = 'decisions' | 'security' | 'quality' | 'connections'
const PILLS: { id: TrustPill; label: string }[] = [
  { id: 'decisions', label: 'Decisions' },
  { id: 'security', label: 'Security' },
  { id: 'quality', label: 'Quality' },
  { id: 'connections', label: 'Connections' },
]

// S9.13 (complete build): the last tab, and the only one whose subject is
// the SYSTEM rather than the expedition — see trust.ts's own header for
// why it holds plain structured data instead of TracedValue chains. Four
// pills switch the main content; Performance and Known Limitations are
// STANDING sections that render underneath regardless of which pill is
// active (per spec: "plus two standing sections beneath them"), followed by
// Roadmap/Versions/Support and the demo control.
export function Trust(): ReactElement {
  const { dataset } = useDataset()
  const [pill, setPill] = useState<TrustPill>('decisions')
  const performanceRef = useRef<HTMLDivElement>(null)
  const limitationsRef = useRef<HTMLDivElement>(null)

  function jumpToPerformance() {
    performanceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  function jumpToLimitations() {
    limitationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <TrustDemoControl />

      <div className="flex items-center justify-between" style={{ marginTop: SPACE_32 }}>
        <PillNav value={pill} onChange={setPill} />
        <div className="flex items-center" style={{ gap: SPACE_12 }}>
          <JumpLink label="Performance" onClick={jumpToPerformance} />
          <JumpLink label="Known Limitations" onClick={jumpToLimitations} />
        </div>
      </div>

      <div style={{ marginTop: SPACE_32 }} data-trust-pill={pill}>
        {pill === 'decisions' && <TrustDecisions />}
        {pill === 'security' && <TrustSecurity />}
        {pill === 'quality' && <TrustQuality />}
        {pill === 'connections' && <TrustConnections />}
      </div>

      <div ref={performanceRef} style={{ marginTop: SPACE_48 }}>
        <SectionDivider label="PERFORMANCE" />
        <TrustPerformance />
      </div>

      <div ref={limitationsRef} style={{ marginTop: SPACE_48 }}>
        <SectionDivider label="KNOWN LIMITATIONS" />
        <TrustLimitations onNavigate={setPill} />
      </div>

      <div style={{ marginTop: SPACE_48 }}>
        <SectionDivider label="ROADMAP, VERSIONS AND SUPPORT" />
        <TrustRoadmap />
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, marginTop: SPACE_48, textTransform: 'none', letterSpacing: 'normal' }}>
        {dataset.trust.decisions.length} decisions · {dataset.trust.securityFindings.filter((f) => f.status === 'open').length} open security findings ·{' '}
        {dataset.trust.testHealth.total} tests · {dataset.trust.knownLimitations.length} known limitations.
      </p>
    </div>
  )
}

function PillNav({ value, onChange }: { value: TrustPill; onChange: (v: TrustPill) => void }) {
  return (
    <div
      className="flex"
      style={{ gap: SPACE_8, padding: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}
    >
      {PILLS.map((p) => (
        <PillButton key={p.id} active={p.id === value} label={p.label} onClick={() => onChange(p.id)} />
      ))}
    </div>
  )
}

function PillButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
        background: active ? HAIRLINE : 'transparent',
        border: `${BORDER_WIDTH}px solid ${active ? TEXT_SECONDARY : 'transparent'}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_12}px`,
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}

function JumpLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pressable" style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textDecoration: 'underline' }}>
      {label} ↓
    </button>
  )
}

export function SectionDivider({ label }: { label: string }): ReactElement {
  return (
    <div style={{ borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingTop: SPACE_32 }}>
      <p style={{ ...TYPE_DISPLAY, fontSize: 18, color: TEXT_PRIMARY }}>{label}</p>
    </div>
  )
}
