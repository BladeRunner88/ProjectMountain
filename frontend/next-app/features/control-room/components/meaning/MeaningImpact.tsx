'use client'

import { useMemo, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import {
  BORDER_WIDTH,
  HAIRLINE,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  RADIUS_STATIC,
  SPACE_8,
  SPACE_16,
  SPACE_32,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
} from '@/features/ase/tokens'
import { allTraced } from '@/features/ase/services/graph'
import { recentChanges } from '@/features/ase/services/activity'
import { confidence, counterfactual, dependents } from '@/features/ase/services/folds'
import type { Dataset } from '@/features/ase/services/dataset'
import type { Reading } from '@/features/ase/services/contextEngine'
import type { TracedId, TracedValue } from '@/features/ase/services/traced'
import type { TabId } from '@/features/ase/types/tabs'
import { focusRingStyle, PersonBadge, tabHref, type TabRoute, useFocusRing } from '@/features/control-room'

interface ReasoningLink {
  question: string
  hopSummary: string
}
interface FindingLink {
  reason: string
  ownerTab: TabId
}
interface CounterfactualTarget {
  targetTraced: TracedValue<unknown>
  describe: string
  navigateTo: TabRoute
}

export function MeaningImpact({ reading, dataset }: { reading: Reading; dataset: Dataset }): ReactElement {
  const router = useRouter()

  const analysis = useMemo(() => {
    const rawTvs = [...reading.rawFieldTvs.values()]
    const rawIds = new Set(rawTvs.map((tv) => tv.id))
    const allDependentIds = new Set<TracedId>()
    for (const tv of rawTvs) for (const d of dependents(tv.id)) allDependentIds.add(d)

    const changes = recentChanges(allTraced(), 500).filter((c) => rawIds.has(c.newId))

    const reasoningLinks: ReasoningLink[] = []
    for (const answer of dataset.reasoningEngine.answers.values()) {
      if (allDependentIds.has(answer.cause.id)) {
        reasoningLinks.push({ question: answer.question, hopSummary: 'the conclusion itself' })
        continue
      }
      const hop = answer.chain.find((h) => allDependentIds.has(h.traced.id))
      if (hop) reasoningLinks.push({ question: answer.question, hopSummary: hop.summary })
    }

    const findingLinks: FindingLink[] = dataset.findings
      .filter((f) => allDependentIds.has(f.traced.id))
      .map((f) => ({ reason: f.reason, ownerTab: f.ownerTab }))

    const headlineRawTv = reading.rawFieldTvs.get(reading.headlineFieldKey)
    let cfTarget: CounterfactualTarget | null = null
    if (headlineRawTv) {
      const headlineDependents = new Set(dependents(headlineRawTv.id))
      for (const answer of dataset.reasoningEngine.answers.values()) {
        if (headlineDependents.has(answer.cause.id)) {
          cfTarget = { targetTraced: answer.cause as TracedValue<unknown>, describe: answer.question, navigateTo: tabHref('reasoning') }
          break
        }
      }
      if (!cfTarget) {
        const finding = dataset.findings.find((f) => headlineDependents.has(f.traced.id))
        if (finding) cfTarget = { targetTraced: finding.traced as TracedValue<unknown>, describe: finding.reason, navigateTo: tabHref(finding.ownerTab) }
      }
    }

    return { allDependentIds, changes, reasoningLinks, findingLinks, cfTarget, headlineRawTv }
  }, [reading, dataset])

  return (
    <div>
      <WhoItConcerns reading={reading} />
      <WhatItChanged reading={reading} changes={analysis.changes} dependentCount={analysis.allDependentIds.size} />
      <WhatItContributedTo
        reasoningLinks={analysis.reasoningLinks}
        findingLinks={analysis.findingLinks}
        onNavigate={(path) => router.push(path)}
      />
      <IfThisReadingWereWrong
        cfTarget={analysis.cfTarget}
        headlineRawTv={analysis.headlineRawTv ?? null}
        onNavigate={(path) => router.push(path)}
      />
    </div>
  )
}

function WhoItConcerns({ reading }: { reading: Reading }): ReactElement {
  const { about } = reading
  return (
    <div>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHO IT CONCERNS</p>
      <div style={{ marginTop: SPACE_16 }}>
        {about.kind === 'climber' ? (
          <PersonBadge climberId={about.climberId} name={about.label} serial={about.serial} />
        ) : (
          <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>{about.label}</p>
        )}
      </div>
    </div>
  )
}

function WhatItChanged({
  reading,
  changes,
  dependentCount,
}: {
  reading: Reading
  changes: { sentence: string }[]
  dependentCount: number
}): ReactElement {
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHAT IT CHANGED</p>
      <div style={{ marginTop: SPACE_16 }}>
        {changes.length > 0 ? (
          changes.map((c, i) => (
            <p
              key={`${c.sentence}-${i}`}
              style={{
                ...TYPE_BODY,
                color: TEXT_PRIMARY,
                marginTop: i === 0 ? 0 : SPACE_8,
                textTransform: 'none',
                letterSpacing: 'normal',
              }}
            >
              {c.sentence}
            </p>
          ))
        ) : (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
            This is the first reading ASE has for these fields — no prior value to compare.
          </p>
        )}
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8, textTransform: 'none', letterSpacing: 'normal' }}>
          {reading.bound.length} value{reading.bound.length === 1 ? '' : 's'} bound on this reading; {dependentCount} value
          {dependentCount === 1 ? '' : 's'} elsewhere in the graph depend on them.
        </p>
      </div>
    </div>
  )
}

