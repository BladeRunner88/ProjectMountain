// The one central simulation store for the whole demo graph. Every timer
// that makes the graph feel alive lives here — nowhere else sets an
// interval. Three independent cadences:
//
//   1500ms — climber SpO2/HR jitter around their base values (cosmetic).
//   4000ms — environment temp/wind/visibility/snowfall drift (cosmetic).
//  12000ms — exactly one status transition somewhere in the graph, picked
//            from a seeded rotation over climbers + environments (the only
//            two tiers with independently-settable status — company/
//            region/country stay pure roll-up, see layout.ts).
//
// The transition tick is what actually drives colour: it flips one leaf's
// NodeStatus, which computeStatusOf() rolls up into company/region/country
// on the next render. The cosmetic ticks never touch status.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Climber, Environment, NodeStatus, Region } from '../../../demo/types'

const CLIMBER_TICK_MS = 1500
const ENVIRONMENT_TICK_MS = 4000
const TRANSITION_TICK_MS = 12000

const CLIMBER_HISTORY_LENGTH = 40
const WIND_HISTORY_LENGTH = 24
const FINDINGS_CAP = 40
const FLASH_DURATION_MS = 600

const ANOMALY_COUNT_MIN = 6
const ANOMALY_COUNT_MAX = 12

// fixed so the exact same transition sequence plays at every demo
const ROTATION_SEED = 424242

