'use client'

import { create } from 'zustand'

import { machines } from '../services/machines'
import { buildHierarchyLayout, computeStatusOf, type HierarchyLayout } from '../services/layout'
import {
  MACHINE_TICK_MS,
  ENVIRONMENT_TICK_MS,
  FINDINGS_CAP,
  FLASH_DURATION_MS,
  TRANSITION_TICK_MS,
  advanceRotation,
  buildFinding,
  buildInitialMachineReadings,
  buildInitialEnvironmentReadings,
  buildInitialHrHistory,
  buildInitialOeeHistory,
  buildInitialStatusState,
  buildInitialVibrationHistory,
  buildKindOf,
  buildRotation,
  clamp,
  jitterInt,
  nextReading,
  type StatusState,
} from '../services/simulation'
import { companies, countries, environments, plants } from '../services/topology'
import type { NodeStatus } from '../types/domain'
import type { MachineReadings, EnvironmentReading, Finding } from '../types/simulation'

export interface GraphSimulationSnapshot {
  machineReadings: Map<string, MachineReadings>
  machineOeeHistory: Map<string, number[]>
  machineHrHistory: Map<string, number[]>
  machineStatus: Map<string, NodeStatus>
  environmentReading: Map<string, EnvironmentReading>
  environmentStatus: Map<string, NodeStatus>
  vibrationHistory: Map<string, number[]>
  findings: Finding[]
  flashId: string | null
  layout: HierarchyLayout
  statusOf: Map<string, NodeStatus>
}

const layout = buildHierarchyLayout(countries, plants, companies, machines, environments)
const initialStatus = buildInitialStatusState(machines, environments)
const rotation = buildRotation(machines, environments)
const kindOf = buildKindOf(machines, environments)
const machineById = new Map(machines.map((c) => [c.id, c]))
const environmentById = new Map(environments.map((e) => [e.id, e]))
const plantNameById = new Map(plants.map((r) => [r.id, r.name]))
const plantNameByEnvironmentId = new Map(
  environments.map((e) => [e.id, plantNameById.get(e.plantId) ?? e.plantId])
)

const initialReadings = buildInitialEnvironmentReadings(environments)

let statusRef: StatusState = initialStatus
let environmentReadingRef: Map<string, EnvironmentReading> = initialReadings
let refCount = 0
let machineInterval: number | null = null
let environmentInterval: number | null = null
let transitionInterval: number | null = null
let flashTimeout: number | null = null

function initialSnapshot(): GraphSimulationSnapshot {
  return {
    machineReadings: buildInitialMachineReadings(machines),
    machineOeeHistory: buildInitialOeeHistory(machines),
    machineHrHistory: buildInitialHrHistory(machines),
    machineStatus: initialStatus.machineStatus,
    environmentReading: initialReadings,
    environmentStatus: initialStatus.environmentStatus,
    vibrationHistory: buildInitialVibrationHistory(environments),
    findings: [],
    flashId: null,
    layout,
    statusOf: computeStatusOf(
      { parentOf: layout.parentOf, tierOf: layout.tierOf },
      initialStatus.machineStatus,
      initialStatus.environmentStatus
    ),
  }
}

export const useGraphSimulationStore = create<GraphSimulationSnapshot>(initialSnapshot)

function tickMachines(): void {
  const readings = new Map<string, MachineReadings>()
  for (const machine of machines) {
    readings.set(machine.id, {
      oee: clamp(machine.baseOee + jitterInt(1), 40, 100),
      vibration: clamp(machine.baseVibration + jitterInt(4), 30, 220),
    })
  }
  useGraphSimulationStore.setState((prev) => {
    const oeeHistory = new Map<string, number[]>()
    const hrHistory = new Map<string, number[]>()
    for (const machine of machines) {
      const next = readings.get(machine.id)
      if (!next) continue
      oeeHistory.set(machine.id, [...(prev.machineOeeHistory.get(machine.id) ?? []).slice(1), next.oee])
      hrHistory.set(machine.id, [...(prev.machineHrHistory.get(machine.id) ?? []).slice(1), next.vibration])
    }
    return { machineReadings: readings, machineOeeHistory: oeeHistory, machineHrHistory: hrHistory }
  })
}

function tickEnvironments(): void {
  const committed = environmentReadingRef
  const nextReadings = new Map<string, EnvironmentReading>()
  for (const env of environments) {
    const prev = committed.get(env.id)
    if (!prev) continue
    nextReadings.set(env.id, nextReading(prev))
  }
  useGraphSimulationStore.setState((prev) => {
    const nextVibration = new Map<string, number[]>()
    for (const env of environments) {
      const reading = committed.get(env.id)
      if (!reading) continue
      nextVibration.set(env.id, [...(prev.vibrationHistory.get(env.id) ?? []).slice(1), reading.vibrationMmS])
    }
    return { environmentReading: nextReadings, vibrationHistory: nextVibration }
  })
  environmentReadingRef = nextReadings
}

function tickTransition(): void {
  const { next, transition } = advanceRotation(statusRef, rotation, kindOf)
  statusRef = next
  const statusOf = computeStatusOf(
    { parentOf: layout.parentOf, tierOf: layout.tierOf },
    next.machineStatus,
    next.environmentStatus
  )
  useGraphSimulationStore.setState({
    machineStatus: next.machineStatus,
    environmentStatus: next.environmentStatus,
    statusOf,
  })
  if (!transition) return
  const vibrationMmS =
    transition.kind === 'environment'
      ? (environmentReadingRef.get(transition.id)?.vibrationMmS ?? 0)
      : 0
  const finding = buildFinding(transition, machineById, environmentById, plantNameByEnvironmentId, vibrationMmS)
  useGraphSimulationStore.setState((prev) => ({
    findings: [...prev.findings, finding].slice(-FINDINGS_CAP),
    flashId: transition.id,
  }))
  if (flashTimeout !== null) window.clearTimeout(flashTimeout)
  flashTimeout = window.setTimeout(() => {
    useGraphSimulationStore.setState((s) => ({
      flashId: s.flashId === transition.id ? null : s.flashId,
    }))
    flashTimeout = null
  }, FLASH_DURATION_MS)
}

function clearTimers(): void {
  if (machineInterval !== null) {
    window.clearInterval(machineInterval)
    machineInterval = null
  }
  if (environmentInterval !== null) {
    window.clearInterval(environmentInterval)
    environmentInterval = null
  }
  if (transitionInterval !== null) {
    window.clearInterval(transitionInterval)
    transitionInterval = null
  }
  if (flashTimeout !== null) {
    window.clearTimeout(flashTimeout)
    flashTimeout = null
  }
}

export function startGraphSimulation(): void {
  if (typeof window === 'undefined') return
  refCount += 1
  if (refCount > 1) return
  machineInterval = window.setInterval(tickMachines, MACHINE_TICK_MS)
  environmentInterval = window.setInterval(tickEnvironments, ENVIRONMENT_TICK_MS)
  transitionInterval = window.setInterval(tickTransition, TRANSITION_TICK_MS)
}

export function stopGraphSimulation(): void {
  if (typeof window === 'undefined') return
  refCount = Math.max(0, refCount - 1)
  if (refCount > 0) return
  clearTimers()
}

export { machines, companies, countries, environments, plants }
