import type { MouseEventHandler, ReactNode } from "react"
import Link from "next/link"

import { cn } from "@/lib/cn"

type Tone = "light" | "dark"

const TONE_CLASSES: Record<Tone, string> = {
  light: "border border-ink bg-ink text-app hover:bg-app hover:text-ink",
  dark: "border border-app bg-app text-ink hover:bg-transparent hover:text-app",
}

const BASE =
  "inline-flex items-center justify-center px-5 py-2 text-[14px] font-medium transition-colors duration-fast ease-out"

type SquareButtonProps = {
  tone?: Tone
  to?: string
  href?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  children: ReactNode
  className?: string
  type?: "button" | "submit"
  disabled?: boolean
  "aria-label"?: string
  as?: "span"
}

export function SquareButton({
  tone = "light",
  to,
  href,
  onClick,
  children,
  className = "",
  type = "button",
  disabled,
  as,
  "aria-label": ariaLabel,
}: SquareButtonProps) {
  const classes = cn(BASE, TONE_CLASSES[tone], className)

  if (as === "span") {
    return (
      <span className={classes} aria-label={ariaLabel}>
        {children}
      </span>
    )
  }
  if (to) {
    return (
      <Link href={to} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={classes} aria-label={ariaLabel}>
        {children}
      </a>
    )
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classes}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}
