import type { Metadata } from "next"
import type { ReactElement } from "react"

import { MeaningClient } from "./meaning-client"

export const metadata: Metadata = {
  title: "Meaning — Control Room — Isildur",
  description:
    "How raw numbers from your systems become statements about people and places.",
}

export default function MeaningPage(): ReactElement {
  return <MeaningClient />
}
