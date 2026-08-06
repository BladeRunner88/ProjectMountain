import { useLocation } from 'react-router-dom'

const titles: Record<string, string> = {
  graph: 'Graph',
  search: 'Search',
  dashboard: 'Dashboard',
  workspace: 'Graph',
}

export function Topbar() {
  const { pathname } = useLocation()

  // The Control Room's own shell (9.1d) supplies a complete 48px bar with
  // nothing above it — "ONE BAR. NOT TWO." /control-room/findings is a
  // separate, unrelated page that still wants this generic bar.
  if (pathname.startsWith('/app/control-room') && !pathname.startsWith('/app/control-room/findings')) {
    return null
  }

  const segment = pathname.split('/').filter(Boolean).pop() ?? ''
  const title = titles[segment] ?? ''

  return (
    <div className="flex h-14 shrink-0 items-center border-b border-hairline px-8">
      <h1 className="text-[14px] font-medium tracking-tight text-ink">
        {title}
      </h1>
    </div>
  )
}
