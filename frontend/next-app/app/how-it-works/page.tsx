import type { Metadata } from "next"
import type { ReactElement } from "react"

import { HowItWorksPage } from "@/features/marketing/components/HowItWorksPage"

export const metadata: Metadata = {
  title: "How it works — Isildur",
  description:
    "Connect, clean, understand, search, and automate — how ASE turns operational data into decisions.",
}

export default function HowItWorksRoute(): ReactElement {
  return <HowItWorksPage />
}
