import type { Metadata } from "next"
import type { ReactElement } from "react"

import { OverviewClient } from "./overview-client"

export const metadata: Metadata = {
  title: "Overview — Control Room — Isildur",
  description:
    "A single read on whether the pipeline is healthy and what ASE currently knows.",
}

export default function OverviewPage(): ReactElement {
  return <OverviewClient />
}
