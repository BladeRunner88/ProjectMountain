import type { Metadata } from "next"
import type { ReactElement, ReactNode } from "react"

import { ControlRoomShellClient } from "./control-room-shell-client"

export const metadata: Metadata = {
  title: "Control Room — Isildur",
  description: "Operator view of the ASE pipeline, stage by stage.",
}

export default function ControlRoomLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ControlRoomShellClient>{children}</ControlRoomShellClient>
    </div>
  )
}
