"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactElement, type ReactNode } from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { AccessProvider } from "@/hooks/use-access"
import { createQueryClient } from "@/lib/query-client"

export function Providers({ children }: { children: ReactNode }): ReactElement {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AccessProvider>{children}</AccessProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
