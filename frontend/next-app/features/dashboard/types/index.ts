import type { SourceId } from '@/features/demo/types'

export interface SourceRow {
  id: SourceId
  name: string
  recordCount: number
  lastSync: Date
  degraded: boolean
}

export interface CampTemp {
  label: string
  tempC: number
}

export type { SourceId }
