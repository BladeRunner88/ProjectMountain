import {
  BORDER_WIDTH,
  HAIRLINE,
  RADIUS_INTERACTIVE,
  SPACE_8,
  SPACE_12,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_CAPTION,
} from '../../ase/tokens'
import { useDensity } from './useDensity'
import { focusRingStyle, useFocusRing } from './focusRing'

// "Density toggle in the section header" (S1e) — reads/writes the same
// persisted preference EvidenceTable itself reads, via useDensity's
// same-tab custom-event sync. Lives in the section header's `right` slot,
// not inside EvidenceTable, since a tab may show the table below other
// content the header still needs to sit above.
export function DensityToggle() {
  const [density, toggle] = useDensity()
  const { focused, handlers } = useFocusRing()

  return (
    <button
      type="button"
      onClick={toggle}
      {...handlers}
      aria-label={`Row density: ${density}. Click to switch to ${density === 'compact' ? 'comfortable' : 'compact'}.`}
      className="pressable"
      style={{
        ...TYPE_CAPTION,
        textTransform: 'none',
        letterSpacing: 'normal',
        color: TEXT_SECONDARY,
        border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
        borderRadius: RADIUS_INTERACTIVE,
        padding: `${SPACE_8}px ${SPACE_12}px`,
        ...focusRingStyle(focused),
      }}
    >
      <span style={{ color: density === 'comfortable' ? TEXT_PRIMARY : TEXT_SECONDARY }}>Comfortable</span>
      {' / '}
      <span style={{ color: density === 'compact' ? TEXT_PRIMARY : TEXT_SECONDARY }}>Compact</span>
    </button>
  )
}
