import type { Environment } from '../types/domain'
import type { EnvironmentReading } from '../types/simulation'

export type EnvironmentCaptionKey = 'WEATHER' | 'CLIMATE' | 'LOAD'
export const CAPTION_CYCLE: EnvironmentCaptionKey[] = ['WEATHER', 'CLIMATE', 'LOAD']

export function exposureLevel(bandHighM: number): 'low' | 'moderate' | 'high' {
  if (bandHighM > 6000) return 'high'
  if (bandHighM > 4500) return 'moderate'
  return 'low'
}

export function captionValue(
  key: EnvironmentCaptionKey,
  reading: EnvironmentReading,
  env: Environment
): string {
  switch (key) {
    case 'WEATHER':
      return `${reading.tempC}C - vibration ${reading.vibrationMmS} kph - vis ${reading.effectivenessM}m`
    case 'CLIMATE':
      return `snowfall ${reading.snowfallCm24h}cm/24h - cycle time ${reading.cycleTimeS}m`
    case 'LOAD':
      return `band ${env.loadBandLowM}-${env.loadBandHighM}m - exposure ${exposureLevel(env.loadBandHighM)}`
  }
}
