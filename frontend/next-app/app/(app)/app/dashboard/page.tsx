import type { Metadata } from "next"
import type { ReactElement } from "react"

import { Dashboard } from "@/features/dashboard"

export const metadata: Metadata = {
  title: "Dashboard — Isildur",
  description: "Live expedition operations dashboard.",
}

export default function DashboardPage(): ReactElement {
  return <Dashboard />
}
