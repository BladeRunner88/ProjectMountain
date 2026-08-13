"use client"

import { SquareButton } from "@/components/ui/square-button"

type ErrorStateProps = {
  title?: string
  message: string
  onRetry?: () => void
  variant?: "light" | "dark"
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  variant = "light",
}: ErrorStateProps) {
  const dark = variant === "dark"
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center px-6"
      role="alert"
    >
      <p
        className={`text-[14px] font-medium ${dark ? "text-ink-on-canvas" : "text-ink"}`}
      >
        {title}
      </p>
      <p
        className={`mt-1 max-w-[320px] text-center text-[13px] leading-relaxed ${dark ? "text-ink-on-canvas-soft" : "text-ink-soft"}`}
      >
        {message}
      </p>
      {onRetry ? (
        <SquareButton tone={variant} className="mt-4" onClick={onRetry}>
          Try again
        </SquareButton>
      ) : null}
    </div>
  )
}
