import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CANVAS } from '../ase/tokens'
import { SelectionProvider, useSelection } from '../ase/selection'
import { HoverProvider } from '../ase/hover'
import { DatasetProvider, useDataset } from '../ase/store'
import { AsOfProvider } from '../ase/asOfContext'
import { SimulationModeProvider } from '../ase/simulationMode'
import { DemoModeProvider } from '../ase/demoMode'
import { DemoRunner } from '../components/controlRoom/DemoRunner'
import { latest } from '../ase/graph'
import { InspectorProvider } from '../components/controlRoom/InspectorContext'
import { Inspector } from '../components/controlRoom/Inspector'
import { SectionHeader } from '../components/controlRoom/SectionHeader'
import { TopBar, type LiveStatus } from '../components/controlRoom/TopBar'
import { TABS, DEFAULT_TAB_ID, tabById } from '../components/controlRoom/tabs'
import { useControlRoomKeyboard } from '../components/controlRoom/useControlRoomKeyboard'
import { CommandPalette, type CommandItem } from '../components/controlRoom/CommandPalette'
import { ActivityLane } from '../components/controlRoom/ActivityLane'

export function ControlRoom() {
  return (
    <SelectionProvider>
      <HoverProvider>
        <InspectorProvider>
          <DatasetProvider>
            <AsOfProvider>
              <SimulationModeProvider>
                <DemoModeProvider>
                  <DemoRunner />
                  <ControlRoomShell />
                </DemoModeProvider>
              </SimulationModeProvider>
            </AsOfProvider>
          </DatasetProvider>
        </InspectorProvider>
      </HoverProvider>
    </SelectionProvider>
  )
}

function ControlRoomShell() {
  const navigate = useNavigate()
  const { select } = useSelection()
  const { dataset } = useDataset()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useControlRoomKeyboard({
    paletteOpen,
    openPalette: () => setPaletteOpen(true),
    closePalette: () => setPaletteOpen(false),
  })

  const { pathname } = useLocation()
  const tabId = pathname.split('/').filter(Boolean).pop() ?? DEFAULT_TAB_ID
  const tab = tabById(tabId) ?? tabById(DEFAULT_TAB_ID)!

  const liveStatus: LiveStatus = dataset.stages.some((s) => s.state === 'degraded')
    ? 'anomaly'
    : dataset.stages.some((s) => s.state === 'catching_up')
      ? 'watch'
      : 'nominal'

  const pendingCounts = useMemo(
    () => ({
      identity: dataset.findings.filter((f) => f.kind === 'duplicate_identity').length,
      // Honestly zero until something in the dataset is actually asserted by
      // a human — Revision has nothing to fabricate a badge count from yet.
      revision: 0,
    }),
    [dataset]
  )

  // Tabs are always searchable (S1e); climbers are now real, so the palette
  // can search entities too — selecting one sets global selection without
  // navigating, per S1f rule 1. Rules and sources still have nothing behind
  // them yet, so those groups stay empty rather than invented.
  const commandItems = useMemo<CommandItem[]>(() => {
    const tabItems: CommandItem[] = TABS.map((t) => ({
      id: `tab:${t.id}`,
      kind: 'tab' as const,
      label: t.label,
      sublabel: t.stage,
      onSelect: () => navigate(`/app/control-room/${t.id}`),
    }))
    const entityItems: CommandItem[] = dataset.climbers.map((c) => ({
      id: `entity:${c.id}`,
      kind: 'entity' as const,
      label: latest(c.name).value as string,
      sublabel: c.findingId ? 'Flagged' : 'Clean',
      onSelect: () => select({ kind: 'identity', climberId: c.id }),
    }))
    return [...tabItems, ...entityItems]
  }, [navigate, dataset, select])

  return (
    <div className="flex h-full w-full flex-col" style={{ background: CANVAS }}>
      <TopBar activeTabId={tab.id} liveStatus={liveStatus} pendingCounts={pendingCounts} />
      <SectionHeader tab={tab} />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
        <Inspector />
      </div>
      <ActivityLane />
      <CommandPalette open={paletteOpen} items={commandItems} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
