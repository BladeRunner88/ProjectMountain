import type { Metadata } from "next"
import type { ReactElement } from "react"

import { ModelClient } from "./model-client"

export const metadata: Metadata = {
  title: "Model — Control Room — Isildur",
  description:
    "What things exist in your world, what facts they carry, and how they connect.",
}

export default function ModelPage(): ReactElement {
  return <ModelClient />
}
