"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Revision = dynamic(
  () =>
    import("@/features/control-room/components/revision/Revision").then(
      (m) => m.Revision
    ),
  {
    ssr: false,
    loading: () => <ControlRoomTabSkeleton />,
  }
)

export function RevisionClient(): ReactElement {
  return <Revision />
}
