import { useMemo, useState } from 'react'
import {
  ANOMALY,
  BORDER_WIDTH,
  HAIRLINE,
  MAP_HEADER_CLIMBER,
  NOMINAL,
  PANEL_PADDING,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_8,
  SPACE_12,
  SPACE_16,
  STATUS_DOT_SIZE,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '../../ase/tokens'
import { PREDICTED_LABEL, type PersonPrediction, type PredictedOutcome, type PredictionState, type RiskLevel } from '../../ase/prediction'
import { maskedSerial } from '../../ase/serial'
import { focusRingStyle, useFocusRing } from './focusRing'

const RISK_COLOR: Record<RiskLevel, string> = { critical: ANOMALY, elevated: WATCH, watch: NOMINAL }
const PREDICTED_COLOR: Record<PredictedOutcome, string> = { 'requires-descent': ANOMALY, 'requires-review': WATCH, watch: NOMINAL, ready: TEXT_DIM }
const STATUS_LABEL: Record<PersonPrediction['status'], string> = { open: 'Open', acknowledged: 'Acknowledged', 'acted-on': 'Acted on', overruled: 'Overruled', resolved: 'Resolved' }

type SortColumn = 'within' | 'altitude' | 'likelihood' | null

// LIST — the operational dashboard. Every one of the spec's twelve columns
// renders as a real table column (never hidden behind expand) — the
// acceptance line is explicit that isolation (Human Connection) must be
// visible without expanding a row. Tight rows, wide table: this reads best
// scrolled sideways on a field laptop, not squeezed to fit.
export function PredictionList({ state, onSelectPerson }: { state: PredictionState; onSelectPerson: (climberId: string) => void }) {
  const [statusFilter, setStatusFilter] = useState<'all' | PersonPrediction['status']>('all')
  const [predictedFilter, setPredictedFilter] = useState<'all' | PredictedOutcome>('all')
  const [onlyUnacknowledged, setOnlyUnacknowledged] = useState(false)
  const [onlyRequiresDescent, setOnlyRequiresDescent] = useState(false)
  const [onlyIsolated, setOnlyIsolated] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const rows = useMemo(() => state.order.map((id) => state.predictions.get(id)!), [state])

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (predictedFilter !== 'all' && p.predicted !== predictedFilter) return false
      if (onlyUnacknowledged && p.status !== 'open') return false
      if (onlyRequiresDescent && p.predicted !== 'requires-descent') return false
      if (onlyIsolated && p.human.cohesionScore >= 50) return false
      return true
    })
  }, [rows, statusFilter, predictedFilter, onlyUnacknowledged, onlyRequiresDescent, onlyIsolated])

  const sorted = useMemo(() => {
    if (!sortColumn) return filtered
    const copy = [...filtered]
    copy.sort((a, b) => {
      if (sortColumn === 'within') return a.withinHours - b.withinHours
      if (sortColumn === 'altitude') return b.position.altitudeM - a.position.altitudeM
      return b.likelihoodPct - a.likelihoodPct
    })
    return copy
  }, [filtered, sortColumn])

  return (
    <div>
      <div className="flex flex-wrap items-center" style={{ gap: SPACE_8 }}>
        <SortButton label="Sort: within" active={sortColumn === 'within'} onClick={() => setSortColumn('within')} />
        <SortButton label="Sort: altitude" active={sortColumn === 'altitude'} onClick={() => setSortColumn('altitude')} />
        <SortButton label="Sort: likelihood" active={sortColumn === 'likelihood'} onClick={() => setSortColumn('likelihood')} />
        <Divider />
        <ToggleChip label="Unacknowledged only" active={onlyUnacknowledged} onClick={() => setOnlyUnacknowledged((v) => !v)} />
        <ToggleChip label="Requires descent only" active={onlyRequiresDescent} onClick={() => setOnlyRequiresDescent((v) => !v)} />
        <ToggleChip label="Isolated only" active={onlyIsolated} onClick={() => setOnlyIsolated((v) => !v)} />
        <Divider />
        <FilterSelect
          label="Status"
          value={statusFilter}
          options={['open', 'acknowledged', 'acted-on', 'overruled', 'resolved'] as const}
          labelFor={(v) => STATUS_LABEL[v]}
          onChange={setStatusFilter}
        />
        <FilterSelect
          label="Predicted"
          value={predictedFilter}
          options={['requires-descent', 'requires-review', 'watch', 'ready'] as const}
          labelFor={(v) => PREDICTED_LABEL[v]}
          onChange={setPredictedFilter}
        />
      </div>

      <div className="overflow-x-auto" style={{ marginTop: SPACE_16 }}>
        <div style={{ minWidth: 1900 }}>
          <HeaderRow />
          {sorted.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16 }}>Nobody matches these filters right now.</p>
          ) : (
            sorted.map((p) => (
              <Row
                key={p.climberId}
                p={p}
                expanded={expandedId === p.climberId}
                onToggleExpand={() => setExpandedId((id) => (id === p.climberId ? null : p.climberId))}
                onSelect={() => onSelectPerson(p.climberId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Divider() {
  return <span aria-hidden style={{ width: BORDER_WIDTH, height: 20, background: HAIRLINE }} />
}

function SortButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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
        border: `${BORDER_WIDTH}px solid ${active ? TEXT_SECONDARY : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_12}px`,
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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
        border: `${BORDER_WIDTH}px solid ${active ? NOMINAL : HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_12}px`,
        ...focusRingStyle(focused),
      }}
    >
      {label}
    </button>
  )
}

function FilterSelect<T extends string>({ label, value, options, labelFor, onChange }: { label: string; value: 'all' | T; options: readonly T[]; labelFor: (v: T) => string; onChange: (v: 'all' | T) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as 'all' | T)}
      aria-label={label}
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: value === 'all' ? TEXT_SECONDARY : TEXT_PRIMARY,
        background: PANEL_RAISED,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: SPACE_8,
      }}
    >
      <option value="all">{label}: all</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {labelFor(o)}
        </option>
      ))}
    </select>
  )
}

