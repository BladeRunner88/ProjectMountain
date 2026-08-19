import type { Machine, Environment, NodeStatus } from '../types/domain'
import type { EnvironmentReading, Finding, SourceId } from '../types/simulation'

export const MACHINE_TICK_MS = 1500
export const ENVIRONMENT_TICK_MS = 4000
export const TRANSITION_TICK_MS = 12000

export const MACHINE_HISTORY_LENGTH = 40
export const WIND_HISTORY_LENGTH = 24
export const FINDINGS_CAP = 40
export const FLASH_DURATION_MS = 600

export const ANOMALY_COUNT_MIN = 6
export const ANOMALY_COUNT_MAX = 12

export const ROTATION_SEED = 424242

export const INITIAL_ANOMALY_ENVIRONMENT_INDICES = new Set([1, 6, 11])

export type LeafKind = 'machine' | 'environment'

export interface StatusState {
  machineStatus: Map<string, NodeStatus>
  environmentStatus: Map<string, NodeStatus>
  anomalyCount: number
  rotationIndex: number
}

export interface Transition {
  id: string
  kind: LeafKind
  from: NodeStatus
  to: NodeStatus
}

function mulberry32(seed: number): () => number {
  let a = seed
  return function random(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const a = result[i]
    const b = result[j]
    if (a === undefined || b === undefined) continue
    result[i] = b
    result[j] = a
  }
  return result
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function jitterInt(spread: number): number {
  return Math.round((Math.random() * 2 - 1) * spread)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function nowTimeString(): string {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function wrapDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

export function nextReading(prev: EnvironmentReading): EnvironmentReading {
  return {
    tempC: clamp(prev.tempC + jitterInt(2), -35, 15),
    vibrationMmS: clamp(prev.vibrationMmS + jitterInt(8), 0, 140),
    vibrationBearingDeg: wrapDeg(prev.vibrationBearingDeg + jitterInt(12)),
    effectivenessM: clamp(prev.effectivenessM + jitterInt(300), 20, 10000),
    snowfallCm24h: clamp(prev.snowfallCm24h + jitterInt(3), 0, 100),
    cycleTimeS: prev.cycleTimeS,
  }
}

export function nextLeafStatus(kind: LeafKind, current: NodeStatus): NodeStatus {
  if (kind === 'machine') return current === 'anomaly' ? 'nominal' : 'anomaly'
  if (current === 'nominal') return 'watch'
  if (current === 'watch') return 'anomaly'
  return 'nominal'
}

export function anomalyDelta(from: NodeStatus, to: NodeStatus): number {
  const fromAnomaly = from === 'anomaly'
  const toAnomaly = to === 'anomaly'
  if (fromAnomaly === toAnomaly) return 0
  return toAnomaly ? 1 : -1
}

export function advanceRotation(
  prev: StatusState,
  rotation: string[],
  kindOf: ReadonlyMap<string, LeafKind>
): { next: StatusState; transition: Transition | null } {
  for (let attempt = 0; attempt < rotation.length; attempt++) {
    const idx = (prev.rotationIndex + attempt) % rotation.length
    const id = rotation[idx]
    if (id === undefined) continue
    const kind = kindOf.get(id)
    if (kind === undefined) continue
    const statusMap = kind === 'machine' ? prev.machineStatus : prev.environmentStatus
    const current = statusMap.get(id)
    if (current === undefined) continue
    const to = nextLeafStatus(kind, current)
    const delta = anomalyDelta(current, to)
    if (delta > 0 && prev.anomalyCount + delta > ANOMALY_COUNT_MAX) continue
    if (delta < 0 && prev.anomalyCount + delta < ANOMALY_COUNT_MIN) continue

    const machineStatus = kind === 'machine' ? new Map(prev.machineStatus).set(id, to) : prev.machineStatus
    const environmentStatus = kind === 'environment' ? new Map(prev.environmentStatus).set(id, to) : prev.environmentStatus

    return {
      next: {
        machineStatus,
        environmentStatus,
        anomalyCount: prev.anomalyCount + delta,
        rotationIndex: (idx + 1) % rotation.length,
      },
      transition: { id, kind, from: current, to },
    }
  }
  return { next: prev, transition: null }
}

export function buildFinding(
  transition: Transition,
  machineById: ReadonlyMap<string, Machine>,
  environmentById: ReadonlyMap<string, Environment>,
  plantNameByEnvironmentId: ReadonlyMap<string, string>,
  vibrationMmS: number
): Finding {
  const level = transition.to
  let message: string
  let subjectName: string
  if (transition.kind === 'machine') {
    const machine = machineById.get(transition.id)
    subjectName = machine?.name ?? transition.id
    message =
      transition.to === 'anomaly'
        ? `${subjectName} - Oee/HR outside safe range`
        : `${subjectName} - readings returned to baseline`
  } else {
    const env = environmentById.get(transition.id)
    const plantName = env ? (plantNameByEnvironmentId.get(env.id) ?? 'Unknown line') : 'Unknown line'
    subjectName = plantName
    if (transition.to === 'watch') message = `${plantName} - conditions deteriorating (vibration ${vibrationMmS} kph)`
    else if (transition.to === 'anomaly') message = `${plantName} - vibration ${vibrationMmS} kph exceeds operating threshold`
    else message = `${plantName} - conditions normalized`
  }
  const source: SourceId = transition.kind === 'machine' ? 'sensor-mesh' : 'weather-feed'
  return {
    id: `${transition.id}-${Date.now()}`,
    time: nowTimeString(),
    level,
    message,
    source,
    subjectId: transition.id,
    subjectName,
  }
}

export function buildInitialMachineReadings(
  machineList: Machine[]
): Map<string, { oee: number; vibration: number }> {
  return new Map(machineList.map((c) => [c.id, { oee: c.baseOee, vibration: c.baseVibration }]))
}

export function buildInitialOeeHistory(machineList: Machine[]): Map<string, number[]> {
  return new Map(machineList.map((c) => [c.id, Array(MACHINE_HISTORY_LENGTH).fill(c.baseOee)]))
}

export function buildInitialHrHistory(machineList: Machine[]): Map<string, number[]> {
  return new Map(machineList.map((c) => [c.id, Array(MACHINE_HISTORY_LENGTH).fill(c.baseVibration)]))
}

export function buildInitialEnvironmentReadings(
  environmentList: Environment[]
): Map<string, EnvironmentReading> {
  return new Map(
    environmentList.map((e, i) => [
      e.id,
      {
        tempC: e.tempC,
        vibrationMmS: e.vibrationMmS,
        vibrationBearingDeg: wrapDeg(i * 137),
        effectivenessM: e.effectivenessM,
        snowfallCm24h: e.snowfallCm24h,
        cycleTimeS: e.cycleTimeS,
      },
    ])
  )
}

export function buildInitialVibrationHistory(environmentList: Environment[]): Map<string, number[]> {
  return new Map(environmentList.map((e) => [e.id, Array(WIND_HISTORY_LENGTH).fill(e.vibrationMmS)]))
}

export function buildInitialStatusState(
  machineList: Machine[],
  environmentList: Environment[]
): StatusState {
  const machineStatus = new Map<string, NodeStatus>()
  let anomalyCount = 0
  for (const c of machineList) {
    const status: NodeStatus = c.anomaly ? 'anomaly' : 'nominal'
    machineStatus.set(c.id, status)
    if (status === 'anomaly') anomalyCount++
  }
  const environmentStatus = new Map<string, NodeStatus>()
  environmentList.forEach((e, i) => {
    const status: NodeStatus = INITIAL_ANOMALY_ENVIRONMENT_INDICES.has(i) ? 'anomaly' : 'nominal'
    environmentStatus.set(e.id, status)
    if (status === 'anomaly') anomalyCount++
  })
  return { machineStatus, environmentStatus, anomalyCount, rotationIndex: 0 }
}

export function buildRotation(machineList: Machine[], environmentList: Environment[]): string[] {
  return seededShuffle(
    [...machineList.map((c) => c.id), ...environmentList.map((e) => e.id)],
    ROTATION_SEED
  )
}

export function buildKindOf(
  machineList: Machine[],
  environmentList: Environment[]
): Map<string, LeafKind> {
  const map = new Map<string, LeafKind>()
  for (const c of machineList) map.set(c.id, 'machine')
  for (const e of environmentList) map.set(e.id, 'environment')
  return map
}