function mulberry32(seed: number) {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function jitterInt(spread: number) {
  return Math.round((Math.random() * 2 - 1) * spread)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function nowTimeString(): string {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

// -- climber vitals ----------------------------------------------------

export interface ClimberVitals {
  spo2: number
  hr: number
}

// -- environment readings ------------------------------------------------

export interface EnvironmentReading {
  tempC: number
  windKph: number
  windBearingDeg: number
  visibilityM: number
  snowfallCm24h: number
  freezingLevelM: number
}

function wrapDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function nextReading(prev: EnvironmentReading): EnvironmentReading {
  return {
    tempC: clamp(prev.tempC + jitterInt(2), -35, 15),
    windKph: clamp(prev.windKph + jitterInt(8), 0, 140),
    windBearingDeg: wrapDeg(prev.windBearingDeg + jitterInt(12)),
    visibilityM: clamp(prev.visibilityM + jitterInt(300), 20, 10000),
    snowfallCm24h: clamp(prev.snowfallCm24h + jitterInt(3), 0, 100),
    // status no longer reacts to readings (that's the scheduler's job now),
    // so freezing level has no reason to move
    freezingLevelM: prev.freezingLevelM,
  }
}

// -- status transitions ---------------------------------------------------

type LeafKind = 'climber' | 'environment'

interface StatusState {
  climberStatus: Map<string, NodeStatus>
  environmentStatus: Map<string, NodeStatus>
  anomalyCount: number
  rotationIndex: number
}

// The five upstream feeds shown in the Dashboard's CONNECTED SYSTEMS panel.
// Only two of them ever produce findings — the rest are registries/rosters
// with no live anomaly detection of their own — but every finding is
// tagged so that panel can filter the feed down to one source.
export type SourceId = 'sensor-mesh' | 'weather-feed' | 'permit-registry' | 'operator-rosters' | 'medical-logs'

export interface Finding {
  id: string
  time: string
  level: NodeStatus
  message: string
  source: SourceId
}

function nextLeafStatus(kind: LeafKind, current: NodeStatus): NodeStatus {
  if (kind === 'climber') return current === 'anomaly' ? 'nominal' : 'anomaly'
  if (current === 'nominal') return 'watch'
  if (current === 'watch') return 'anomaly'
  return 'nominal'
}

function anomalyDelta(from: NodeStatus, to: NodeStatus): number {
  const fromAnomaly = from === 'anomaly'
  const toAnomaly = to === 'anomaly'
  if (fromAnomaly === toAnomaly) return 0
  return toAnomaly ? 1 : -1
}

interface Transition {
  id: string
  kind: LeafKind
  from: NodeStatus
  to: NodeStatus
}

// Scans forward from the rotation pointer for the next target whose natural
// transition keeps the leaf anomaly count within [MIN, MAX] — almost always
// the very next one in rotation, only skipping when right at a bound.
function advanceRotation(
  prev: StatusState,
  rotation: string[],
  kindOf: ReadonlyMap<string, LeafKind>
): { next: StatusState; transition: Transition | null } {
  for (let attempt = 0; attempt < rotation.length; attempt++) {
    const idx = (prev.rotationIndex + attempt) % rotation.length
    const id = rotation[idx]
    const kind = kindOf.get(id)!
    const statusMap = kind === 'climber' ? prev.climberStatus : prev.environmentStatus
    const current = statusMap.get(id)!
    const to = nextLeafStatus(kind, current)
    const delta = anomalyDelta(current, to)
    if (delta > 0 && prev.anomalyCount + delta > ANOMALY_COUNT_MAX) continue
    if (delta < 0 && prev.anomalyCount + delta < ANOMALY_COUNT_MIN) continue

    const climberStatus = kind === 'climber' ? new Map(prev.climberStatus).set(id, to) : prev.climberStatus
    const environmentStatus = kind === 'environment' ? new Map(prev.environmentStatus).set(id, to) : prev.environmentStatus

    return {
      next: {
        climberStatus,
        environmentStatus,
        anomalyCount: prev.anomalyCount + delta,
        rotationIndex: (idx + 1) % rotation.length,
      },
      transition: { id, kind, from: current, to },
    }
  }
  // every candidate would violate the cap — shouldn't happen with 64
  // candidates and a [6, 12] window, but never block the tick on it
  return { next: prev, transition: null }
}

function buildFinding(
  transition: Transition,
  climberById: ReadonlyMap<string, Climber>,
  environmentById: ReadonlyMap<string, Environment>,
  regionNameByEnvironmentId: ReadonlyMap<string, string>,
  windKph: number
): Finding {
  const level = transition.to
  let message: string
  if (transition.kind === 'climber') {
    const climber = climberById.get(transition.id)!
    message =
      transition.to === 'anomaly'
        ? `${climber.name} - SpO2/HR outside safe range`
        : `${climber.name} - vitals returned to baseline`
  } else {
    const env = environmentById.get(transition.id)!
    const regionName = regionNameByEnvironmentId.get(env.id) ?? 'Unknown route'
    if (transition.to === 'watch') message = `${regionName} - conditions deteriorating (wind ${windKph} kph)`
    else if (transition.to === 'anomaly') message = `${regionName} - wind ${windKph} kph exceeds operating threshold`
    else message = `${regionName} - conditions normalized`
  }
  const source: SourceId = transition.kind === 'climber' ? 'sensor-mesh' : 'weather-feed'
  return { id: `${transition.id}-${Date.now()}`, time: nowTimeString(), level, message, source }
}

// -- the store --------------------------------------------------------------

export interface GraphSimulation {
  climberVitals: Map<string, ClimberVitals>
  climberSpo2History: Map<string, number[]>
  climberHrHistory: Map<string, number[]>
  climberStatus: Map<string, NodeStatus>
  environmentReading: Map<string, EnvironmentReading>
  environmentStatus: Map<string, NodeStatus>
  windHistory: Map<string, number[]>
  findings: Finding[]
  flashId: string | null
}

export function useGraphSimulation(climbers: Climber[], environments: Environment[], regions: Region[]): GraphSimulation {
  const climberById = useMemo(() => new Map(climbers.map((c) => [c.id, c])), [climbers])
  const environmentById = useMemo(() => new Map(environments.map((e) => [e.id, e])), [environments])
  const regionNameById = useMemo(() => new Map(regions.map((r) => [r.id, r.name])), [regions])
  const regionNameByEnvironmentId = useMemo(
    () => new Map(environments.map((e) => [e.id, regionNameById.get(e.regionId) ?? e.regionId])),
    [environments, regionNameById]
  )

  // --- climber vitals: pure noise around each climber's own base values ---
  const [climberVitals, setClimberVitals] = useState<Map<string, ClimberVitals>>(
    () => new Map(climbers.map((c) => [c.id, { spo2: c.baseSpO2, hr: c.baseHr }]))
  )
  const [climberSpo2History, setClimberSpo2History] = useState<Map<string, number[]>>(
    () => new Map(climbers.map((c) => [c.id, Array(CLIMBER_HISTORY_LENGTH).fill(c.baseSpO2)]))
  )
  const [climberHrHistory, setClimberHrHistory] = useState<Map<string, number[]>>(
    () => new Map(climbers.map((c) => [c.id, Array(CLIMBER_HISTORY_LENGTH).fill(c.baseHr)]))
  )

  useEffect(() => {
    const interval = window.setInterval(() => {
      const vitals = new Map<string, ClimberVitals>()
      for (const climber of climbers) {
        vitals.set(climber.id, {
          spo2: clamp(climber.baseSpO2 + jitterInt(1), 40, 100),
          hr: clamp(climber.baseHr + jitterInt(4), 30, 220),
        })
      }
      setClimberVitals(vitals)
      setClimberSpo2History((prev) => {
        const next = new Map<string, number[]>()
        for (const climber of climbers) next.set(climber.id, [...(prev.get(climber.id) ?? []).slice(1), vitals.get(climber.id)!.spo2])
        return next
      })
      setClimberHrHistory((prev) => {
        const next = new Map<string, number[]>()
        for (const climber of climbers) next.set(climber.id, [...(prev.get(climber.id) ?? []).slice(1), vitals.get(climber.id)!.hr])
        return next
      })
    }, CLIMBER_TICK_MS)
    return () => window.clearInterval(interval)
  }, [climbers])

  // --- environment readings: bounded random walk from the initial values ---
  const [environmentReading, setEnvironmentReading] = useState<Map<string, EnvironmentReading>>(
    () =>
      new Map(
        environments.map((e, i) => [
          e.id,
          {
            tempC: e.tempC,
            windKph: e.windKph,
            // deterministic starting bearing spread around the compass, no
            // authored direction data to seed from
            windBearingDeg: wrapDeg(i * 137),
            visibilityM: e.visibilityM,
            snowfallCm24h: e.snowfallCm24h,
            freezingLevelM: e.freezingLevelM,
          },
        ])
      )
  )
  const environmentReadingRef = useRef(environmentReading)
  useEffect(() => {
    environmentReadingRef.current = environmentReading
  }, [environmentReading])
  const [windHistory, setWindHistory] = useState<Map<string, number[]>>(
    () => new Map(environments.map((e) => [e.id, Array(WIND_HISTORY_LENGTH).fill(e.windKph)]))
  )

  useEffect(() => {
    const interval = window.setInterval(() => {
      setEnvironmentReading((prev) => {
        const next = new Map<string, EnvironmentReading>()
        for (const env of environments) next.set(env.id, nextReading(prev.get(env.id)!))
        return next
      })
      setWindHistory((prev) => {
        const next = new Map<string, number[]>()
        for (const env of environments) {
          const reading = environmentReadingRef.current.get(env.id)!
          next.set(env.id, [...(prev.get(env.id) ?? []).slice(1), reading.windKph])
        }
        return next
      })
    }, ENVIRONMENT_TICK_MS)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environments])

  // --- status transitions: one every 12s, from a seeded rotation ---
  const rotation = useMemo(
    () => seededShuffle([...climbers.map((c) => c.id), ...environments.map((e) => e.id)], ROTATION_SEED),
    [climbers, environments]
  )
  const kindOf = useMemo(() => {
    const map = new Map<string, LeafKind>()
    for (const c of climbers) map.set(c.id, 'climber')
    for (const e of environments) map.set(e.id, 'environment')
    return map
  }, [climbers, environments])

  // A handful of environments start seeded anomalous alongside climbers.js's
  // own fixed anomaly set — together they must land inside [6, 12], not just
  // look plausible on their own (see the comment on climbers.js's own set).
  const INITIAL_ANOMALY_ENVIRONMENT_INDICES = useMemo(() => new Set([1, 6, 11]), [])

  const initialStatusState = useMemo<StatusState>(() => {
    const climberStatus = new Map<string, NodeStatus>()
    let anomalyCount = 0
    for (const c of climbers) {
      const status: NodeStatus = c.anomaly ? 'anomaly' : 'nominal'
      climberStatus.set(c.id, status)
      if (status === 'anomaly') anomalyCount++
    }
    const environmentStatus = new Map<string, NodeStatus>()
    environments.forEach((e, i) => {
      const status: NodeStatus = INITIAL_ANOMALY_ENVIRONMENT_INDICES.has(i) ? 'anomaly' : 'nominal'
      environmentStatus.set(e.id, status)
      if (status === 'anomaly') anomalyCount++
    })
    return { climberStatus, environmentStatus, anomalyCount, rotationIndex: 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [climbers, environments])

  const statusRef = useRef(initialStatusState)
  const [statusState, setStatusState] = useState(initialStatusState)
  const [findings, setFindings] = useState<Finding[]>([])
  const [flashId, setFlashId] = useState<string | null>(null)

  useEffect(() => {
    let flashTimeout: ReturnType<typeof window.setTimeout> | undefined
    const interval = window.setInterval(() => {
      const { next, transition } = advanceRotation(statusRef.current, rotation, kindOf)
      statusRef.current = next
      setStatusState(next)
      if (transition) {
        const windKph =
          transition.kind === 'environment' ? environmentReadingRef.current.get(transition.id)?.windKph ?? 0 : 0
        const finding = buildFinding(transition, climberById, environmentById, regionNameByEnvironmentId, windKph)
        setFindings((prev) => [...prev, finding].slice(-FINDINGS_CAP))
        setFlashId(transition.id)
        flashTimeout = window.setTimeout(() => {
          setFlashId((f) => (f === transition.id ? null : f))
        }, FLASH_DURATION_MS)
      }
    }, TRANSITION_TICK_MS)
    return () => {
      window.clearInterval(interval)
      if (flashTimeout !== undefined) window.clearTimeout(flashTimeout)
    }
  }, [rotation, kindOf, climberById, environmentById, regionNameByEnvironmentId])

  return {
    climberVitals,
    climberSpo2History,
    climberHrHistory,
    climberStatus: statusState.climberStatus,
    environmentReading,
    environmentStatus: statusState.environmentStatus,
    windHistory,
    findings,
    flashId,
  }
}
