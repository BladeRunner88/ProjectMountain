'use client'

import type { Density } from '../types/density'
import { useChromeStore } from '../stores/chromeStore'

export function useDensity(): [Density, () => void] {
  const density = useChromeStore((s) => s.density)
  const toggle = useChromeStore((s) => s.toggleDensity)
  return [density, toggle]
}
