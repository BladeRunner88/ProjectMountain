'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useSelection } from '@/features/ase/client'

import { TABS } from '../types/tabs'
import { useInspectorChrome } from './useInspectorChrome'

export interface ControlRoomKeyboardOptions {
  paletteOpen: boolean
  openPalette: () => void
  closePalette: () => void
}

export function useControlRoomKeyboard({
  paletteOpen,
  openPalette,
  closePalette,
}: ControlRoomKeyboardOptions): void {
  const router = useRouter()
  const { select } = useSelection()
  const { toggleCollapsed } = useInspectorChrome()

  useEffect(() => {
    function isTypingTarget(el: Element | null): boolean {
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openPalette()
        return
      }

      if (paletteOpen) {
        if (e.key === 'Escape') closePalette()
        return
      }

      if (isTypingTarget(document.activeElement)) return

      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggleCollapsed()
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape') {
        select(null)
        return
      }

      const tab = TABS.find((t) => t.key === e.key)
      if (tab) {
        e.preventDefault()
        router.push(tab.href)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [router, select, toggleCollapsed, paletteOpen, openPalette, closePalette])
}
