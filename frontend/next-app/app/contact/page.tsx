import type { Metadata } from "next"
import type { ReactElement } from "react"

import { ContactPage } from "@/features/marketing/components/ContactPage"

export const metadata: Metadata = {
  title: "Contact — Isildur",
  description: "A contact form is coming soon.",
}

export default function ContactLine(): ReactElement {
  return <ContactPage />
}
