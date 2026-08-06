import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  BORDER_WIDTH,
  COMMAND_PALETTE_MAX_HEIGHT,
  COMMAND_PALETTE_TOP_OFFSET_VH,
  COMMAND_PALETTE_WIDTH,
  HAIRLINE,
  OVERLAY,
  PANEL_RAISED,
  RADIUS_INTERACTIVE,
  SPACE_8,
  SPACE_12,
  SPACE_16,
  TEXT_DIM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TYPE_BODY,
  TYPE_CAPTION,
  Z_COMMAND_PALETTE,
} from '../../ase/tokens'

// ⌘K (S1e). Searches everything the shell knows about at once — today that's
// only the 11 tabs, since entities/rules/sources need a real dataset (9.1f+)
// that doesn't exist yet. The `kind` groups already cover them; a caller
// just hasn't had anything honest to pass for those groups yet.
export type CommandKind = 'entity' | 'tab' | 'rule' | 'source'

export interface CommandItem {
  id: string
  kind: CommandKind
  label: string
  sublabel?: string
  onSelect: () => void
}

const KIND_LABEL: Record<CommandKind, string> = {
  entity: 'Entities',
  tab: 'Tabs',
  rule: 'Rules',
  source: 'Sources',
}
const KIND_ORDER: CommandKind[] = ['tab', 'entity', 'rule', 'source']

export function CommandPalette({
  open,
  items,
  onClose,
}: {
  open: boolean
  items: CommandItem[]
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // Focus after the open-state paints, so the input actually exists to focus.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) => item.label.toLowerCase().includes(q) || item.sublabel?.toLowerCase().includes(q)
    )
  }, [items, query])

  const grouped = useMemo(() => {
    const groups = new Map<CommandKind, CommandItem[]>()
    for (const item of filtered) {
      const list = groups.get(item.kind) ?? []
      list.push(item)
      groups.set(item.kind, list)
    }
    return KIND_ORDER.filter((k) => groups.has(k)).map((kind) => ({ kind, items: groups.get(kind)! }))
  }, [filtered])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function activate(index: number) {
    const item = filtered[index]
    if (!item) return
    item.onSelect()
    onClose()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      activate(activeIndex)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  let runningIndex = -1

  return (
    <div
      className="fixed inset-0 flex items-start justify-center"
      style={{ background: OVERLAY, zIndex: Z_COMMAND_PALETTE, paddingTop: `${COMMAND_PALETTE_TOP_OFFSET_VH}vh` }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: COMMAND_PALETTE_WIDTH,
          maxHeight: COMMAND_PALETTE_MAX_HEIGHT,
          background: PANEL_RAISED,
          border: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
          borderRadius: RADIUS_INTERACTIVE,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search entities, tabs, rules, sources…"
          style={{
            ...TYPE_BODY,
            color: TEXT_PRIMARY,
            background: 'transparent',
            border: 'none',
            borderBottom: `${BORDER_WIDTH}px solid ${HAIRLINE}`,
            padding: SPACE_16,
            outline: 'none',
          }}
        />
        <div className="overflow-y-auto" style={{ padding: SPACE_8 }}>
          {filtered.length === 0 ? (
            <p style={{ ...TYPE_BODY, color: TEXT_DIM, padding: SPACE_12 }}>No matches.</p>
          ) : (
            grouped.map((group) => (
              <div key={group.kind} style={{ marginBottom: SPACE_8 }}>
                <p style={{ ...TYPE_CAPTION, color: TEXT_DIM, padding: `${SPACE_8}px ${SPACE_12}px` }}>
                  {KIND_LABEL[group.kind].toUpperCase()}
                </p>
                {group.items.map((item) => {
                  runningIndex += 1
                  const index = runningIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => activate(index)}
                      className="pressable flex w-full items-center justify-between text-left"
                      style={{
                        ...TYPE_BODY,
                        color: index === activeIndex ? TEXT_PRIMARY : TEXT_SECONDARY,
                        background: index === activeIndex ? HAIRLINE : 'transparent',
                        borderRadius: RADIUS_INTERACTIVE,
                        padding: `${SPACE_8}px ${SPACE_12}px`,
                      }}
                    >
                      <span>{item.label}</span>
                      {item.sublabel && (
                        <span style={{ ...TYPE_CAPTION, color: TEXT_DIM }}>{item.sublabel}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
