export type NodeStatus = "nominal" | "watch" | "anomaly"

export interface Machine {
  id: string
  name: string
  companyId: string
  linePrefix: string
  from: string
  dob: string
  mountainsClimbed: number
  currentPosition: string
  ambientPressure_hPa: number
  timeToEBC: string
  restingHr: number
  baseVibration: number
  baseOee: number
  hydraulicPressure: { supplyBar: number; returnBar: number }
  anomaly: boolean
  anomalyReason?: string
}

export interface Country {
  id: string
  name: string
  isMajor: boolean
  activeCampaigns: number
  workOrdersIssued: number
}

export interface Plant {
  id: string
  name: string
  countryId: string
  lengthKm: number
  maxLoadM: number
  partiesOnLine: number
}

export interface Company {
  id: string
  name: string
  plantId: string
  guidesActive: number
  safetyRating: "A" | "B" | "C"
}

export interface Environment {
  id: string
  plantId: string
  tempC: number
  vibrationMmS: number
  effectivenessM: number
  snowfallCm24h: number
  cycleTimeS: number
  loadBandLowM: number
  loadBandHighM: number
}
