import type { ReactNode, MouseEventHandler } from 'react'
import { Link } from 'react-router-dom'

type Tone = 'light' | 'dark'

const TONE_CLASSES: Record<Tone, string> = {
  // light section (near-white bg): filled black by default, inverts to a
  // bordered white fill on hover
  light: 'border border-ink bg-ink text-app hover:bg-app hover:text-ink',
  // dark section (canvas): filled white by default, inverts to a
  // bordered transparent fill on hover
  dark: 'border border-app bg-app text-ink hover:bg-transparent hover:text-app',
}

const BASE = 'inline-flex items-center justify-center px-5 py-2 text-[14px] font-medium transition-colors duration-fast ease-out'

type SquareButtonProps = {
  tone?: Tone
  to?: string
  href?: string
  onClick?: MouseEventHandler
  children: ReactNode
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  'aria-label'?: string
  /** render as a plain non-interactive span — for nesting inside a larger clickable element */
  as?: 'span'
}

export function SquareButton({
  tone = 'light',
  to,
  href,
  onClick,
  children,
  className = '',
  type = 'button',
  disabled,
  as,
  ...rest
}: SquareButtonProps) {
  const classes = `${BASE} ${TONE_CLASSES[tone]} ${className}`

  if (as === 'span') {
    return (
      <span className={classes} {...rest}>
        {children}
      </span>
    )
  }
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes} {...rest}>
      {children}
    </button>
  )
}
