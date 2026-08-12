// S8.8: HOVER tooltip — "name, serial and status" for an entity, "kind,
// timestamp and one-line summary" for a sub-node. Purely presentational:
// the caller resolves `info` once via graph/tooltipInfo.ts's precomputed
// index. Positioned `fixed` off raw client coords — every caller (NETWORK's
// SVG layer, STRATA, TERRAIN) can hand it a PointerEvent's clientX/clientY
// directly with no per-view bounding-rect math.

import { ANOMALY_RED, WATCH_AMBER } from '../../graph/tokens'
import { BORDER_WIDTH, PANEL, TEXT_DIM, TEXT_PRIMARY, TEXT_SECONDARY } from '../../ase/tokens'
import type { TooltipInfo } from '../../graph/tooltipInfo'

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

export function EntityTooltip({ info, x, y, watch }: { info: TooltipInfo | null; x: number; y: number; watch?: boolean }) {
  if (!info) return null

  return (
    <div
      className="pointer-events-none fixed font-mono"
      style={{
        left: x + 14,
        top: y + 14,
        zIndex: 50,
        background: PANEL,
        border: `${BORDER_WIDTH}px solid ${TEXT_DIM}`,
        padding: '6px 9px',
        fontSize: 10,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        maxWidth: 260,
      }}
    >
      {info.kind === 'entity' ? (
        <>
          <div style={{ color: TEXT_PRIMARY }}>{info.label}</div>
          <div style={{ color: TEXT_SECONDARY }}>
            {info.serial} · {info.tier.toUpperCase()}
          </div>
          <div style={{ color: info.status === 'anomaly' ? ANOMALY_RED : watch ? WATCH_AMBER : TEXT_DIM }}>
            {info.status === 'anomaly' ? 'ANOMALY' : watch ? 'WATCH' : 'NOMINAL'}
          </div>
        </>
      ) : (
        <>
          <div style={{ color: TEXT_PRIMARY }}>{info.subKind.toUpperCase()}</div>
          <div style={{ color: TEXT_SECONDARY }}>{formatTimestamp(info.ts)}</div>
          <div style={{ color: TEXT_DIM, whiteSpace: 'normal' }}>{info.summary}</div>
        </>
      )}
    </div>
  )
}
