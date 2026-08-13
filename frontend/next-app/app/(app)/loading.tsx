import type { ReactElement } from "react"

import { LoadingState } from "@/components/ui/loading-state"

export default function AppLoading(): ReactElement {
  return <LoadingState label="Loading" />
}
