import type { Metadata } from "next"
import type { ReactElement } from "react"

import { LandingPage } from "@/features/marketing/components/LandingPage"

export const metadata: Metadata = {
  title: "Isildur",
  description:
    "Isildur builds the layer that turns scattered operational data into one decision you can act on with confidence.",
}

export default function HomePage(): ReactElement {
  return <LandingPage />
}
