"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Reasoning = dynamic(
  () =>
    import("@/features/control-room/components/reasoning").then(
      (m) => m.Reasoning
    ),
  {
    ssr: false,
    loading: () => <ControlRoomTabSkeleton />,
  }
)

export function ReasoningClient(): ReactElement {
  return <Reasoning />
}