const COLS = {
  risk: 0.5,
  identity: 2,
  position: 1.7,
  human: 1.9,
  predicted: 1.4,
  within: 0.9,
  likelihood: 0.8,
  driving: 2,
  issued: 1.1,
  status: 1.1,
  action: 1.9,
  also: 1,
}

function HeaderRow() {
  return (
    <div className="flex shrink-0 items-center" style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, padding: `${SPACE_8}px ${PANEL_PADDING}px` }}>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.risk }} />
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.identity }}>IDENTITY</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.position }}>POSITION</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.human }}>HUMAN CONNECTION</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.predicted }}>PREDICTED</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.within }}>WITHIN</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.likelihood }}>LIKELIHOOD</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.driving }}>DRIVING IT</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.issued }}>ISSUED</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.status }}>STATUS</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.action }}>ACTION</span>
      <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, flex: COLS.also }}>ALSO AFFECTED</span>
    </div>
  )
}

function DriverKindTag({ kind }: { kind: 'clinical' | 'learned' | 'operator' }) {
  const label = kind === 'clinical' ? 'Clinical' : kind === 'learned' ? 'Learned' : 'Operator'
  return (
    <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}> · {label}</span>
  )
}

function Row({ p, expanded, onToggleExpand, onSelect }: { p: PersonPrediction; expanded: boolean; onToggleExpand: () => void; onSelect: () => void }) {
  const { focused, handlers } = useFocusRing()
  const withinColor = p.withinHours < 2 ? ANOMALY : p.withinHours < 4 ? WATCH : TEXT_PRIMARY
  const isolated = p.human.cohesionScore < 50

  return (
    <div style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        {...handlers}
        className="pressable-row flex cursor-pointer items-center"
        style={{ padding: `${SPACE_12}px ${PANEL_PADDING}px`, ...focusRingStyle(focused) }}
      >
        <span style={{ flex: COLS.risk }}>
          <span
            aria-hidden
            title={p.risk}
            style={{
              width: STATUS_DOT_SIZE + 2,
              height: STATUS_DOT_SIZE + 2,
              borderRadius: '50%',
              background: RISK_COLOR[p.risk],
              display: 'inline-block',
              animation: p.status === 'open' ? 'value-flash 2.4s ease-in-out infinite' : undefined,
            }}
          />
        </span>

        <span className="flex items-center" style={{ flex: COLS.identity, gap: SPACE_8 }}>
          <span
            aria-hidden
            style={{ width: 22, height: 22, borderRadius: '50%', background: MAP_HEADER_CLIMBER, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPE_CAPTION, color: TEXT_PRIMARY, fontSize: 10 }}
          >
            {p.name
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')}
          </span>
          <span>
            <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{p.name}</span>{' '}
            <span className="font-mono" style={{ ...TYPE_BODY, color: TEXT_DIM }} title={`Full serial: ${p.serial}`}>
              {maskedSerial(p.serial)}
            </span>
            <br />
            <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'capitalize' }}>{p.role}</span>
          </span>
        </span>

        <span style={{ flex: COLS.position, color: TEXT_SECONDARY }}>
          <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{p.position.label}</span>
          <br />
          <span style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal' }}>
            {p.position.altitudeM.toLocaleString()}m <span style={{ color: TEXT_DIM }}>({p.position.altitudeDeltaM >= 0 ? '+' : ''}{p.position.altitudeDeltaM})</span>{' '}
            {p.position.movement === 'ascending' ? '↑' : p.position.movement === 'descending' ? '↓' : '→'} {p.position.movement}
          </span>
        </span>

        <span style={{ flex: COLS.human }}>
          {p.human.partnerName ? (
            <>
              <span className="flex items-center" style={{ gap: SPACE_8 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: p.human.partnerRisk === 'anomaly' ? ANOMALY : p.human.partnerRisk === 'watch' ? WATCH : NOMINAL, display: 'inline-block' }} />
                <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{p.human.partnerName}</span>
              </span>
              <span style={{ ...TYPE_CAPTION, color: isolated ? WATCH : TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
                {p.human.distanceM}m away · contact {p.human.lastContactMinutesAgo}m ago · cohesion {p.human.cohesionScore}
                {isolated ? ' — isolated' : ''}
              </span>
            </>
          ) : (
            <span style={{ ...TYPE_BODY, color: TEXT_DIM }}>No rope partner on record</span>
          )}
        </span>

        <span style={{ flex: COLS.predicted }}>
          <span style={{ ...TYPE_CAPTION, color: PREDICTED_COLOR[p.predicted], border: `${BORDER_WIDTH}px solid ${PREDICTED_COLOR[p.predicted]}`, borderRadius: RADIUS_INTERACTIVE, padding: `1px ${SPACE_8}px` }}>
            {PREDICTED_LABEL[p.predicted]}
          </span>
        </span>

        <span className="font-mono" style={{ flex: COLS.within, color: withinColor }}>
          {p.withinHours < 1 ? `${Math.round(p.withinHours * 60)} min` : `${p.withinHours} h`}
        </span>

        <span className="font-mono" style={{ flex: COLS.likelihood, color: TEXT_DIM }}>
          {p.likelihoodPct}%
        </span>

        <span style={{ flex: COLS.driving, color: TEXT_SECONDARY }}>
          {p.drivers.slice(0, 2).map((d) => (
            <div key={d.id} style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal' }}>
              {d.label.length > 46 ? `${d.label.slice(0, 45)}…` : d.label}
              <DriverKindTag kind={d.kind} />
            </div>
          ))}
        </span>

        <span style={{ flex: COLS.issued, color: TEXT_DIM }}>
          <span style={{ ...TYPE_CAPTION, textTransform: 'none', letterSpacing: 'normal' }}>
            issued {formatIssued(p.issuedAt)}
            <br />
            resolves {new Date(p.resolvesAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </span>

        <span style={{ flex: COLS.status }}>
          <span style={{ ...TYPE_CAPTION, color: p.status === 'open' ? TEXT_PRIMARY : TEXT_DIM }}>{STATUS_LABEL[p.status]}</span>
        </span>

        <span style={{ flex: COLS.action }}>
          {p.status === 'open' ? (
            <span className="flex items-center" style={{ gap: SPACE_8 }}>
              <span style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal' }}>{p.recommendedAction.action}</span>
            </span>
          ) : (
            <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>{p.recommendedAction.action}</span>
          )}
        </span>

        <span style={{ flex: COLS.also }}>
          {p.cluster.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
              className="pressable"
              style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textDecoration: 'underline' }}
            >
              {p.cluster.length - 1} linked {expanded ? '▲' : '▼'}
            </button>
          )}
        </span>
      </div>

      {expanded && <ExpandedRow p={p} />}
    </div>
  )
}

