import type { ReactNode } from 'react'

type Tone = 'default' | 'tint' | 'dark'

type SectionProps = {
  children: ReactNode
  className?: string
  tone?: Tone
  id?: string
}

const TONE_BG: Record<Tone, string> = {
  default: 'bg-app',
  tint: 'bg-tint',
  dark: 'bg-canvas',
}

const TONE_BORDER: Record<Tone, string> = {
  default: 'border-hairline',
  tint: 'border-hairline',
  dark: 'border-hairline-on-canvas',
}

export function Section({ children, className = '', tone = 'default', id }: SectionProps) {
  return (
    <section
      id={id}
      className={`border-t ${TONE_BORDER[tone]} ${TONE_BG[tone]} py-24 md:py-32`}
    >
      <div className={`mx-auto max-w-5xl px-6 md:px-10 ${className}`}>{children}</div>
    </section>
  )
}
