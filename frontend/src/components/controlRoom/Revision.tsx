import {
  ACCENT_INDICATOR_WIDTH,
  BORDER_WIDTH,
  HAIRLINE,
  HUMAN,
  PAGE_GUTTER,
  ROW_HEIGHT_DEFAULT,
  SPACE_8,
  SPACE_16,
  SPACE_32,
  STATUS_DOT_SIZE,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  VERIFIED,
} from '../../ase/tokens'
import { useDataset } from '../../ase/store'
import { useSelection } from '../../ase/selection'
import { formatElapsed } from '../../ase/activity'
import { confidence } from '../../ase/folds'
import { CONFLICT_STRATEGY_LABEL, type Conflict, type ConflictPolicy } from '../../ase/conflict'
import type { IdentityRecord } from '../../ase/identityRecord'
import { focusRingStyle, useFocusRing } from './focusRing'
import { PersonBadge } from './PersonBadge'
import { RecommendationCard, type Recommendation } from './RecommendationCard'

// S9.4: this is where a human-required conflict "sits unresolved" (the
// mountains-climbed scenario), and where every CHANGE POLICY action taken
// elsewhere in the Control Room is recorded — "corrections a person has
// made, and everything downstream that changed as a result," now literally
// true rather than aspirational stub copy.
//
// S9.6b convention #1: a person is never named without their serial —
// applied below wherever a conflict's `entityLabel` actually is a person
// (some conflicts, like ambient pressure on a route, are about a place or
// a sensor instead, and stay plain text).
export function Revision() {
  const { dataset, revisionLog, changeConflictPolicy } = useDataset()
  const { select, selection } = useSelection()

  const pending = dataset.conflicts.filter((c) => c.resolved === null)
  const climberByName = new Map(Array.from(dataset.identityRecords.values()).map((r) => [r.who.fullLegalName.value, r]))

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>NEEDS A DECISION</p>
      <div style={{ marginTop: SPACE_16, marginBottom: SPACE_32 }}>
        {pending.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Nothing waiting on a human right now.</p>
        ) : (
          pending.map((c) => (
            <PendingRow
              key={c.id}
              conflict={c}
              person={climberByName.get(c.entityLabel)}
              selected={selection?.kind === 'conflict' && selection.conflict.id === c.id}
              onSelect={() => select({ kind: 'conflict', conflict: c })}
              changeConflictPolicy={changeConflictPolicy}
            />
          ))
        )}
      </div>

      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>RECENT CHANGES</p>
      <div style={{ marginTop: SPACE_16 }}>
        {revisionLog.length === 0 ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>No corrections yet this session.</p>
        ) : (
          revisionLog.map((entry) => (
            <p
              key={entry.id}
              style={{
                ...TYPE_BODY,
                color: TEXT_SECONDARY,
                paddingTop: SPACE_8,
                paddingBottom: SPACE_8,
                borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
              }}
            >
              <span style={{ color: TEXT_PRIMARY }}>{entry.sentence}</span>
              {' — '}
              <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{formatElapsed(entry.at)}</span>
            </p>
          ))
        )}
      </div>
    </div>
  )
}

// S9.6b convention #3: every queue item leads with what ASE recommends and
// why, so a human is confirming a judgement rather than making one from
// scratch — the recommendation is a real preview of `conflict`'s own
// non-human-required policy (never a canned suggestion), with its own real
// folded confidence.
function recommendationFor(conflict: Conflict, changeConflictPolicy: (c: Conflict, p: ConflictPolicy) => void): Recommendation | null {
  const candidate = conflict.availablePolicies.find((p) => p.strategy !== 'human-required')
  if (!candidate) return null
  const preview = conflict.resolve(candidate)
  if (!preview) return null
  return {
    id: `revision-rec-${conflict.id}`,
    action: `Resolve using ${CONFLICT_STRATEGY_LABEL[candidate.strategy]}`,
    why: `${candidate.rationale} That would set ${conflict.propertyLabel.toLowerCase()} to ${conflict.format(preview.value)}.`,
    confidencePct: Math.round(confidence(preview) * 100),
    ifYouDoNothing: `${conflict.entityLabel}'s ${conflict.propertyLabel.toLowerCase()} stays unresolved, and everything downstream of it stays blocked on a human decision.`,
    doneLabel: 'DONE — POLICY CHANGED',
    onRun: () => changeConflictPolicy(conflict, candidate),
  }
}

function PendingRow({
  conflict,
  person,
  selected,
  onSelect,
  changeConflictPolicy,
}: {
  conflict: Conflict
  person: IdentityRecord | undefined
  selected: boolean
  onSelect: () => void
  changeConflictPolicy: (c: Conflict, p: ConflictPolicy) => void
}) {
  const { focused, handlers } = useFocusRing()
  const rec = recommendationFor(conflict, changeConflictPolicy)

  return (
    <div style={{ borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`, paddingBottom: SPACE_16, marginBottom: SPACE_16 }}>
      <div
        role="row"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect()
        }}
        {...handlers}
        className="flex cursor-pointer items-center justify-between"
        style={{
          height: ROW_HEIGHT_DEFAULT,
          borderLeft: `${ACCENT_INDICATOR_WIDTH}px solid ${selected ? VERIFIED : 'transparent'}`,
          paddingLeft: SPACE_8,
          ...focusRingStyle(focused),
        }}
      >
        <div className="flex items-center" style={{ gap: SPACE_8 }}>
          <span
            aria-hidden
            style={{ width: STATUS_DOT_SIZE, height: STATUS_DOT_SIZE, borderRadius: '50%', background: HUMAN, display: 'inline-block' }}
          />
          {person ? (
            <PersonBadge climberId={person.climberId} name={person.who.fullLegalName.value} serial={person.serial.value} />
          ) : (
            <span style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{conflict.entityLabel}</span>
          )}
          <span style={{ ...TYPE_BODY, color: TEXT_DIM }}>·</span>
          <span style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>{conflict.propertyLabel}</span>
        </div>
        <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>
          {conflict.aOrigin} vs {conflict.bOrigin}
        </span>
      </div>
      {rec ? (
        <RecommendationCard rec={rec} />
      ) : (
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          No automatic resolution applies here — every available policy needs a human.
        </p>
      )}
    </div>
  )
}
