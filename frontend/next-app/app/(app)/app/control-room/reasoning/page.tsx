import type { Metadata } from "next"
import type { ReactElement } from "react"

import { ReasoningClient } from "./reasoning-client"

export const metadata: Metadata = {
  title: "Reasoning — Control Room — Isildur",
  description:
    "How ASE traces a problem back across every system to find why, and what it ruled out.",
}

export default function ReasoningPage(): ReactElement {
  return <ReasoningClient />
}
