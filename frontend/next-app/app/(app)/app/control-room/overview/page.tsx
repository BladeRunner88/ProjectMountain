"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Overview = dynamic(
  () =>
    import("@/features/control-room/components/Overview").then((m) => m.Overview),
  { ssr: false, loading: () => <ControlRoomTabSkeleton /> }
)

export default function OverviewPage(): ReactElement {
  return <Overview />
}
