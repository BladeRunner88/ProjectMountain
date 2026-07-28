export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div>
      <div className="h-px w-full bg-hairline">
        <div
          className="h-px bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
      <p className="mt-3 text-[13px] text-ink-faint">
        Step {step} of {total}
      </p>
    </div>
  )
}
