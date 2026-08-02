// Formatting shared between the always-on node caption (ClimberGraphCanvas)
// and the full reading list in EnvironmentSidePanel, so the two never say
// different things about the same sensor.

import type { Environment } from '../../../demo/types'
import type { EnvironmentReading } from './useGraphSimulation'

export type EnvironmentCaptionKey = 'WEATHER' | 'CLIMATE' | 'ALTITUDE'
export const CAPTION_CYCLE: EnvironmentCaptionKey[] = ['WEATHER', 'CLIMATE', 'ALTITUDE']

export function exposureLevel(bandHighM: number): 'low' | 'moderate' | 'high' {
  if (bandHighM > 6000) return 'high'
  if (bandHighM > 4500) return 'moderate'
  return 'low'
}

export function captionValue(key: EnvironmentCaptionKey, reading: EnvironmentReading, env: Environment): string {
  switch (key) {
    case 'WEATHER':
      return `${reading.tempC}C - wind ${reading.windKph} kph - vis ${reading.visibilityM}m`
    case 'CLIMATE':
      return `snowfall ${reading.snowfallCm24h}cm/24h - freezing level ${reading.freezingLevelM}m`
    case 'ALTITUDE':
      return `band ${env.altitudeBandLowM}-${env.altitudeBandHighM}m - exposure ${exposureLevel(env.altitudeBandHighM)}`
  }
}
