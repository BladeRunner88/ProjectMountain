'use client'

import { useCallback } from 'react'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export const IDENTITY_SUB_TABS = [
  { id: 'list', label: 'List' },
  { id: 'source-records', label: 'Source records' },
  { id: 'method', label: 'Method' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'decision', label: 'Decision' },
] as const

export type IdentitySubTab = (typeof IDENTITY_SUB_TABS)[number]['id']

export function isIdentitySubTab(value: string): value is IdentitySubTab {
  return IDENTITY_SUB_TABS.some((t) => t.id === value)
}

export interface IdentitySubnavValue {
  sub: IdentitySubTab
  climberId: string | null
  setSub: (sub: IdentitySubTab) => void
  setPerson: (climberId: string, moveToSourceRecords: boolean) => void
}

export function useIdentitySubnav(): IdentitySubnavValue {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const subRaw = searchParams.get('sub')
  const sub: IdentitySubTab = subRaw !== null && isIdentitySubTab(subRaw) ? subRaw : 'list'
  const climberId = searchParams.get('climberId')

  const replaceQuery = useCallback(
    (next: { sub?: IdentitySubTab; climberId?: string | null }): void => {
      const params = new URLSearchParams(searchParams.toString())
      if (next.sub !== undefined) params.set('sub', next.sub)
      if (next.climberId !== undefined) {
        if (next.climberId) params.set('climberId', next.climberId)
        else params.delete('climberId')
      }
      const qs = params.toString()
      // `usePathname()` is a plain string, so typedRoutes cannot check this one
      // statically — the cast is the documented escape hatch for non-literal hrefs.
      const href = (qs ? `${pathname}?${qs}` : pathname) as Route
      router.replace(href, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const setSub = useCallback(
    (next: IdentitySubTab): void => {
      replaceQuery({ sub: next })
    },
    [replaceQuery]
  )

  const setPerson = useCallback(
    (id: string, moveToSourceRecords: boolean): void => {
      replaceQuery({
        climberId: id,
        ...(moveToSourceRecords ? { sub: 'source-records' as const } : {}),
      })
    },
    [replaceQuery]
  )

  return { sub, climberId, setSub, setPerson }
}
