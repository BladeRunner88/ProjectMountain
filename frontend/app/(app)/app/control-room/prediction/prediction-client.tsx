"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Prediction = dynamic(
  () =>
    import("@/features/control-room/components/prediction").then(
      (m) => m.Prediction
    ),
  {
    ssr: false,
    loading: () => <ControlRoomTabSkeleton />,
  }
)

export function PredictionClient(): ReactElement {
  return <Prediction />
}
