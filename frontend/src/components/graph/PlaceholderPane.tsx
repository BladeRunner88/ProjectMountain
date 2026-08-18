// 8.3: "Wire the view switcher to render three placeholder panes reading
// NETWORK / STRATA / TERRAIN. No graph yet." — replaced view-by-view once
// each view's own block lands.

import { BG_PRIMARY, TEXT_TERTIARY, TYPE_PANEL_HEADING } from '../../graph/tokens'

export function PlaceholderPane({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', background: BG_PRIMARY }}>
      <span style={{ ...TYPE_PANEL_HEADING, color: TEXT_TERTIARY }}>{label}</span>
    </div>
  )
}
