import type { Metadata } from "next"
import type { ReactElement } from "react"

import { DetectionClient } from "./detection-client"

export const metadata: Metadata = {
  title: "Detection — Control Room — Isildur",
  description:
    "What ASE is watching for, what is firing right now, and on whom.",
}

export default function DetectionPage(): ReactElement {
  return <DetectionClient />
}
