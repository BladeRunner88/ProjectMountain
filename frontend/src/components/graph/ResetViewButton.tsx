// 8.3: "Mounted but hidden. Appears only when zoom, pan or filters differ
// from default." — always rendered (never conditionally mounted), so the
// `visible` prop only ever toggles opacity/pointer-events, matching that
// literally rather than unmount/remounting the button on every filter
// change.

import { SPACE_16, TEXT_TERTIARY, TYPE_RESET_VIEW } from '../../graph/tokens'

export function ResetViewButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...TYPE_RESET_VIEW,
        position: 'absolute',
        top: SPACE_16,
        right: SPACE_16,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        color: TEXT_TERTIARY,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 120ms ease-out',
      }}
    >
      RESET VIEW
    </button>
  )
}
