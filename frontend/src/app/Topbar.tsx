import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MenuIcon } from '../components/icons'

const titles: Record<string, string> = {
  graph: 'Graph',
  search: 'Search',
  dashboard: 'Dashboard',
  workspace: 'Graph',
  findings: 'Findings',
}

// 8.13-ui: the ONE place every /app/* page (other than Control Room and
// graph-next, which supply their own equivalent menu inside their own top
// bar) can jump to another page now that the old AppShell Sidebar is gone.
const NAV_LINKS = [
  { to: '/app/graph-next', label: 'Graph', isActive: (p: string) => p.startsWith('/app/graph') || p.startsWith('/demo') },
  { to: '/app/search', label: 'Search', isActive: (p: string) => p.startsWith('/app/search') },
  { to: '/app/dashboard', label: 'Dashboard', isActive: (p: string) => p.startsWith('/app/dashboard') },
  { to: '/app/control-room', label: 'Control Room', isActive: (p: string) => p.startsWith('/app/control-room') && !p.startsWith('/app/control-room/findings') },
  { to: '/app/control-room/findings', label: 'Findings', isActive: (p: string) => p.startsWith('/app/control-room/findings') },
]

export function Topbar() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [menuOpen])

  // The Control Room's own shell (9.1d) supplies a complete 48px bar with
  // nothing above it — "ONE BAR. NOT TWO." /control-room/findings is a
  // separate, unrelated page that still wants this generic bar. Its own
  // TopBar carries an equivalent "GO TO" menu (controlRoom/TopBar.tsx).
  if (pathname.startsWith('/app/control-room') && !pathname.startsWith('/app/control-room/findings')) {
    return null
  }

  // The redesigned graph-next page supplies its own 48px breadcrumb bar
  // (its full-viewport layout leaves no room for a second, generic one
  // above it) — same "this route owns its own chrome" rule as Control Room
  // above, and its own TopBar carries the same "GO TO" menu. Scoped
  // precisely to /app/graph-next so it doesn't also swallow
  // /demo/workspace, which mounts this same AppShell.
  if (pathname.startsWith('/app/graph-next')) {
    return null
  }

  const segment = pathname.split('/').filter(Boolean).pop() ?? ''
  const title = titles[segment] ?? ''

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-8">
      <div className="flex items-center gap-3">
        <span className="text-[15px] font-semibold tracking-tight text-ink">Isildur</span>
        {title && (
          <>
            <span className="text-ink-faint">/</span>
            <h1 className="text-[14px] font-medium tracking-tight text-ink">{title}</h1>
          </>
        )}
      </div>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition-colors duration-fast ease-out hover:bg-black/[0.04] hover:text-ink"
        >
          <MenuIcon className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-9 w-48 rounded-lg border border-hairline bg-app p-1.5 shadow-lg" style={{ zIndex: 20 }}>
            <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">Go to</p>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={[
                  'block rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-fast ease-out',
                  link.isActive(pathname) ? 'bg-black/[0.045] font-medium text-ink' : 'text-ink-soft hover:bg-black/[0.03] hover:text-ink',
                ].join(' ')}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
