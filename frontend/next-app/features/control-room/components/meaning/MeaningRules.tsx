'use client'

import { useState, type CSSProperties, type ReactElement } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  HUMAN,
  MEANING_HELP_TEXT_MAX_WIDTH_PX,
  MEANING_INPUT_MAX_WIDTH_PX,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_8,
  SPACE_16,
  SPACE_32,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
} from '@/features/ase/tokens'
import { allUnboundFieldKeys, type ContextEngineState, type ContextRule, type EntityType } from '@/features/ase/services/contextEngine'
import { focusRingStyle, useFocusRing } from '@/features/control-room'

const ENTITY_ORDER: EntityType[] = ['Climber', 'Route', 'Sensor', 'Operator']

function isEntityType(value: string): value is EntityType {
  return (ENTITY_ORDER as readonly string[]).includes(value)
}

export function MeaningRules({
  engine,
  onAddRule,
  prefillField,
}: {
  engine: ContextEngineState
  onAddRule: (fieldKey: string, meaning: string, entityType: EntityType, authority: string) => void
  prefillField: string | null
}): ReactElement {
  const grouped = ENTITY_ORDER.map((type) => ({ type, rules: engine.rules.filter((r) => r.entityType === type) })).filter(
    (g) => g.rules.length > 0
  )

  return (
    <div>
      {grouped.length === 0 ? (
        <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No rules yet.</p>
      ) : (
        grouped.map((g) => <RuleGroup key={g.type} entityType={g.type} rules={g.rules} />)
      )}
      <AddRuleForm engine={engine} onAdd={onAddRule} prefillField={prefillField} />
    </div>
  )
}

function RuleGroup({ entityType, rules }: { entityType: EntityType; rules: ContextRule[] }): ReactElement {
  return (
    <div style={{ marginBottom: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{entityType.toUpperCase()}</p>
      <div style={{ marginTop: SPACE_16 }}>
        {rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  )
}

function RuleRow({ rule }: { rule: ContextRule }): ReactElement {
  return (
    <div style={{ padding: `${SPACE_8}px 0`, borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{rule.meaningStatement}</p>
      <div className="flex items-center flex-wrap" style={{ gap: SPACE_16, marginTop: SPACE_8 }}>
        <span style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{rule.entityType}</span>
        <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
          {rule.fieldKey}
        </span>
        <span style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{rule.authority}</span>
        <span className="font-mono" style={{ ...TYPE_CAPTION, color: TEXT_PRIMARY }}>
          {Math.round(rule.confidence * 100)}%
        </span>
        {rule.origin === 'human' ? (
          <span
            style={{
              ...TYPE_CAPTION,
              color: HUMAN,
              border: `${BORDER_WIDTH}px solid ${HUMAN}`,
              borderRadius: RADIUS_INTERACTIVE,
              padding: `1px ${SPACE_8}px`,
            }}
          >
            FROM A HUMAN
          </span>
        ) : (
          <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>BUILT-IN</span>
        )}
      </div>
    </div>
  )
}

function AddRuleForm({
  engine,
  onAdd,
  prefillField,
}: {
  engine: ContextEngineState
  onAdd: (fieldKey: string, meaning: string, entityType: EntityType, authority: string) => void
  prefillField: string | null
}): ReactElement {
  const unboundKeys = allUnboundFieldKeys(engine)
  const [fieldKey, setFieldKey] = useState(prefillField ?? '')
  const [prevPrefill, setPrevPrefill] = useState(prefillField)
  const [meaning, setMeaning] = useState('')
  const [authority, setAuthority] = useState('')
  const [entityType, setEntityType] = useState<EntityType>('Climber')
  const { focused: fieldFocused, handlers: fieldHandlers } = useFocusRing()
  const { focused: meaningFocused, handlers: meaningHandlers } = useFocusRing()
  const { focused: authorityFocused, handlers: authorityHandlers } = useFocusRing()
  const { focused: entityFocused, handlers: entityHandlers } = useFocusRing()
  const { focused: buttonFocused, handlers: buttonHandlers } = useFocusRing()

  if (prefillField !== prevPrefill) {
    setPrevPrefill(prefillField)
    if (prefillField) setFieldKey(prefillField)
  }

  if (unboundKeys.length === 0) {
    return (
      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ADD A RULE</p>
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Nothing left unbound anywhere in the system.</p>
      </div>
    )
  }

  const canSubmit = Boolean(fieldKey && meaning.trim() && authority.trim())

  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>ADD A RULE</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_16, maxWidth: MEANING_HELP_TEXT_MAX_WIDTH_PX }}>
        Bind an unbound field to a meaning. Coverage moves and the unbound list shrinks — for real.
      </p>
      <div className="flex items-center flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_16 }}>
        <select
          value={fieldKey}
          onChange={(e) => setFieldKey(e.target.value)}
          aria-label="Unbound field"
          {...fieldHandlers}
          style={selectStyle(Boolean(fieldKey), fieldFocused)}
        >
          <option value="">Field…</option>
          {unboundKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={entityType}
          onChange={(e) => {
            if (isEntityType(e.target.value)) setEntityType(e.target.value)
          }}
          aria-label="Applies to"
          {...entityHandlers}
          style={selectStyle(true, entityFocused)}
        >
          {ENTITY_ORDER.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
          placeholder="Plain-language meaning"
          aria-label="Meaning"
          {...meaningHandlers}
          style={inputStyle(meaningFocused)}
        />
        <input
          type="text"
          value={authority}
          onChange={(e) => setAuthority(e.target.value)}
          placeholder="Authority"
          aria-label="Authority"
          {...authorityHandlers}
          style={inputStyle(authorityFocused)}
        />
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onAdd(fieldKey, meaning.trim(), entityType, authority.trim())
            setFieldKey('')
            setMeaning('')
            setAuthority('')
          }}
          {...buttonHandlers}
          className="pressable"
          style={{
            ...TYPE_CAPTION,
            textTransform: 'none',
            letterSpacing: 'normal',
            color: canSubmit ? TEXT_PRIMARY : TEXT_DIM,
            border: `${BORDER_WIDTH}px solid ${canSubmit ? TEXT_SECONDARY : HAIRLINE}`,
            borderRadius: RADIUS_INTERACTIVE,
            padding: `${SPACE_8}px ${SPACE_16}px`,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            ...focusRingStyle(buttonFocused),
          }}
        >
          ADD RULE
        </button>
      </div>
    </div>
  )
}

function selectStyle(hasValue: boolean, focused: boolean): CSSProperties {
  return {
    ...TYPE_CAPTION,
    textTransform: 'none',
    letterSpacing: 'normal',
    color: hasValue ? TEXT_PRIMARY : TEXT_SECONDARY,
    background: PANEL_RAISED,
    border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
    borderRadius: RADIUS_INTERACTIVE,
    padding: `${SPACE_8}px`,
    ...focusRingStyle(focused),
  }
}

function inputStyle(focused: boolean): CSSProperties {
  return {
    ...TYPE_CAPTION,
    textTransform: 'none',
    letterSpacing: 'normal',
    color: TEXT_PRIMARY,
    background: PANEL_RAISED,
    border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
    borderRadius: RADIUS_INTERACTIVE,
    padding: `${SPACE_8}px`,
    flex: 1,
    maxWidth: MEANING_INPUT_MAX_WIDTH_PX,
    ...focusRingStyle(focused),
  }
}
