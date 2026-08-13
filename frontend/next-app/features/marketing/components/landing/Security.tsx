import { Section } from "./Section"

const POINTS = [
  {
    label: "Role based access control",
    desc: "Every object is governed by who is allowed to see it.",
  },
  {
    label: "Full audit trail",
    desc: "Every access and every change is logged and traceable.",
  },
  {
    label: "Data lineage",
    desc: "Every value can be traced back to its original source.",
  },
  {
    label: "Deploy anywhere",
    desc: "Runs in the cloud, on premise, or fully air gapped.",
  },
]

export function Security() {
  return (
    <Section id="security" tone="dark">
      <h2 className="text-[32px] font-semibold tracking-[-0.025em] text-ink-on-canvas md:text-[48px]">
        Secure by design.
      </h2>
      <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p.label}>
            <p className="text-[19px] font-semibold text-ink-on-canvas">
              {p.label}
            </p>
            <p className="mt-1.5 text-[17px] leading-[1.5] text-ink-on-canvas-soft">
              {p.desc}
            </p>
          </div>
        ))}
      </div>
    </Section>
  )
}
