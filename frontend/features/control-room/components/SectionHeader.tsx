'use client'

import type { ReactElement, ReactNode } from 'react'
import { PAGE_GUTTER, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION, WATCH } from '@/features/ase/tokens'
import { formatHistoricalMoment } from '@/features/ase/services/bitemporal'
import { useAsOf } from '@/features/ase/client'
import type { TabDef } from '../types/tabs'

export interface SectionHeaderProps {
  tab: TabDef
  right?: ReactNode
}

export function SectionHeader({ tab, right }: SectionHeaderProps): ReactElement {
  const { at } = useAsOf()

  return (
    <div className="flex items-start justify-between" style={{ padding: `${PAGE_GUTTER}px ${PAGE_GUTTER}px 0` }}>
      <div>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
          {tab.label}
          <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginLeft: SPACE_8 }}> · {tab.stage}</span>
        </p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{tab.description}</p>
        {at !== 'now' ? (
          <p style={{ ...TYPE_BODY, color: WATCH, marginTop: SPACE_8 }}>Showing what ASE knew at {formatHistoricalMoment(at)}.</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}
