import type { Metadata } from "next"
import type { ReactElement } from "react"

import { DemoEnter } from "@/features/demo/components/DemoEnter"

export const metadata: Metadata = {
  title: "Demo — Isildur",
  description: "Enter the ASE expedition demo.",
}

export default function DemoEnterPage(): ReactElement {
  return <DemoEnter />
}
