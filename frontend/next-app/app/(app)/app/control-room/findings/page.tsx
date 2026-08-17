import type { Metadata } from "next"
import type { ReactElement } from "react"

import { FindingsPage } from "@/features/findings"

export const metadata: Metadata = {
  title: "Findings — Control Room — Isildur",
  description:
    "Every open finding ASE has raised, and the entity each one is about.",
}

export default function ControlRoomFindingsPage(): ReactElement {
  return <FindingsPage />
}
