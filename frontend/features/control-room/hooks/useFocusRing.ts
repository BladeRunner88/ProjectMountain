'use client'

import { useState } from 'react'

export interface FocusRingHandlers {
  onFocus: () => void
  onBlur: () => void
}

export interface FocusRingValue {
  focused: boolean
  handlers: FocusRingHandlers
}

export function useFocusRing(): FocusRingValue {
  const [focused, setFocused] = useState(false)
  return {
    focused,
    handlers: {
      onFocus: (): void => {
        setFocused(true)
      },
      onBlur: (): void => {
        setFocused(false)
      },
    },
  }
}
