import type { ReactElement } from "react"

import { SquareButton } from "@/components/ui/square-button"

export default function AppNotFound(): ReactElement {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6">
      <p className="text-[14px] font-medium text-ink">Not found</p>
      <p className="mt-1 max-w-[320px] text-center text-[13px] leading-relaxed text-ink-soft">
        This page does not exist.
      </p>
      <SquareButton href="/app/control-room/overview" className="mt-4">
        Back to Control Room
      </SquareButton>
    </div>
  )
}
