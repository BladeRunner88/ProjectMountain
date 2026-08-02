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

export function MenuIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  )
}

export function FlagIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="5" y1="17" x2="5" y2="3" />
      <path d="M5 4L15 4L12 7.5L15 11L5 11" />
    </svg>
  )
}

export function ControlRoomIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="7" r="2" />
      <circle cx="14" cy="13" r="2" />
      <line x1="6" y1="9" x2="6" y2="15" />
      <line x1="14" y1="5" x2="14" y2="11" />
      <line x1="6" y1="15" x2="14" y2="15" />
      <line x1="6" y1="5" x2="14" y2="5" />
    </svg>
  )
}
