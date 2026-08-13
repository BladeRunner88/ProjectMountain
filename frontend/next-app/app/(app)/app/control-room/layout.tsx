"use client"

import dynamic from "next/dynamic"
import type { ReactElement, ReactNode } from "react"

import { ControlRoomSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const ControlRoomShell = dynamic(
  () =>
    import("@/features/control-room/components/ControlRoomShell").then(
      (m) => m.ControlRoomShell
    ),
  { ssr: false, loading: () => <ControlRoomSkeleton /> }
)

export default function ControlRoomLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ControlRoomShell>{children}</ControlRoomShell>
    </div>
  )
}
