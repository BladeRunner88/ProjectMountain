import type { Metadata } from "next"
import type { ReactElement } from "react"

import { RevisionClient } from "./revision-client"

export const metadata: Metadata = {
  title: "Revision — Control Room — Isildur",
  description:
    "Everything waiting on a human, everything decided, and what each decision changed.",
}

export default function RevisionPage(): ReactElement {
  return <RevisionClient />
}
