import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'isildur_access_request'

export type AccessSummary = {
  companyName: string
  industry: string
  country: string
  deploymentEnvironment: string
  billingContactEmail: string
}

type AccessContextValue = {
  granted: boolean
  summary: AccessSummary | null
  grantAccess: (summary: AccessSummary) => void
}

const AccessContext = createContext<AccessContextValue | null>(null)

function readStored(): { granted: boolean; summary: AccessSummary | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { granted: false, summary: null }
    return { granted: true, summary: JSON.parse(raw) as AccessSummary }
  } catch {
    return { granted: false, summary: null }
  }
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readStored)

  const grantAccess = (summary: AccessSummary) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summary))
    setState({ granted: true, summary })
  }

  return (
    <AccessContext.Provider value={{ ...state, grantAccess }}>
      {children}
    </AccessContext.Provider>
  )
}

export function useAccess() {
  const ctx = useContext(AccessContext)
  if (!ctx) throw new Error('useAccess must be used within AccessProvider')
  return ctx
}
