import type { ReactNode } from "react"

import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-app font-inter">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
