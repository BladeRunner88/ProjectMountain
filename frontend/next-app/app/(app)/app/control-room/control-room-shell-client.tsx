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

export function ControlRoomShellClient({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return <ControlRoomShell>{children}</ControlRoomShell>
}
