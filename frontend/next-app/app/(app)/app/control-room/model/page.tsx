"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Model = dynamic(
  () =>
    import("@/features/control-room/components/model/Model").then((m) => m.Model),
  { ssr: false, loading: () => <ControlRoomTabSkeleton /> }
)

export default function ModelPage(): ReactElement {
  return <Model />
}
