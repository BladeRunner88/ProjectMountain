// 8.13.3: Strata's own floating legend, bottom-left — same collapsible
// "Legend ▾/▴" chip shape Network's Legend.tsx already establishes. LAYERS
// is generated from the real current stack (names + real, live stress
// tiers), never the spec's own illustrative five-line example verbatim —
// a 3-layer or 12-layer expedition renders exactly that many rows here.

import {
  ACCENT_AMBER,
  ACCENT_BLUE,
  ACCENT_GREEN,
  ACCENT_ORANGE,
  ACCENT_RED,
  BG_PRIMARY,
  BORDER_LIGHT,
  BORDER_MEDIUM,
  CELL_VESICLE,
  RADIUS_CARD,
  SHADOW_SOFT,
  SPACE_8,
  SPACE_16,
  TEXT_SECONDARY,
  TYPE_PROPERTY_VALUE,
  TYPE_SECTION_LABEL,
} from '../../graph/tokens'
import { STRESS_TIER_CYCLE_MS, STRESS_TIER_LABEL, STRESS_TIER_STROKE_WIDTH, type StrataStressTier } from '../../graph/strataVisuals'

const CELL_ROW: { label: string; color: string }[] = [
  { label: 'READY', color: ACCENT_GREEN },
  { label: 'WATCH', color: ACCENT_AMBER },
  { label: 'IMPAIRED', color: ACCENT_ORANGE },
  { label: 'REQUIRES DESCENT', color: ACCENT_RED },
  { label: 'UNKNOWN', color: CELL_VESICLE },
]

export function StrataLegend({
  expanded,
  onToggle,
  layerRows,
  reducedMotion,
}: {
  expanded: boolean
  onToggle: () => void
  /** Real layer name + real current stress tier, one row per REAL generated layer — never a hardcoded five. */
  layerRows: { name: string; tier: StrataStressTier }[]
  reducedMotion: boolean
}) {
  return (
    <div style={{ position: 'absolute', left: SPACE_16, bottom: SPACE_16 }}>
      {expanded ? (
        <div style={{ background: BG_PRIMARY, border: `1px solid ${BORDER_LIGHT}`, borderRadius: RADIUS_CARD, boxShadow: SHADOW_SOFT, padding: SPACE_16, display: 'flex', flexDirection: 'column', gap: SPACE_8, maxWidth: 280 }}>
          <button type="button" onClick={onToggle} style={{ ...TYPE_PROPERTY_VALUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', alignSelf: 'flex-start' }}>
            Legend ▴
          </button>

          <div>
            <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', marginBottom: SPACE_8 / 2 }}>Tree</p>
            <div className="flex flex-col" style={{ gap: 2 }}>
              <div className="flex items-center" style={{ gap: SPACE_8 }}>
                <svg width={14} height={14} style={{ flexShrink: 0 }}>
                  <circle cx={7} cy={7} r={6} fill={ACCENT_GREEN} />
                </svg>
                <span style={TYPE_PROPERTY_VALUE}>Node</span>
                <span style={{ ...TYPE_PROPERTY_VALUE, color: TEXT_SECONDARY }}>route or expedition</span>
              </div>
              <div className="flex items-center" style={{ gap: SPACE_8 }}>
                <svg width={14} height={14} style={{ flexShrink: 0 }}>
                  <rect x={2} y={2} width={10} height={10} rx={2} fill={CELL_VESICLE} stroke={BORDER_MEDIUM} />
                </svg>
                <span style={TYPE_PROPERTY_VALUE}>Leaf</span>
                <span style={{ ...TYPE_PROPERTY_VALUE, color: TEXT_SECONDARY }}>climber</span>
              </div>
              <div className="flex items-center" style={{ gap: SPACE_8 }}>
                <svg width={14} height={14} style={{ flexShrink: 0 }}>
                  <line x1={1} y1={12} x2={13} y2={2} stroke={ACCENT_BLUE} strokeWidth={1.5} />
                </svg>
                <span style={TYPE_PROPERTY_VALUE}>Link</span>
                <span style={{ ...TYPE_PROPERTY_VALUE, color: TEXT_SECONDARY }}>real parent-child chain</span>
              </div>
            </div>
          </div>

          <div>
            <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', marginBottom: SPACE_8 / 2 }}>
              Layers{reducedMotion ? ' — stroke weight' : ' — pulse speed'}
            </p>
            <div className="flex flex-col" style={{ gap: 2 }}>
              {layerRows.map((row) => (
                <div key={row.name} className="flex items-center justify-between" style={{ gap: SPACE_8 }}>
                  <span style={TYPE_PROPERTY_VALUE}>{row.name}</span>
                  <span style={{ ...TYPE_PROPERTY_VALUE, color: TEXT_SECONDARY }}>
                    {STRESS_TIER_LABEL[row.tier]} {reducedMotion ? `${STRESS_TIER_STROKE_WIDTH[row.tier]}px` : `${(STRESS_TIER_CYCLE_MS[row.tier] / 1000).toFixed(1)}s`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', marginBottom: SPACE_8 / 2 }}>Leaves — readiness colour</p>
            <div className="flex flex-col" style={{ gap: 2 }}>
              {CELL_ROW.map((c) => (
                <div key={c.label} className="flex items-center" style={{ gap: SPACE_8 }}>
                  <svg width={14} height={14} style={{ flexShrink: 0 }}>
                    <rect x={2} y={2} width={10} height={10} rx={2} fill={c.color} />
                  </svg>
                  <span style={TYPE_PROPERTY_VALUE}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p style={{ ...TYPE_SECTION_LABEL, textTransform: 'uppercase', marginBottom: SPACE_8 / 2 }}>Size — more sensors</p>
            <div className="flex items-center" style={{ gap: SPACE_16 }}>
              <SizeSwatch r={4} label="1–2" />
              <SizeSwatch r={5} label="3–4" />
              <SizeSwatch r={6} label="5+" />
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          style={{ ...TYPE_PROPERTY_VALUE, background: BG_PRIMARY, border: `1px solid ${BORDER_LIGHT}`, borderRadius: RADIUS_CARD, boxShadow: SHADOW_SOFT, padding: `${SPACE_8}px ${SPACE_16}px`, cursor: 'pointer', color: TEXT_SECONDARY }}
        >
          Legend ▾
        </button>
      )}
    </div>
  )
}

function SizeSwatch({ r, label }: { r: number; label: string }) {
  const side = r * 1.8
  return (
    <div className="flex items-center" style={{ gap: SPACE_8 / 2 }}>
      <svg width={14} height={14} style={{ flexShrink: 0 }}>
        <rect x={7 - side / 2} y={7 - side / 2} width={side} height={side} rx={side * 0.22} fill={TEXT_SECONDARY} />
      </svg>
      <span style={TYPE_PROPERTY_VALUE}>{label}</span>
    </div>
  )
}
