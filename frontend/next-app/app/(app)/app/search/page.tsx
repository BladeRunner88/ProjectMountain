import type { Metadata } from "next"
import type { ReactElement } from "react"

import { SearchView } from "@/features/search/components/SearchView"

export const metadata: Metadata = {
  title: "Search — Isildur",
  description: "Search resolved entities, aliases, and relationships.",
}

export default function SearchPage(): ReactElement {
  return <SearchView />
}
