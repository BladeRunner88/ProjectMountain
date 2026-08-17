import type { Metadata } from "next"
import type { ReactElement } from "react"

import { ExposureClient } from "./exposure-client"

export const metadata: Metadata = {
  title: "Exposure — Control Room — Isildur",
  description: "What happens to what we know when a source fails.",
}

export default function ExposurePage(): ReactElement {
  return <ExposureClient />
}
