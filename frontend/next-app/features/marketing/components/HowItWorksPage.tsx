import { MarketingShell } from "./MarketingShell"
import { RequestDemoBand } from "./landing/RequestDemoBand"

const STEPS = [
  {
    n: "01",
    name: "Connect",
    desc: "Pull data from every system: databases, spreadsheets, legacy tools, live feeds. No rip and replace.",
  },
  {
    n: "02",
    name: "Clean",
    desc: "Standardize, dedupe, and repair messy records automatically as they arrive.",
  },
  {
    n: "03",
    name: "Understand",
    desc: "Resolve records into real world entities and map how everything connects.",
  },
  {
    n: "04",
    name: "Search",
    desc: "Find any entity, document, or relationship instantly across every source.",
  },
  {
    n: "05",
    name: "Automate",
    desc: "Surface anomalies, answer questions in plain language, and route work to the right people.",
  },
]

export function HowItWorksPage() {
  return (
    <MarketingShell>
      <section className="border-b border-hairline px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-[40px] font-semibold tracking-[-0.025em] text-ink md:text-[56px]">
            How ASE works.
          </h1>
        </div>
      </section>

      <section className="px-6 md:px-10">
        <div className="mx-auto max-w-5xl">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className={`grid grid-cols-[3rem_1fr] gap-x-6 gap-y-3 py-10 md:grid-cols-[4rem_12rem_1fr] md:items-baseline md:gap-x-10 md:py-14 ${
                i === 0 ? "" : "border-t border-hairline"
              }`}
            >
              <span className="text-[15px] text-ink-faint">{step.n}</span>
              <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
                {step.name}
              </h2>
              <p className="col-span-2 max-w-xl text-[17px] leading-[1.6] text-ink-soft md:col-span-1">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <RequestDemoBand />
    </MarketingShell>
  )
}
