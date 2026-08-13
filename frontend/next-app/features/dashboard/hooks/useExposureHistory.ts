'use client'

import { useEffect, useState } from 'react'

const EXPOSURE_HISTORY_LENGTH = 30
const EXPOSURE_SAMPLE_MS = 3000

export function useExposureHistory(currentExposureLoadPct: number): number[] {
  const [exposureHistory, setExposureHistory] = useState<number[]>(() =>
    Array(EXPOSURE_HISTORY_LENGTH).fill(currentExposureLoadPct)
  )
  useEffect(() => {
    const interval = window.setInterval(() => {
      setExposureHistory((prev) => [...prev.slice(1), currentExposureLoadPct])
    }, EXPOSURE_SAMPLE_MS)
    return () => window.clearInterval(interval)
  }, [currentExposureLoadPct])
  return exposureHistory
}
