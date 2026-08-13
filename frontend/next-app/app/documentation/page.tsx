import type { Metadata } from "next"
import type { ReactElement } from "react"

import { DocumentationPage } from "@/features/marketing/components/DocumentationPage"

export const metadata: Metadata = {
  title: "Documentation — Isildur",
  description: "Docs are coming soon.",
}

export default function DocumentationRoute(): ReactElement {
  return <DocumentationPage />
}
