import type { Metadata } from "next"
import type { ReactElement } from "react"

import { PredictionClient } from "./prediction-client"

export const metadata: Metadata = {
  title: "Prediction — Control Room — Isildur",
  description:
    "How the mountain is changing this person, their body, their judgement, and what happens next.",
}

export default function PredictionPage(): ReactElement {
  return <PredictionClient />
}
