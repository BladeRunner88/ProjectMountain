"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  ControlRoomIcon,
  DashboardIcon,
  FlagIcon,
  GraphIcon,
  SearchIcon,
} from "@/components/ui/icons"
import { cn } from "@/lib/cn"

const items = [
  {
    to: "/app/graph",
    label: "Graph",
    icon: GraphIcon,
    isActive: (pathname: string) =>
      pathname.startsWith("/app/graph") || pathname.startsWith("/demo"),
  },
  {
    to: "/app/search",
    label: "Search",
    icon: SearchIcon,
    isActive: (pathname: string) => pathname.startsWith("/app/search"),
  },
  {
    to: "/app/dashboard",
    label: "Dashboard",
    icon: DashboardIcon,
    isActive: (pathname: string) => pathname.startsWith("/app/dashboard"),
  },
  {
    to: "/app/control-room",
    label: "Control Room",
    icon: ControlRoomIcon,
    isActive: (pathname: string) =>
      pathname.startsWith("/app/control-room") &&
      !pathname.startsWith("/app/control-room/findings"),
  },
  {
    to: "/app/control-room/findings",
    label: "Findings",
    icon: FlagIcon,
    isActive: (pathname: string) =>
      pathname.startsWith("/app/control-room/findings"),
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-hairline bg-app">
      <div className="flex h-14 shrink-0 items-center px-6">
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Isildur
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {items.map(({ to, label, icon: Icon, isActive }) => (
          <Link
            key={to}
            href={to}
            className={cn(
              "duration-fast flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] transition-colors ease-out",
              isActive(pathname)
                ? "bg-ink/[0.045] font-medium text-ink"
                : "text-ink-soft hover:bg-ink/[0.03] hover:text-ink"
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {label}
          </Link>
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
