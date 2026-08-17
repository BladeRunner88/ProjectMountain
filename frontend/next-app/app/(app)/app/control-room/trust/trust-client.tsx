"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Trust = dynamic(
  () =>
    import("@/features/control-room/components/trust/Trust").then(
      (m) => m.Trust
    ),
  {
    ssr: false,
    loading: () => <ControlRoomTabSkeleton />,
  }
)

export function TrustClient(): ReactElement {
  return <Trust />
}
