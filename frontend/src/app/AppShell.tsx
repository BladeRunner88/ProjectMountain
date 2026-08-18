import { Outlet } from 'react-router-dom'
import { Topbar } from './Topbar'
import { DatasetProvider } from '../ase/store'

// 8.6: DatasetProvider moved here from ControlRoom.tsx's own subtree — it
// now wraps every /app/* route, not just /app/control-room/*, so
// /app/graph-next's adapter and the Control Room read the exact SAME
// buildDataset() call (one build, one TracedValue registry). Two
// independent DatasetProvider instances would each call buildDataset()
// separately — different RNG draws, a different registry — and the graph
// and Control Room would silently stop agreeing with each other, which is
// exactly what 8.0's own rule forbids ("The two must agree — same
// TracedValues, same confidences, same wording for the same finding").
// /app/graph (the old, untouched generic force-graph) and /app/dashboard,
// /app/search don't read this dataset at all — mounting the provider here
// regardless is harmless (it's plain React context, not a subscription
// that costs anything when unused) and is the simplest placement that
// stays correct if a future route needs it too.

export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-app">
      <Topbar />
      <div className="min-h-0 flex-1">
        <DatasetProvider>
          <Outlet />
        </DatasetProvider>
      </div>
    </div>
  )
}
