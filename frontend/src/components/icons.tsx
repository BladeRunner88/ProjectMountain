type IconProps = { className?: string }

const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function GraphIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="6.5" y1="6" x2="10" y2="10" />
      <line x1="13.5" y1="6.5" x2="10" y2="10" />
      <line x1="6.5" y1="14" x2="10" y2="10" />
      <circle cx="6.5" cy="6" r="1.6" />
      <circle cx="13.5" cy="6.5" r="1.6" />
      <circle cx="6.5" cy="14" r="1.6" />
      <circle cx="10" cy="10" r="1.8" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="9" r="5.25" />
      <line x1="13" y1="13" x2="17" y2="17" />
    </svg>
  )
}

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7.5" height="8.5" rx="1.5" />
      <rect x="12.5" y="3" width="4.5" height="5" rx="1.5" />
      <rect x="12.5" y="10" width="4.5" height="7" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="3.5" rx="1.5" />
    </svg>
  )
}
