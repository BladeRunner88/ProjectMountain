"use client"

import dynamic from "next/dynamic"
import { Suspense, type ReactElement } from "react"

import { ControlRoomTabSkeleton } from "@/features/control-room/components/ControlRoomSkeleton"

const Identity = dynamic(
  () =>
    import("@/features/control-room/components/identity/Identity").then(
      (m) => m.Identity
    ),
  {
    ssr: false,
    loading: () => <ControlRoomTabSkeleton />,
  }
)

export function IdentityClient(): ReactElement {
  return (
    <Suspense fallback={<ControlRoomTabSkeleton />}>
      <Identity />
    </Suspense>
  )
}
