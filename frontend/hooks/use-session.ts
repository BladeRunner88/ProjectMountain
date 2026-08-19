"use client"

import { hasAccess } from "@/lib/access"
import {
  AccessProvider,
  useAccess,
  type AccessContextValue,
  type AccessSummary,
} from "@/hooks/use-access"

export type Session = AccessContextValue

export function useSession(): Session {
  return useAccess()
}

export { AccessProvider, hasAccess, useAccess, type AccessSummary }
