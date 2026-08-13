'use client'

import type { ReactElement, ReactNode } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  HUMAN,
  ICON_SIZE_SM,
  INSPECTOR_RAIL_WIDTH,
  INSPECTOR_WIDTH,
  MOTION_PANEL_MS,
  PANEL,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  ROW_HEIGHT_DEFAULT,
  SELECTION_DOT_SIZE,
  SPACE_8,
  SPACE_16,
  SPACE_24,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { confidence, dependents, describeLimitingStep, limitingStep, provenance, renderProvenance } from '@/features/ase/services/folds'
import { meaningColor } from '@/features/ase/services/meaning'
import { useAsOf, useDataset, usePrefersReducedMotion, useSelection, type Selection } from '@/features/ase/client'
import { CONFLICT_STRATEGY_LABEL, type Conflict } from '@/features/ase/services/conflict'
import { useInspectorChrome } from '../hooks/useInspectorChrome'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'
import { IdentityRecordPanel } from './IdentityRecordPanel'
import { PersonBadge } from './PersonBadge'

const INSPECTOR_SLIDE_PX = 12

export function Inspector(): ReactElement {
  const { selection } = useSelection()
  const { collapsed, toggleCollapsed } = useInspectorChrome()
  const { focused, handlers } = useFocusRing()
  const reducedMotion = usePrefersReducedMotion()
  const durationMs = reducedMotion ? 1 : MOTION_PANEL_MS

  return (
    <div
      className="flex h-full shrink-0 flex-col"
      style={{
        width: collapsed ? INSPECTOR_RAIL_WIDTH : INSPECTOR_WIDTH,
        borderLeft: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        background: PANEL,
        overflow: 'hidden',
        transition: `width ${durationMs}ms var(--cr-ease-out)`,
      }}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand inspector' : 'Collapse inspector'}
        aria-expanded={!collapsed}
        {...handlers}
        className="pressable flex shrink-0 items-center justify-center"
        style={{ height: ROW_HEIGHT_DEFAULT, color: TEXT_SECONDARY, ...focusRingStyle(focused) }}
      >
        <Chevron pointingRight={collapsed} />
      </button>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          padding: SPACE_16,
          width: INSPECTOR_WIDTH - 2 * SPACE_16,
          opacity: collapsed ? 0 : 1,
          transform: collapsed ? `translateX(${INSPECTOR_SLIDE_PX}px)` : 'translateX(0)',
          transition: `opacity ${durationMs}ms var(--cr-ease-out), transform ${durationMs}ms var(--cr-ease-out)`,
          pointerEvents: collapsed ? 'none' : 'auto',
        }}
      >
        {!selection ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Select anything to see how ASE knows it.</p>
        ) : selection.kind === 'conflict' ? (
          <ConflictBody conflict={selection.conflict} />
        ) : selection.kind === 'identity' ? (
          <IdentityRecordPanel climberId={selection.climberId} />
        ) : selection.kind === 'ruleFiring' ? (
          <RuleFiringBody selection={selection} />
        ) : (
          <InspectorBody selection={selection} />
        )}
      </div>
    </div>
  )
}

