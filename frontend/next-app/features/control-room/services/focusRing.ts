import type { CSSProperties } from 'react'
import { FOCUS_RING_OFFSET, FOCUS_RING_WIDTH, NOMINAL } from '@/features/ase/tokens'

export function focusRingStyle(focused: boolean): CSSProperties {
  return focused
    ? { outline: `${FOCUS_RING_WIDTH}px solid ${NOMINAL}`, outlineOffset: FOCUS_RING_OFFSET }
    : { outline: 'none' }
}
