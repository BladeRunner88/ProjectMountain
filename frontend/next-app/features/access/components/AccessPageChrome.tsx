import type { ReactNode } from "react"
import Link from "next/link"

export function AccessPageChrome({
  children,
}: {
  children: ReactNode
}): ReactNode {
  return (
    <div className="min-h-screen bg-app font-inter">
      <div className="px-6 pt-8 md:px-10">
        <Link href="/" className="text-[15px] font-semibold text-ink">
          Isildur
        </Link>
      </div>
      <div className="mx-auto w-full max-w-[560px] px-6 pt-16 pb-24 md:pt-24">
        {children}
      </div>
    </div>
  )
}
