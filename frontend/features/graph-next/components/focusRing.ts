'use client'

import { useState, type CSSProperties, type FocusEventHandler } from 'react'
import { FOCUS_RING_OFFSET, FOCUS_RING_WIDTH, NOMINAL } from '@/features/ase/tokens'

export interface FocusRing {
  focused: boolean
  handlers: {
    onFocus: FocusEventHandler
    onBlur: FocusEventHandler
  }
}

export function useFocusRing(): FocusRing {
  const [focused, setFocused] = useState(false)
  return {
    focused,
    handlers: {
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
  }
}

export function focusRingStyle(focused: boolean): CSSProperties {
  return focused
    ? { outline: `${FOCUS_RING_WIDTH}px solid ${NOMINAL}`, outlineOffset: FOCUS_RING_OFFSET }
    : { outline: 'none' }
}
