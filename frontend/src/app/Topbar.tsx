import { useLocation } from 'react-router-dom'

const titles: Record<string, string> = {
  graph: 'Graph',
  search: 'Search',
  dashboard: 'Dashboard',
}

export function Topbar() {
  const { pathname } = useLocation()
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
