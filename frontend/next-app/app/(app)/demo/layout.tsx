"use client"

import type { ReactElement, ReactNode } from "react"

import { GraphSimulationProvider } from "@/features/demo/components/GraphSimulationProvider"

export default function DemoLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <GraphSimulationProvider>
      <div className="flex h-svh w-full flex-col">{children}</div>
    </GraphSimulationProvider>
  )
}
