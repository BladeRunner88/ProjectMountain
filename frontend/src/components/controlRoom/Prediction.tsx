import { useState } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  PAGE_GUTTER,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_12,
  SPACE_16,
  SPACE_32,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { PredictionList } from './PredictionList'
import { PredictionProfile } from './PredictionProfile'
import { PredictionCascade } from './PredictionCascade'
import { PredictionForecast } from './PredictionForecast'
import { PredictionCalibration } from './PredictionCalibration'
import { focusRingStyle, useFocusRing } from './focusRing'

type SubTab = 'list' | 'profile' | 'cascade' | 'forecast' | 'calibration'
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'profile', label: 'Profile' },
  { id: 'cascade', label: 'Cascade' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'calibration', label: 'Calibration' },
]

// S9.10 (complete rebuild): five tabs — List is the operational dashboard
// and the only entry point that needs nothing selected; Profile, Cascade
// and Forecast are all person-scoped; Calibration is global, like Method on
// Identity. The three framing rules are printed once here, at the top,
// because every subtab beneath them assumes the reader has seen them:
//   1. Operational risk, not diagnosis.
//   2. Cognitive state is INFERRED, not measured.
//   3. Every cognitive figure is an INDEX against this person's own
//      baseline, never a quantity.
export function Prediction() {
  const { dataset } = useDataset()
  const [subTab, setSubTab] = useState<SubTab>('list')
  const [selectedClimberId, setSelectedClimberId] = useState<string | null>(null)

  function selectPerson(climberId: string, moveToProfile: boolean) {
    setSelectedClimberId(climberId)
    if (moveToProfile) setSubTab('profile')
  }

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <FramingRules />
      <div style={{ marginTop: SPACE_16 }}>
        <SubNav value={subTab} onChange={setSubTab} />
      </div>
      <div style={{ marginTop: SPACE_32 }} data-prediction-panel={subTab}>
        {subTab === 'list' && <PredictionList state={dataset.predictions} onSelectPerson={(id) => selectPerson(id, true)} />}
        {subTab === 'profile' &&
          (selectedClimberId ? (
            <PredictionProfile state={dataset.predictions} climberId={selectedClimberId} onSelectPerson={(id) => selectPerson(id, false)} />
          ) : (
            <SelectSomeoneFirst />
          ))}
        {subTab === 'cascade' &&
          (selectedClimberId ? (
            <PredictionCascade state={dataset.predictions} climberId={selectedClimberId} />
          ) : (
            <SelectSomeoneFirst />
          ))}
        {subTab === 'forecast' &&
          (selectedClimberId ? (
            <PredictionForecast state={dataset.predictions} climberId={selectedClimberId} onSelectPerson={(id) => selectPerson(id, false)} />
          ) : (
            <SelectSomeoneFirst />
          ))}
        {subTab === 'calibration' && <PredictionCalibration state={dataset.predictions} />}
      </div>
    </div>
  )
}

function SelectSomeoneFirst() {
  return <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Select someone in List first.</p>
}

function FramingRules() {
  return (
    <div className="grid grid-cols-3" style={{ gap: SPACE_16, padding: SPACE_16, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <FramingRule label="OPERATIONAL RISK, NOT DIAGNOSIS">
        Outcomes read "requires descent" or "requires review," never a medical condition.
      </FramingRule>
      <FramingRule label="COGNITIVE STATE IS INFERRED, NOT MEASURED">
        ASE does not read brain activity. It infers decision-making risk from behaviour, physiology and conditions.
      </FramingRule>
      <FramingRule label="EVERY COGNITIVE FIGURE IS AN INDEX, NOT A QUANTITY">
        Never a measured percentage — an index against this person's own baseline, with what it's built from stated.
      </FramingRule>
    </div>
  )
}

function FramingRule({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{label}</p>
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>{children}</p>
    </div>
  )
}

function SubNav({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  return (
    <div className="flex justify-end">
      <div className="flex" style={{ gap: SPACE_8, padding: SPACE_8, background: PANEL_RAISED, borderRadius: RADIUS_STATIC, border: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
        {SUB_TABS.map((t) => (
          <SubNavPill key={t.id} active={t.id === value} label={t.label} onClick={() => onChange(t.id)} />
        ))}
      </div>
    </div>
  )
}

function SubNavPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
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
