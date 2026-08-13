import type { ReactNode } from "react"

export function ProgressBar({
  step,
  total,
}: {
  step: number
  total: number
}): ReactNode {
  const percent = `${(step / total) * 100}%`
  return (
    <div>
      <div
        className="h-px w-full bg-hairline"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={`Step ${step} of ${total}`}
      >
        <div
          className="h-px bg-accent transition-[width] duration-500 ease-out"
          style={{ width: percent }}
        />
      </div>
      <p className="mt-3 text-[13px] text-ink-faint">
        Step {step} of {total}
      </p>
    </div>
  )
}
