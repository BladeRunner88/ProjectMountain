import { useState } from 'react'
import type { CSSProperties } from 'react'
import { FOCUS_RING_OFFSET, FOCUS_RING_WIDTH, NOMINAL } from '../../ase/tokens'

// "The focus ring must always be visible" (S1d) applies to every interactive
// element in the shell. Tailwind's `focus-visible:` utilities can't take a
// token value without hardcoding the hex/px into the className string as a
// literal (JIT needs a static string), so the ring is an inline style driven
// entirely from tokens.ts instead, toggled by plain focus/blur state.

export function useFocusRing() {
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
