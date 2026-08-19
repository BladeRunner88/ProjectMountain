'use client'

import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CANVAS } from '@/features/ase/tokens'
import { AseProviders, useDataset, useSelection } from '@/features/ase/client'
import { tracedDisplayString } from '../services/display'
import { TABS, tabFromPathname, type TabId } from '../types/tabs'
import type { CommandItem } from '../types/command'
import { useControlRoomKeyboard } from '../hooks/useControlRoomKeyboard'
import { SectionHeaderSlotProvider, useSectionHeaderSlot } from '../hooks/useSectionHeaderSlot'
import { DemoRunner } from './DemoRunner'
import { TopBar, type LiveStatus } from './TopBar'
import { SectionHeader } from './SectionHeader'
import { Inspector } from './Inspector'
import { ActivityLane } from './ActivityLane'
import { CommandPalette } from './CommandPalette'
import { ControlRoomErrorBoundary } from './ControlRoomErrorBoundary'

export function ControlRoomShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <AseProviders>
      <SectionHeaderSlotProvider>
        <DemoRunner />
        <ControlRoomChrome>{children}</ControlRoomChrome>
      </SectionHeaderSlotProvider>
    </AseProviders>
  )
}

function ControlRoomChrome({ children }: { children: ReactNode }): ReactElement {
  const router = useRouter()
  const pathname = usePathname()
  const { select } = useSelection()
  const { dataset } = useDataset()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { right } = useSectionHeaderSlot()

  useControlRoomKeyboard({
    paletteOpen,
    openPalette: () => setPaletteOpen(true),
    closePalette: () => setPaletteOpen(false),
  })

  const tab = tabFromPathname(pathname)

  const liveStatus: LiveStatus = dataset.stages.some((s) => s.state === 'degraded')
    ? 'anomaly'
    : dataset.stages.some((s) => s.state === 'catching_up')
      ? 'watch'
      : 'nominal'

  const pendingCounts = useMemo<Partial<Record<TabId, number>>>(
    () => ({
      identity: dataset.findings.filter((f) => f.kind === 'duplicate_identity').length,
      revision: 0,
    }),
    [dataset]
  )

  const commandItems = useMemo<CommandItem[]>(() => {
    const tabItems: CommandItem[] = TABS.map((t) => ({
      id: `tab:${t.id}`,
      kind: 'tab' as const,
      label: t.label,
      sublabel: t.stage,
      onSelect: () => {
        router.push(t.href)
      },
    }))
    const entityItems: CommandItem[] = dataset.machines.map((c) => ({
      id: `entity:${c.id}`,
      kind: 'entity' as const,
      label: tracedDisplayString(c.name),
      sublabel: c.findingId ? 'Flagged' : 'Clean',
      onSelect: () => select({ kind: 'identity', machineId: c.id }),
    }))
    return [...tabItems, ...entityItems]
  }, [router, dataset, select])

  return (
    <div className="flex h-full min-h-0 w-full flex-col" style={{ background: CANVAS }}>
      <TopBar activeTabId={tab.id} liveStatus={liveStatus} pendingCounts={pendingCounts} />
      <SectionHeader tab={tab} right={right} />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <ControlRoomErrorBoundary label="Tab">{children}</ControlRoomErrorBoundary>
        </div>
        <Inspector />
      </div>
      <ActivityLane />
      <CommandPalette open={paletteOpen} items={commandItems} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
