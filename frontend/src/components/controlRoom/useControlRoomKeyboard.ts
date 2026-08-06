import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TABS } from './tabs'
import { useInspectorChrome } from './InspectorContext'
import { useSelection } from '../../ase/selection'

// "The Control Room must be fully operable without a mouse" (S1d):
// 1-9,0,- jump to tabs · Esc clears the selection (or closes the command
// palette, if it's open) · Cmd/Ctrl+\ toggles the inspector · Cmd/Ctrl+K
// opens the command palette (9.1e). Tab/Enter need no handler: they're the
// browser's own focus and activation behaviour on real, focusable elements.
export function useControlRoomKeyboard({
  paletteOpen,
  openPalette,
  closePalette,
}: {
  paletteOpen: boolean
  openPalette: () => void
  closePalette: () => void
}) {
  const navigate = useNavigate()
  const { select } = useSelection()
  const { toggleCollapsed } = useInspectorChrome()

  useEffect(() => {
    function isTypingTarget(el: Element | null): boolean {
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
    }

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openPalette()
        return
      }

      // The palette owns the keyboard while open (its own input, arrow keys,
      // Enter) — this hook only still handles the key that closes it.
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
        navigate(`/app/control-room/${tab.id}`)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigate, select, toggleCollapsed, paletteOpen, openPalette, closePalette])
}
