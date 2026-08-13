'use client'

import type { ReactElement } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  NOMINAL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_12,
  SPACE_16,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { DEMO_AUDIENCE_LABEL, DEMO_AUDIENCE_NOTE, DEMO_CLOSING_LINE, DEMO_STEPS, DEMO_TOTAL_SECONDS, useDemoMode, type DemoAudience } from '@/features/ase/client'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

const AUDIENCES: DemoAudience[] = ['executive', 'engineer', 'medic', 'auditor']

// THE DEMO's cockpit — lives on Trust because that's where whoever is about
// to walk on stage checks the product is defensible right before they show
// it. Starting, choosing an audience cut, reading the narration and
// reviewing the per-step validation ticklist all happen here; the in-flight
// transport controls (prev/pause/next/exit) also live in the nav bar (see
// TopBar.tsx) since the seven steps themselves visit six different tabs.
export function TrustDemoControl(): ReactElement {
  const demo = useDemoMode()

  if (!demo.active) {
    return (
      <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>DEMO MODE</p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          Seven real steps across six tabs, ~{Math.round(DEMO_TOTAL_SECONDS / 60)} minutes. All data stays synthetic to this session — nothing is written
          outside it that a reload wouldn&apos;t already discard.
        </p>
        <div className="flex flex-wrap items-center" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
          {AUDIENCES.map((a) => (
            <StartButton key={a} audience={a} onClick={() => demo.start(a)} />
          ))}
        </div>
      </div>
    )
  }

  const step = DEMO_STEPS[demo.stepIndex]
  const validated = demo.stepValidations[demo.stepIndex]
  const failed = validated === false && demo.status !== 'complete'

  return (
    <div style={{ padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${failed ? ANOMALY : WATCH}` }}>
      <div className="flex items-center justify-between">
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
          DEMO MODE — {DEMO_AUDIENCE_LABEL[demo.audience]} cut · {DEMO_AUDIENCE_NOTE[demo.audience]}
        </p>
        <TickList />
      </div>

      {demo.status === 'complete' ? (
        <>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_16 }}>{DEMO_CLOSING_LINE}</p>
          <RestartExit />
        </>
      ) : (
        <>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_16 }}>
            Step {step.n}/7 — {step.title} ({step.durationSec}s)
          </p>
          {step.narration.map((line, i) => (
            <p key={i} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              &quot;{line}&quot;
            </p>
          ))}
          <p style={{ ...TYPE_CAPTION, color: validated === true ? NOMINAL : validated === false ? ANOMALY : TEXT_DIM, marginTop: SPACE_16 }}>
            {validated === true ? '✓ VALIDATED — real router/context state matches this step' : validated === false ? '✗ VALIDATION FAILED' : '… checking'}
          </p>

          {failed ? (
            <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
              <p style={{ ...TYPE_CAPTION, color: ANOMALY, textTransform: 'none', letterSpacing: 'normal', marginRight: SPACE_8 }}>
                Assume it will fail once in front of an audience — here is the recovery path:
              </p>
              <SmallButton label="RETRY" color={NOMINAL} onClick={demo.retryStep} />
              <SmallButton label="SKIP" color={WATCH} onClick={demo.skipStep} />
              <SmallButton label="RESTART" color={ANOMALY} onClick={demo.restart} />
            </div>
          ) : (
            <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
              Use PREV / PAUSE / NEXT / EXIT in the nav bar above to drive the rest of the walkthrough.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function TickList() {
  const demo = useDemoMode()
  return (
    <div className="flex items-center" style={{ gap: SPACE_8 }}>
      {DEMO_STEPS.map((s, i) => {
        const v = demo.stepValidations[i]
        const color = v === true ? NOMINAL : v === false ? ANOMALY : i === demo.stepIndex ? WATCH : TEXT_DIM
        return (
          <span key={s.id} title={`${s.n}. ${s.title}${v === true ? ' — validated' : v === false ? ' — failed' : ''}`} style={{ ...TYPE_CAPTION, color, border: `${BORDER_WIDTH}px solid ${color}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px` }}>
            {v === true ? '✓' : s.n}
          </span>
        )
      })}
    </div>
  )
}

function StartButton({ audience, onClick }: { audience: DemoAudience; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color: NOMINAL, border: `${BORDER_WIDTH}px solid ${NOMINAL}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_16}px`, ...focusRingStyle(focused) }}
    >
      START DEMO — {DEMO_AUDIENCE_LABEL[audience]}
    </button>
  )
}

function SmallButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal', color, border: `${BORDER_WIDTH}px solid ${color}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_12}px`, ...focusRingStyle(focused) }}
    >
      {label}
    </button>
  )
}

function RestartExit() {
  const demo = useDemoMode()
  return (
    <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
      <SmallButton label="RESTART" color={NOMINAL} onClick={demo.restart} />
      <SmallButton label="EXIT" color={TEXT_SECONDARY} onClick={demo.exit} />
    </div>
  )
}
