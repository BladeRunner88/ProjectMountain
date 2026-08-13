import type { NodeStatus } from './domain'

export interface ClimberVitals {
  spo2: number
  hr: number
}

export interface EnvironmentReading {
  tempC: number
  windKph: number
  windBearingDeg: number
  visibilityM: number
  snowfallCm24h: number
  freezingLevelM: number
}

export type SourceId =
  | 'sensor-mesh'
  | 'weather-feed'
  | 'permit-registry'
  | 'operator-rosters'
  | 'medical-logs'

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
  | { type: 'climber'; id: string }
  | { type: 'environment'; id: string }
