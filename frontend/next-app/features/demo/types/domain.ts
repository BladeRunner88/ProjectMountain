export type NodeStatus = 'nominal' | 'watch' | 'anomaly'

export interface Climber {
  id: string
  name: string
  companyId: string
  ethnicity: string
  from: string
  dob: string
  mountainsClimbed: number
  currentPosition: string
  ambientPressure_hPa: number
  timeToEBC: string
  restingHr: number
  baseHr: number
  baseSpO2: number
  bloodPressure: { systolic: number; diastolic: number }
  anomaly: boolean
  anomalyReason?: string
}

export interface Country {
  id: string
  name: string
  isMajor: boolean
  activeExpeditions: number
  permitsIssued: number
}

export interface Region {
  id: string
  name: string
  countryId: string
  lengthKm: number
  maxAltitudeM: number
  partiesOnRoute: number
}

export interface Company {
  id: string
  name: string
  regionId: string
  guidesActive: number
  safetyRating: 'A' | 'B' | 'C'
}

export interface Environment {
  id: string
  regionId: string
  tempC: number
  windKph: number
  visibilityM: number
  snowfallCm24h: number
  freezingLevelM: number
  altitudeBandLowM: number
  altitudeBandHighM: number
}
