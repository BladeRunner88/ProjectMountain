import type { ReactNode } from 'react'
import { PAGE_GUTTER, SPACE_8, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY, TYPE_BODY, TYPE_CAPTION, WATCH } from '../../ase/tokens'
import { formatHistoricalMoment } from '../../ase/bitemporal'
import { useAsOf } from '../../ase/asOfContext'
import type { TabDef } from './tabs'

// Below the bar, per tab (S1d): name + stage, one sentence, and a right slot
// for sub-nav pills / the filter control. S3 adds a third line, shown on
// every tab (including the still-stubbed ones) whenever the shell is
// scrubbed off live — the one thing that has to be true everywhere at once.

export function SectionHeader({ tab, right }: { tab: TabDef; right?: ReactNode }) {
  const { at } = useAsOf()

  return (
    <div className="flex items-start justify-between" style={{ padding: `${PAGE_GUTTER}px ${PAGE_GUTTER}px 0` }}>
      <div>
        <p style={{ ...TYPE_BODY, color: TEXT_PRIMARY }}>
          {tab.label}
          <span style={{ ...TYPE_CAPTION, color: TEXT_DIM, marginLeft: SPACE_8 }}> · {tab.stage}</span>
        </p>
        <p style={{ ...TYPE_BODY, color: TEXT_SECONDARY, marginTop: SPACE_8 }}>{tab.description}</p>
        {at !== 'now' && (
          <p style={{ ...TYPE_BODY, color: WATCH, marginTop: SPACE_8 }}>Showing what ASE knew at {formatHistoricalMoment(at)}.</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
