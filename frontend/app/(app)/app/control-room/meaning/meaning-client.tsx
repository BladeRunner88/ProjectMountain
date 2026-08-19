"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Meaning = dynamic(
  () =>
    import("@/features/control-room/components/meaning/Meaning").then(
      (m) => m.Meaning
    ),
  {
    ssr: false,
    loading: () => <ControlRoomTabSkeleton />,
  }
)

export function MeaningClient(): ReactElement {
  return <Meaning />
}
