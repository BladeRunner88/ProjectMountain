'use client'

import type { ReactElement } from 'react'
import Link from 'next/link'
import {
  ANOMALY,
  NOMINAL,
  PAGE_GUTTER,
  SPACE_16,
  SPACE_24,
  SPACE_32,
  SPACE_8,
  STATUS_DOT_SIZE,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  WATCH,
} from '@/features/ase/tokens'
import { Metric, useDataset } from '@/features/ase/client'
import type { NeedsYouRow as NeedsYouRowData, PipelineStage } from '@/features/ase/services/dataset'
import type { TracedValue } from '@/features/ase/services/traced'
import { tabHref } from '../types/tabs'
import { EvidenceStrip } from './EvidenceStrip'

export function Overview(): ReactElement {
  const { dataset } = useDataset()

  return (
    <div style={{ padding: PAGE_GUTTER }}>
      <EvidenceStrip sources={dataset.sources} />

      <div className="grid grid-cols-4" style={{ gap: SPACE_24, marginTop: SPACE_32 }}>
        <Headline
          traced={dataset.headline.entitiesTracked}
          label="Entities tracked"
          ownerTab="model"
          explainer="Resolved things ASE currently knows about."
        />
        <Headline
          traced={dataset.headline.factsHeld}
          label="Facts held"
          ownerTab="model"
          explainer="Individually traced values in the graph right now."
        />
        <Headline
          traced={dataset.headline.meanConfidencePct}
          label="Mean confidence"
          ownerTab="trust"
          explainer="The average fold across every entity ASE has resolved."
          format={(v) => `${v}%`}
        />
        <Headline
          traced={dataset.headline.openIssues}
          label="Open issues"
          ownerTab="detection"
          explainer="Discrepancies flagged and not yet resolved."
        />
      </div>

      <div style={{ marginTop: SPACE_32 }}>
        <p style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>NEEDS YOU</p>
        <div style={{ marginTop: SPACE_16 }}>
          {dataset.needsYou.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM }}>Nothing waiting on you.</p>
          ) : (
            dataset.needsYou.map((row) => <NeedsYouRow key={row.id} row={row} />)
          )}
        </div>
      </div>

      <HealthLine stages={dataset.stages} />
    </div>
  )
}

function Headline({
  traced,
  label,
  ownerTab,
  explainer,
  format,
}: {
  traced: TracedValue<number>
  label: string
  ownerTab: string
  explainer: string
  format?: (v: number) => string
}): ReactElement {
  return (
    <div>
      <Metric traced={traced} label={label} ownerTab={ownerTab} size="display" format={format} />
      <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{explainer}</p>
    </div>
  )
}

function NeedsYouRow({ row }: { row: NeedsYouRowData }): ReactElement {
  return (
    <div className="flex items-center justify-between" style={{ paddingTop: SPACE_8, paddingBottom: SPACE_8 }}>
      <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
        <Metric traced={row.count} label="Count" /> {row.sentence}
      </p>
      <Link
        href={tabHref(row.destinationTab)}
        style={{ ...TYPE_CAPTION, color: TEXT_DIM, textTransform: 'none', letterSpacing: 'normal' }}
      >
        Review →
      </Link>
    </div>
  )
}

function HealthLine({ stages }: { stages: PipelineStage[] }): ReactElement {
  const degraded = stages.filter((s) => s.state === 'degraded').length
  const catchingUp = stages.filter((s) => s.state === 'catching_up').length
  const color = degraded > 0 ? ANOMALY : catchingUp > 0 ? WATCH : NOMINAL
  const text =
    degraded > 0
      ? `${degraded} stage${degraded === 1 ? ' is' : 's are'} degraded.`
      : catchingUp > 0
        ? `${catchingUp} stage${catchingUp === 1 ? ' is' : 's are'} catching up. Everything else is running normally.`
        : 'Every stage is running normally.'

  return (
    <div className="flex items-center" style={{ gap: SPACE_8, marginTop: SPACE_32 }}>
      <span
        aria-hidden
        style={{ width: STATUS_DOT_SIZE, height: STATUS_DOT_SIZE, borderRadius: '50%', background: color, display: 'inline-block' }}
      />
      <Link href={tabHref('processing')} style={{ ...TYPE_BODY, color: TEXT_SECONDARY }}>
        {text} View Processing →
      </Link>
    </div>
  )
}
