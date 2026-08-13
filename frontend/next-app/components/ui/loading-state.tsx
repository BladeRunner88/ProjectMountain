type LoadingStateProps = {
  label?: string
  variant?: "light" | "dark"
}

export function LoadingState({
  label = "Loading",
  variant = "light",
}: LoadingStateProps) {
  const dark = variant === "dark"
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className={`h-5 w-5 rounded-full border-2 ${dark ? "border-ink-on-canvas-soft/30 border-t-ink-on-canvas" : "border-ink-faint/30 border-t-ink"} motion-safe:animate-spin`}
      />
      <p
        className={`mt-4 text-[14px] font-medium ${dark ? "text-ink-on-canvas" : "text-ink"}`}
      >
        {label}
      </p>
    </div>
  )
}
