'use client'

import type { ReactElement } from 'react'
import {
  BORDER_WIDTH,
  HAIRLINE,
  RADIUS_INTERACTIVE,
  SPACE_8,
  SPACE_12,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_CAPTION,
} from '@/features/ase/tokens'
import { useDensity } from '../hooks/useDensity'
import { useFocusRing } from '../hooks/useFocusRing'
import { focusRingStyle } from '../services/focusRing'

export function DensityToggle(): ReactElement {
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
