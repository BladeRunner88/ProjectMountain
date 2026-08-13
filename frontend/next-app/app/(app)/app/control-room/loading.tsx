import type { ReactElement } from "react"

import { ControlRoomSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

export default function ControlRoomLoading(): ReactElement {
  return <ControlRoomSkeleton />
}
