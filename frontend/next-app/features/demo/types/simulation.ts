import type { NodeStatus } from './domain'

export interface MachineReadings {
  oee: number
  vibration: number
}

export interface EnvironmentReading {
  tempC: number
  vibrationMmS: number
  vibrationBearingDeg: number
  effectivenessM: number
  snowfallCm24h: number
  cycleTimeS: number
}

export type SourceId =
  | 'sensor-mesh'
  | 'weather-feed'
  | 'workOrder-registry'
  | 'operator-registers'
  | 'service-logs'

export interface Finding {
  id: string
  time: string
  level: NodeStatus
  message: string
  source: SourceId
  subjectId: string
  subjectName: string
}

export type GraphSelection =
  | { type: 'machine'; id: string }
  | { type: 'environment'; id: string }
