import { NavLink } from 'react-router-dom'
import { GraphIcon, SearchIcon, DashboardIcon } from '../components/icons'

const items = [
  { to: '/app/graph', label: 'Graph', icon: GraphIcon },
  { to: '/app/search', label: 'Search', icon: SearchIcon },
  { to: '/app/dashboard', label: 'Dashboard', icon: DashboardIcon },
]

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-hairline bg-app">
      <div className="flex h-14 shrink-0 items-center px-6">
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Isildur
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] transition-colors duration-fast ease-out',
                isActive
                  ? 'bg-black/[0.045] font-medium text-ink'
                  : 'text-ink-soft hover:bg-black/[0.03] hover:text-ink',
              ].join(' ')
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2 border-t border-hairline px-6 py-4">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="font-mono text-[11px] text-ink-faint">
          Local instance
        </span>
      </div>
    </aside>
  )
}