function WhatItContributedTo({
  reasoningLinks,
  findingLinks,
  onNavigate,
}: {
  reasoningLinks: ReasoningLink[]
  findingLinks: FindingLink[]
  onNavigate: (path: TabRoute) => void
}): ReactElement {
  const hasAny = reasoningLinks.length > 0 || findingLinks.length > 0
  return (
    <div style={{ marginTop: SPACE_32 }}>
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>WHAT IT CONTRIBUTED TO</p>
      <div style={{ marginTop: SPACE_16 }}>
        {!hasAny ? (
          <p style={{ ...TYPE_BODY, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}>
            Nothing yet derives from this reading in the current graph.
          </p>
        ) : null}
        {findingLinks.map((f, i) => (
          <ContributionRow key={`f-${i}`} text={f.reason} onClick={() => onNavigate(tabHref(f.ownerTab))} />
        ))}
        {reasoningLinks.map((r, i) => (
          <ContributionRow key={`r-${i}`} text={`"${r.question}" — via ${r.hopSummary}`} onClick={() => onNavigate(tabHref('reasoning'))} />
        ))}
      </div>
    </div>
  )
}

function ContributionRow({ text, onClick }: { text: string; onClick: () => void }): ReactElement {
  const { focused, handlers } = useFocusRing()
  return (
    <button
      type="button"
      onClick={onClick}
      {...handlers}
      className="pressable block text-left"
      style={{
        ...TYPE_BODY,
        color: TEXT_SECONDARY,
        textTransform: 'none',
        letterSpacing: 'normal',
        padding: `${SPACE_8}px 0`,
        borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        width: '100%',
        ...focusRingStyle(focused),
      }}
    >
      {text}
    </button>
  )
}

function IfThisReadingWereWrong({
  cfTarget,
  headlineRawTv,
  onNavigate,
}: {
  cfTarget: CounterfactualTarget | null
  headlineRawTv: TracedValue<unknown> | null
  onNavigate: (path: TabRoute) => void
}): ReactElement {
  const { focused, handlers } = useFocusRing()

  if (!cfTarget || !headlineRawTv) {
    return (
      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>IF THIS READING WERE WRONG</p>
        <p style={{ ...TYPE_BODY, color: TEXT_DIM, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
          Nothing downstream depends on this reading&apos;s headline fact yet — removing it would change nothing.
        </p>
      </div>
    )
  }

  const before = Math.round(confidence(cfTarget.targetTraced) * 100)
  const result = counterfactual(cfTarget.targetTraced, { remove: [headlineRawTv.id] })
  const after = Math.round(result.confidence * 100)

  return (
    <div
      style={{
        marginTop: SPACE_32,
        padding: SPACE_16,
        background: PANEL_RAISED,
        borderRadius: RADIUS_STATIC,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
      }}
    >
      <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>IF THIS READING WERE WRONG</p>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY, marginTop: SPACE_16, textTransform: 'none', letterSpacing: 'normal' }}>
        Without it, &quot;{cfTarget.describe}&quot; moves from {before}% confidence to {after}%
        {after < 50 && before >= 50 ? ' — no longer confident enough to stand on its own' : ''}.
      </p>
      <button
        type="button"
        onClick={() => onNavigate(cfTarget.navigateTo)}
        {...handlers}
        className="pressable"
        style={{
          ...TYPE_CAPTION,
          textTransform: 'none',
          letterSpacing: 'normal',
          color: TEXT_SECONDARY,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          padding: `${SPACE_8}px ${SPACE_16}px`,
          marginTop: SPACE_16,
          cursor: 'pointer',
          ...focusRingStyle(focused),
        }}
      >
        SEE WHERE THIS IS USED
      </button>
    </div>
  )
}
