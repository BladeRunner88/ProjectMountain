import type { Metadata } from "next"
import type { ReactElement } from "react"

import { ProcessingClient } from "./processing-client"

export const metadata: Metadata = {
  title: "Processing — Control Room — Isildur",
  description:
    "Live throughput and health for every connected source, end to end.",
}

export default function ProcessingPage(): ReactElement {
  return <ProcessingClient />
}
