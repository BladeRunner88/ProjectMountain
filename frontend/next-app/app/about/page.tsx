import type { Metadata } from "next"
import type { ReactElement } from "react"

import { AboutPage } from "@/features/marketing/components/AboutPage"

export const metadata: Metadata = {
  title: "About — Isildur",
  description: "More on our story is coming soon.",
}

export default function AboutLine(): ReactElement {
  return <AboutPage />
}
