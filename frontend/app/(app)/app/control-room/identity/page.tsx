import type { Metadata } from "next"
import type { ReactElement } from "react"

import { IdentityClient } from "./identity-client"

export const metadata: Metadata = {
  title: "Identity — Control Room — Isildur",
  description:
    "Every person ASE has resolved, who they are, and how it worked them out.",
}

export default function IdentityPage(): ReactElement {
  return <IdentityClient />
}
