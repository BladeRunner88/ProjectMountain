import type { SourceId } from '@/features/demo/types'

export interface SourceRow {
  id: SourceId
  name: string
  recordCount: number
  lastSync: Date
  degraded: boolean
}

export interface StationTemp {
  label: string
  tempC: number
}

export type { SourceId }
