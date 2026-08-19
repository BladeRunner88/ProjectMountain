import { MarketingShell } from "./MarketingShell"

export function AboutPage() {
  return (
    <MarketingShell>
      <section className="px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-[40px] font-semibold tracking-[-0.025em] text-ink md:text-[56px]">
            About.
          </h1>
          <p className="mt-6 max-w-[60ch] text-[19px] leading-[1.5] font-normal text-ink-soft">
            More on our story is coming soon.
          </p>
        </div>
      </section>
    </MarketingShell>
  )
}
