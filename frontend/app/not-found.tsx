import type { Metadata } from "next"
import type { ReactElement } from "react"

import { SquareButton } from "@/components/ui/square-button"
import { MarketingShell } from "@/features/marketing/components/MarketingShell"

export const metadata: Metadata = {
  title: "Not found — Isildur",
  description: "The page you are looking for does not exist.",
}

export default function NotFound(): ReactElement {
  return (
    <MarketingShell>
      <section className="px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-[40px] font-semibold tracking-[-0.025em] text-ink md:text-[56px]">
            404.
          </h1>
          <p className="mt-6 max-w-[60ch] text-[19px] leading-[1.5] font-normal text-ink-soft">
            The page you are looking for does not exist.
          </p>
          <SquareButton href="/" className="mt-10">
            Return home
          </SquareButton>
        </div>
      </section>
    </MarketingShell>
  )
}