function formatIssued(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}

function ExpandedRow({ p }: { p: PersonPrediction }) {
  return (
    <div style={{ padding: `${SPACE_16}px ${PANEL_PADDING}px`, background: PANEL_RAISED, borderTop: `${BORDER_WIDTH}px solid ${HAIRLINE}` }}>
      <div className="grid grid-cols-4" style={{ gap: SPACE_16 }}>
        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>FULL DRIVER BREAKDOWN</p>
          {p.drivers.map((d) => (
            <div key={d.id} style={{ marginTop: SPACE_8 }}>
              <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, textTransform: 'none', letterSpacing: 'normal' }}>
                {d.label} <span style={{ color: TEXT_DIM }}>+{d.contributionPct}%</span>
              </p>
            </div>
          ))}
        </div>
        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>LAST THREE READINGS</p>
          {p.readings.map((r) => (
            <p key={r.label} style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
              {r.label}: {r.points.join(' → ')} {r.trend === 'falling' ? '↓' : r.trend === 'rising' ? '↑' : '→'} {r.trend}
            </p>
          ))}
        </div>
        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>COGNITIVE SNAPSHOT</p>
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_8 }}>Decision capacity {p.cognitive.decisionCapacity} / 100</p>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
            Environmental load {p.cognitive.environmentalLoad} · physiological load {p.cognitive.physiologicalLoad} · working memory {p.cognitive.workingMemory}
          </p>
        </div>
        <div>
          <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>QUICK ACTIONS</p>
          <div className="flex flex-wrap" style={{ gap: SPACE_8, marginTop: SPACE_8 }}>
            {['Acknowledge', 'Assign', 'Override', 'Message'].map((a) => (
              <QuickActionButton key={a} label={a} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickActionButton({ label }: { label: string }) {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      {...handlers}
      className="pressable"
      style={{ ...TYPE_CAPTION, color: TEXT_SECONDARY, textTransform: 'none', letterSpacing: 'normal', border: `${BORDER_WIDTH}px solid ${HAIRLINE}`, borderRadius: RADIUS_INTERACTIVE, padding: `${SPACE_8}px ${SPACE_12}px`, ...focusRingStyle(focused) }}
    >
      {label}
    </button>
  )
}
