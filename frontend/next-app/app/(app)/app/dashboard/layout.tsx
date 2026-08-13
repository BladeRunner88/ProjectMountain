"use client"

import type { ReactElement, ReactNode } from "react"

import { GraphSimulationProvider } from "@/features/demo/components/GraphSimulationProvider"

export default function DashboardLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return <GraphSimulationProvider>{children}</GraphSimulationProvider>
}