function InspectorBody({ selection }: { selection: Extract<Selection, { kind: 'value' }> }): ReactElement {
  const { traced, label, whatThisIs } = selection
  const conf = confidence(traced)
  const limiting = limitingStep(traced)
  const dependentCount = dependents(traced.id).length
  const { focused, handlers } = useFocusRing()

  return (
    <div data-metric-id={traced.id}>
      <div className="flex items-center" style={{ gap: SPACE_8, marginBottom: SPACE_16 }}>
        <span
          aria-hidden
          style={{
            width: SELECTION_DOT_SIZE,
            height: SELECTION_DOT_SIZE,
            borderRadius: '50%',
            background: meaningColor(traced),
            display: 'inline-block',
          }}
        />
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{label}</p>
      </div>

      <Field heading="What this is">{whatThisIs ?? `${label}, as ASE currently has it.`}</Field>
      <Field heading="How we know">{renderProvenance(provenance(traced))}</Field>
      <Field heading="How sure">
        {Math.round(conf * 100)}% — limited by {describeLimitingStep(limiting.traced)}
      </Field>
      <Field heading="What depends on it">
        <button
          type="button"
          {...handlers}
          className="pressable"
          style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textDecoration: 'underline', ...focusRingStyle(focused) }}
        >
          {dependentCount} value{dependentCount === 1 ? '' : 's'}
        </button>
      </Field>

      <details style={{ marginTop: SPACE_24 }}>
        <summary style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, cursor: 'pointer' }}>Technical detail</summary>
        <pre className="overflow-x-auto" style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(traced, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function ConflictBody({ conflict }: { conflict: Conflict }): ReactElement {
  const { view } = useAsOf()
  const { changeConflictPolicy } = useDataset()
  const { focused, handlers } = useFocusRing()

  const resolvedAsOf = conflict.resolved ? view.resolve(conflict.resolved.id) : undefined
  const dependentCount = conflict.resolved ? dependents(conflict.resolved.id).length : 0
  const badgeColor = conflict.policy.strategy === 'human-required' ? HUMAN : WATCH

  return (
    <div>
      <div className="flex items-center" style={{ gap: SPACE_8, marginBottom: SPACE_16 }}>
        <span
          aria-hidden
          style={{ width: SELECTION_DOT_SIZE, height: SELECTION_DOT_SIZE, borderRadius: '50%', background: badgeColor, display: 'inline-block' }}
        />
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
          {conflict.entityLabel} — {conflict.propertyLabel}
        </p>
      </div>

      <Field heading="Value A">
        {conflict.aOrigin}: {conflict.format(conflict.a.value)}
      </Field>
      <Field heading="Value B">
        {conflict.bOrigin}: {conflict.format(conflict.b.value)}
      </Field>
      <Field heading="Resolved">
        {conflict.resolved ? (resolvedAsOf ? conflict.format(resolvedAsOf.value) : 'not yet observed') : 'Needs your decision.'}
      </Field>
      <Field heading="Policy">
        {CONFLICT_STRATEGY_LABEL[conflict.policy.strategy]} — {conflict.policy.rationale}
      </Field>
      {conflict.resolved && conflict.downstream.length > 0 ? (
        <Field heading="Also updates">
          {conflict.downstream.map((d) => `${conflict.entityLabel}'s ${d.label.toLowerCase()}`).join(', ')} ({dependentCount} value
          {dependentCount === 1 ? '' : 's'} total)
        </Field>
      ) : null}

      <Field heading="Change policy">
        <select
          value={conflict.policy.id}
          onChange={(e) => {
            const next = conflict.availablePolicies.find((p) => p.id === e.target.value)
            if (next) changeConflictPolicy(conflict, next)
          }}
          {...handlers}
          style={{
            ...TYPE_BODY,
            color: TEXT_PRIMARY,
            background: PANEL_RAISED,
            border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
            borderRadius: RADIUS_INTERACTIVE,
            padding: SPACE_8,
            ...focusRingStyle(focused),
          }}
        >
          {conflict.availablePolicies.map((p) => (
            <option key={p.id} value={p.id}>
              {CONFLICT_STRATEGY_LABEL[p.strategy]}
            </option>
          ))}
        </select>
      </Field>

      <details style={{ marginTop: SPACE_24 }}>
        <summary style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, cursor: 'pointer' }}>Technical detail</summary>
        <pre className="overflow-x-auto" style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify({ a: conflict.a, b: conflict.b, resolved: conflict.resolved, policy: conflict.policy }, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function RuleFiringBody({ selection }: { selection: Extract<Selection, { kind: 'ruleFiring' }> }): ReactElement {
  const { ruleLabel, entities } = selection
  return (
    <div>
      <div className="flex items-center" style={{ gap: SPACE_8, marginBottom: SPACE_16 }}>
        <span
          aria-hidden
          style={{ width: SELECTION_DOT_SIZE, height: SELECTION_DOT_SIZE, borderRadius: '50%', background: WATCH, display: 'inline-block' }}
        />
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{ruleLabel}</p>
      </div>
      <div style={{ marginBottom: SPACE_16 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>CURRENTLY FIRING ON</p>
        {entities.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>Nobody, right now.</p>
        ) : (
          <div className="flex flex-col" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            {entities.map((e, i) =>
              e.climberId && e.serial ? (
                <PersonBadge key={i} climberId={e.climberId} name={e.label} serial={e.serial} />
              ) : (
                <span key={i} style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
                  {e.label}
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ heading, children }: { heading: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ marginBottom: SPACE_16 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{heading.toUpperCase()}</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{children}</p>
    </div>
  )
}

function Chevron({ pointingRight }: { pointingRight: boolean }): ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      width={ICON_SIZE_SM}
      height={ICON_SIZE_SM}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: pointingRight ? 'rotate(180deg)' : undefined }}
    >
      <path d="M12 5L7 10L12 15" />
    </svg>
  )
}
