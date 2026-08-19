import type { ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

export default function PredictionLoading(): ReactElement {
  return <ControlRoomTabSkeleton />
}
