import type { ComponentType } from 'react'

type EmptyStateProps = {
  icon: ComponentType<{ className?: string }>
  title: string
  subtitle: string
  variant?: 'light' | 'dark'
}

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  variant = 'light',
}: EmptyStateProps) {
  const dark = variant === 'dark'
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6">
      <Icon
        className={`h-7 w-7 ${dark ? 'text-ink-on-canvas-soft' : 'text-ink-faint'}`}
      />
      <p
        className={`mt-4 text-[14px] font-medium ${dark ? 'text-ink-on-canvas' : 'text-ink'}`}
      >
        {title}
      </p>
      <p
        className={`mt-1 max-w-[320px] text-center text-[13px] leading-relaxed ${dark ? 'text-ink-on-canvas-soft' : 'text-ink-soft'}`}
      >
        {subtitle}
      </p>
    </div>
  )
}
