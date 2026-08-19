import { latest } from '@/features/ase/services/graph'
import type { TracedValue } from '@/features/ase/services/traced'

export function tracedDisplayString(tv: TracedValue<unknown>): string {
  const current = latest(tv)
  const value = current.value
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

export function formatUnknownNumber(value: unknown, suffix = ''): string {
  if (typeof value === 'number') return `${value}${suffix}`
  return `${String(value)}${suffix}`
}
