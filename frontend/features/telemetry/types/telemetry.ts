/** Live sensor readings, as the backend reconstructs them. */

export interface SeriesPoint {
  t: string
  v: number
}

export interface Reading {
  sensorId: string
  machineId: string | null
  channel: string
  unit: string
  value: number
  baseline: number
  deviationSigma: number
  quality: string
  qualityReason: string | null
  status: string
  series: SeriesPoint[]
}

export interface SourceFreshness {
  sourceFile: string
  lastSyncAt: string | null
  ageSeconds: number | null
  records: number
  failed: number
  degraded: boolean
}

export interface Snapshot {
  asOf: string
  tick: number
  tickSeconds: number
  nextAt: string
  windowSeconds: number
  readings: Reading[]
  sources: SourceFreshness[]
  counters: {
    sensorsReporting: number
    sensorsStale: number
    sensorsSuspect: number
    machinesMonitored: number
  }
}

export interface Channel {
  channel: string
  unit: string
  sensorCount: number
  nominalMin: number
  nominalMax: number
}

/** The channels the panels read by name. */
export const CHANNEL = {
  oee: "oee_pct",
  vibration: "vibration_mm_s",
  spindleTemp: "spindle_temp_c",
  cycleTime: "cycle_time_s",
  supplyPressure: "pressure_bar",
  returnPressure: "return_pressure_bar",
} as const

/** Readings for one machine, indexed by channel. */
export function readingsByChannel(
  snapshot: Snapshot | undefined,
  machineId: string | null
): Map<string, Reading> {
  const byChannel = new Map<string, Reading>()
  if (!snapshot || !machineId) return byChannel
  for (const reading of snapshot.readings) {
    if (reading.machineId === machineId) byChannel.set(reading.channel, reading)
  }
  return byChannel
}
