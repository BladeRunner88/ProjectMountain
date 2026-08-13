import type { ReactElement, ReactNode } from "react"

import { AppShell } from "@/features/app-shell/components/AppShell"

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return <AppShell>{children}</AppShell>
}
