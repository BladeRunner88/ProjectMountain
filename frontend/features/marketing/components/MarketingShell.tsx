import type { ReactNode } from "react"

import { Footer } from "./Footer"
import { Nav } from "./Nav"

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-app font-inter">
      <Nav />
      <main className="pt-14">{children}</main>
      <Footer />
    </div>
  )
}
