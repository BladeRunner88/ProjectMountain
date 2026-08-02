import { SquareButton } from '../SquareButton'

export const LENS_OPTIONS = [
  'Live telemetry',
  'Anomaly detection',
  'Team structure',
  'Route progression',
  'Physiological risk',
  'Supply and logistics',
]

export function LensesScreen({
  selected,
  onToggle,
  onNext,
}: {
  selected: Set<string>
  onToggle: (option: string) => void
  onNext: () => void
}) {
  return (
    <div>
      <h2 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">
        What would you like to see?
      </h2>
      <p className="mt-2 text-[14px] leading-[1.5] text-ink-soft">
        Choose one or more. You can change this later from the Control Room.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        {LENS_OPTIONS.map((option) => {
          const isSelected = selected.has(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              aria-pressed={isSelected}
              className={`rounded-[4px] border px-4 py-2 text-[14px] transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                isSelected
                  ? 'border-ink bg-ink text-app'
                  : 'border-hairline text-ink-soft hover:border-ink-faint hover:text-ink'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>

      <div className="mt-10 flex justify-end">
        <SquareButton tone="light" onClick={onNext} disabled={selected.size === 0} className="disabled:opacity-60">
          Next
        </SquareButton>
      </div>
    </div>
  )
}
