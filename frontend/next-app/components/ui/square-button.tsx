import type { MouseEventHandler, ReactElement, ReactNode } from "react"
import Link from "next/link"

import { cn } from "@/lib/cn"

/**
 * An href is internal — and so must go through `next/link` for client-side
 * navigation — only when it is a router-resolvable path: "/about", "/#ase",
 * "#top", "?q=1". Everything else leaves the router (absolute http(s) URLs,
 * protocol-relative "//host/x", and schemes like mailto:/tel:/sms:) and must
 * render a plain `<a>`.
 */
export function isExternalHref(href: string): boolean {
  if (href.startsWith("//")) return true
  return !/^[/#?]/.test(href)
}

type Tone = "light" | "dark"

const TONE_CLASSES: Record<Tone, string> = {
  light: "border border-ink bg-ink text-app hover:bg-app hover:text-ink",
  dark: "border border-app bg-app text-ink hover:bg-transparent hover:text-app",
}

const BASE =
  "inline-flex items-center justify-center px-5 py-2 text-[14px] font-medium transition-colors duration-fast ease-out"

type SquareButtonProps = {
  tone?: Tone
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
  href,
  onClick,
  children,
  className = "",
  type = "button",
  disabled,
  as,
  "aria-label": ariaLabel,
}: SquareButtonProps): ReactElement {
  const classes = cn(BASE, TONE_CLASSES[tone], className)

  if (as === "span") {
    return (
      <span className={classes} aria-label={ariaLabel}>
        {children}
      </span>
    )
  }
  if (href) {
    if (isExternalHref(href)) {
      return (
        <a href={href} className={classes} aria-label={ariaLabel}>
          {children}
        </a>
      )
    }
    return (
      <Link href={href} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
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
