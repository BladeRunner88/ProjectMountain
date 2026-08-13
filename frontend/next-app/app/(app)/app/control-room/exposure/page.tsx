"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Exposure = dynamic(
  () =>
    import("@/features/control-room/components/exposure/Exposure").then(
      (m) => m.Exposure
    ),
  { ssr: false, loading: () => <ControlRoomTabSkeleton /> }
)

export default function ExposurePage(): ReactElement {
  return <Exposure />
}
