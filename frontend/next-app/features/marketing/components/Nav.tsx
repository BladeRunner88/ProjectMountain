"use client"

import { useEffect, useRef, useState } from "react"
import type { FocusEvent } from "react"
import Link from "next/link"

import { CloseIcon, MenuIcon } from "@/components/ui/icons"
import { SquareButton } from "@/components/ui/square-button"
import { cn } from "@/lib/cn"

type MenuKey = "product" | "company" | "resources"

type LinkItem = {
  label: string
  to?: string
  href?: string
  disabled?: boolean
  note?: string
}

type MenuColumn = {
  heading: string
  links: LinkItem[]
}

type Menu = {
  key: MenuKey
  label: string
  columns: MenuColumn[]
}

const MENUS: Menu[] = [
  {
    key: "product",
    label: "Product",
    columns: [
      {
        heading: "Platform",
        links: [
          { label: "ASE", href: "/#ase" },
          { label: "Elendil", disabled: true, note: "Coming soon" },
        ],
      },
      {
        heading: "Get started",
        links: [
          { label: "Request a demo", to: "/request-access" },
          { label: "How it works", to: "/how-it-works" },
        ],
      },
    ],
  },
  {
    key: "company",
    label: "Company",
    columns: [
      {
        heading: "Company",
        links: [
          { label: "About", to: "/about" },
          { label: "Transforming lives", href: "/#transforming-lives" },
          { label: "Contact", to: "/contact" },
        ],
      },
    ],
  },
  {
    key: "resources",
    label: "Resources",
    columns: [
      {
        heading: "Resources",
        links: [
          { label: "How it works", to: "/how-it-works" },
          { label: "Documentation", to: "/documentation" },
        ],
      },
    ],
  },
]

function MenuLink({
  item,
  onSelect,
}: {
  item: LinkItem
  onSelect: () => void
}) {
  if (item.disabled) {
    return (
      <div className="flex items-baseline gap-2 py-1.5 text-[17px] text-ink-faint">
        <span>+</span>
        <span>{item.label}</span>
        {item.note && <span className="text-[13px]">({item.note})</span>}
      </div>
    )
  }

  const className =
    "group flex items-baseline gap-2 py-1.5 text-[17px] text-ink transition-transform duration-fast ease-out hover:translate-x-1"
  const content = (
    <>
      <span className="text-accent">+</span>
      <span>{item.label}</span>
    </>
  )

  if (item.to) {
    return (
      <Link href={item.to} onClick={onSelect} className={className}>
        {content}
      </Link>
    )
  }
  if (item.href) {
    return (
      <a href={item.href} onClick={onSelect} className={className}>
        {content}
      </a>
    )
  }
  return null
}

function MenuPanel({ menu, onSelect }: { menu: Menu; onSelect: () => void }) {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 md:px-10 md:py-14",
        menu.columns.length > 1 && "sm:grid-cols-2"
      )}
    >
      {menu.columns.map((col) => (
        <div key={col.heading} className="flex flex-col">
          <p className="text-[12px] font-medium tracking-[0.08em] text-ink-faint uppercase">
            {col.heading}
          </p>
          <div className="mt-4 flex flex-col">
            {col.links.map((link) => (
              <MenuLink key={link.label} item={link} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto bg-app md:hidden">
      <div className="flex flex-col px-6 py-8">
        {MENUS.map((menu, i) => (
          <div
            key={menu.key}
            className={cn(
              "flex flex-col gap-8 py-8",
              i > 0 && "border-t border-hairline"
            )}
          >
            <p className="text-[13px] font-medium tracking-[0.08em] text-ink-faint uppercase">
              {menu.label}
            </p>
            {menu.columns.map((col) => (
              <div key={col.heading}>
                <p className="text-[12px] font-medium tracking-[0.08em] text-ink-faint uppercase">
                  {col.heading}
                </p>
                <div className="mt-3 flex flex-col">
                  {col.links.map((link) => (
                    <MenuLink key={link.label} item={link} onSelect={onClose} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="mt-4" onClick={onClose}>
          <SquareButton tone="light" to="/request-access" className="w-full">
            Get Started
          </SquareButton>
        </div>
      </div>
    </div>
  )
}

export function Nav() {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const triggerRefs = useRef<
    Partial<Record<MenuKey, HTMLButtonElement | null>>
  >({})
  const mobileToggleRef = useRef<HTMLButtonElement>(null)

  const closeMenu = () => setOpenMenu(null)
  const toggleMenu = (key: MenuKey) => {
    setOpenMenu((current) => (current === key ? null : key))
  }

  useEffect(() => {
    if (!openMenu) return

    function handlePointerDown(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const trigger = openMenu ? triggerRefs.current[openMenu] : null
        closeMenu()
        trigger?.focus()
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [openMenu])

  useEffect(() => {
    if (!mobileOpen) return

    document.body.style.overflow = "hidden"
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false)
        mobileToggleRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [mobileOpen])

  function handleBlur(e: FocusEvent<HTMLElement>) {
    if (
      openMenu &&
      headerRef.current &&
      !headerRef.current.contains(e.relatedTarget)
    ) {
      closeMenu()
    }
  }

  const activeMenu = MENUS.find((m) => m.key === openMenu)

  return (
    <>
      <header
        ref={headerRef}
        onBlur={handleBlur}
        className="fixed inset-x-0 top-0 z-50 border-b border-hairline bg-app/70 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 md:px-10">
          <Link href="/" className="text-[15px] font-semibold text-ink">
            Isildur
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {MENUS.map((menu) => (
              <button
                key={menu.key}
                type="button"
                ref={(el) => {
                  triggerRefs.current[menu.key] = el
                }}
                aria-expanded={openMenu === menu.key}
                onClick={() => toggleMenu(menu.key)}
                className="text-[15px] font-normal text-ink"
              >
                {menu.label}
              </button>
            ))}
          </nav>

          <div className="hidden md:block">
            <SquareButton tone="light" to="/request-access">
              Get Started
            </SquareButton>
          </div>

          <button
            ref={mobileToggleRef}
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 items-center justify-center text-ink md:hidden"
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        <div
          className={cn(
            "duration-fast grid overflow-hidden transition-[grid-template-rows] ease-out",
            openMenu && "border-t border-hairline"
          )}
          style={{ gridTemplateRows: openMenu ? "1fr" : "0fr" }}
        >
          <div className="min-h-0 overflow-hidden bg-app">
            {activeMenu && <MenuPanel menu={activeMenu} onSelect={closeMenu} />}
          </div>
        </div>
      </header>
      {mobileOpen && <MobileMenu onClose={() => setMobileOpen(false)} />}
    </>
  )
}
