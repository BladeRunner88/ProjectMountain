"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Detection = dynamic(
  () =>
    import("@/features/control-room/components/detection").then(
      (m) => m.Detection
    ),
  {
    ssr: false,
    loading: () => <ControlRoomTabSkeleton />,
  }
)

export function DetectionClient(): ReactElement {
  return <Detection />
}
