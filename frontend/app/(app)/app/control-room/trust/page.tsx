import type { Metadata } from "next"
import type { ReactElement } from "react"

import { TrustClient } from "./trust-client"

export const metadata: Metadata = {
  title: "Trust — Control Room — Isildur",
  description:
    "How it is built, how it is secured, how it is tested, and how it connects to everything else.",
}

export default function TrustPage(): ReactElement {
  return <TrustClient />
}
