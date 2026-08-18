// 8.13-ui: the redesign spec's floating zoom stack (bottom-right, above the
// minimap) — zoom itself was already gesture-only (wheel/pinch/double-
// click) and fully working; this just gives it a visible button affordance,
// reusing that exact same tween/clamp path (GraphCanvas.tsx's own
// `animatePanZoomTo`), not new zoom logic.

import { BG_PRIMARY, BORDER_LIGHT, RADIUS_CARD, SHADOW_SOFT, SPACE_16, TEXT_SECONDARY, TYPE_PANEL_SUBHEADING } from '../../graph/tokens'

const ZOOM_STACK_WIDTH_PX = 32
const ZOOM_STACK_BUTTON_HEIGHT_PX = 32
const ZOOM_STACK_BOTTOM_OFFSET_PX = 156 // sits directly above the 130px-tall minimap + its own 16px gap

export function ZoomControls({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <div
      className="absolute flex flex-col"
      style={{
        bottom: ZOOM_STACK_BOTTOM_OFFSET_PX,
        right: SPACE_16,
        width: ZOOM_STACK_WIDTH_PX,
        background: BG_PRIMARY,
        border: `1px solid ${BORDER_LIGHT}`,
        borderRadius: RADIUS_CARD,
        overflow: 'hidden',
        boxShadow: SHADOW_SOFT,
        zIndex: 10,
      }}
    >
      <ZoomButton label="+" ariaLabel="Zoom in" onClick={onZoomIn} />
      <div style={{ height: 1, background: BORDER_LIGHT }} />
      <ZoomButton label="−" ariaLabel="Zoom out" onClick={onZoomOut} />
    </div>
  )
}

function ZoomButton({ label, ariaLabel, onClick }: { label: string; ariaLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex items-center justify-center"
      style={{ ...TYPE_PANEL_SUBHEADING, height: ZOOM_STACK_BUTTON_HEIGHT_PX, color: TEXT_SECONDARY, background: 'none', border: 'none', cursor: 'pointer' }}
    >
      {label}
    </button>
  )
}
