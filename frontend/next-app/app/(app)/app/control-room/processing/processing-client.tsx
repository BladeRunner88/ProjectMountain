"use client"

import dynamic from "next/dynamic"
import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Processing = dynamic(
  () =>
    import("@/features/control-room/components/Processing").then(
      (m) => m.Processing
    ),
  {
    ssr: false,
    loading: () => <ControlRoomTabSkeleton />,
  }
)

export function ProcessingClient(): ReactElement {
  return <Processing />
}
