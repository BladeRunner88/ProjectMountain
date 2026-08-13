import type { Metadata } from "next"
import type { ReactElement } from "react"

import { RequestAccessForm } from "@/features/access/components/RequestAccessForm"

export const metadata: Metadata = {
  title: "Request access — Isildur",
  description: "We review every organization before granting access.",
}

export default function RequestAccessPage(): ReactElement {
  return <RequestAccessForm />
}
