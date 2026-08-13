'use client'

import { create } from 'zustand'

import { climbers } from '../services/climbers'
import { buildHierarchyLayout, computeStatusOf, type HierarchyLayout } from '../services/layout'
import {
  CLIMBER_TICK_MS,
  ENVIRONMENT_TICK_MS,
  FINDINGS_CAP,
  FLASH_DURATION_MS,
  TRANSITION_TICK_MS,
  advanceRotation,
  buildFinding,
  buildInitialClimberVitals,
  buildInitialEnvironmentReadings,
  buildInitialHrHistory,
  buildInitialSpo2History,
  buildInitialStatusState,
  buildInitialWindHistory,
  buildKindOf,
  buildRotation,
  clamp,
  jitterInt,
  nextReading,
  type StatusState,
} from '../services/simulation'
import { companies, countries, environments, regions } from '../services/topology'
import type { NodeStatus } from '../types/domain'
import type { ClimberVitals, EnvironmentReading, Finding } from '../types/simulation'

export interface GraphSimulationSnapshot {
  climberVitals: Map<string, ClimberVitals>
  climberSpo2History: Map<string, number[]>
  climberHrHistory: Map<string, number[]>
  climberStatus: Map<string, NodeStatus>
  environmentReading: Map<string, EnvironmentReading>
  environmentStatus: Map<string, NodeStatus>
  windHistory: Map<string, number[]>
  findings: Finding[]
  flashId: string | null
  layout: HierarchyLayout
  statusOf: Map<string, NodeStatus>
}

const layout = buildHierarchyLayout(countries, regions, companies, climbers, environments)
const initialStatus = buildInitialStatusState(climbers, environments)
const rotation = buildRotation(climbers, environments)
const kindOf = buildKindOf(climbers, environments)
const climberById = new Map(climbers.map((c) => [c.id, c]))
const environmentById = new Map(environments.map((e) => [e.id, e]))
const regionNameById = new Map(regions.map((r) => [r.id, r.name]))
const regionNameByEnvironmentId = new Map(
  environments.map((e) => [e.id, regionNameById.get(e.regionId) ?? e.regionId])
)

const initialReadings = buildInitialEnvironmentReadings(environments)

let statusRef: StatusState = initialStatus
let environmentReadingRef: Map<string, EnvironmentReading> = initialReadings
let refCount = 0
let climberInterval: number | null = null
let environmentInterval: number | null = null
let transitionInterval: number | null = null
let flashTimeout: number | null = null

function initialSnapshot(): GraphSimulationSnapshot {
  return {
    climberVitals: buildInitialClimberVitals(climbers),
    climberSpo2History: buildInitialSpo2History(climbers),
    climberHrHistory: buildInitialHrHistory(climbers),
    climberStatus: initialStatus.climberStatus,
    environmentReading: initialReadings,
    environmentStatus: initialStatus.environmentStatus,
    windHistory: buildInitialWindHistory(environments),
    findings: [],
    flashId: null,
    layout,
    statusOf: computeStatusOf(
      { parentOf: layout.parentOf, tierOf: layout.tierOf },
      initialStatus.climberStatus,
      initialStatus.environmentStatus
    ),
  }
}

export const useGraphSimulationStore = create<GraphSimulationSnapshot>(initialSnapshot)

function tickClimbers(): void {
  const vitals = new Map<string, ClimberVitals>()
  for (const climber of climbers) {
    vitals.set(climber.id, {
      spo2: clamp(climber.baseSpO2 + jitterInt(1), 40, 100),
      hr: clamp(climber.baseHr + jitterInt(4), 30, 220),
    })
  }
  useGraphSimulationStore.setState((prev) => {
    const spo2History = new Map<string, number[]>()
    const hrHistory = new Map<string, number[]>()
    for (const climber of climbers) {
      const next = vitals.get(climber.id)
      if (!next) continue
      spo2History.set(climber.id, [...(prev.climberSpo2History.get(climber.id) ?? []).slice(1), next.spo2])
      hrHistory.set(climber.id, [...(prev.climberHrHistory.get(climber.id) ?? []).slice(1), next.hr])
    }
    return { climberVitals: vitals, climberSpo2History: spo2History, climberHrHistory: hrHistory }
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
    const nextWind = new Map<string, number[]>()
    for (const env of environments) {
      const reading = committed.get(env.id)
      if (!reading) continue
      nextWind.set(env.id, [...(prev.windHistory.get(env.id) ?? []).slice(1), reading.windKph])
    }
    return { environmentReading: nextReadings, windHistory: nextWind }
  })
  environmentReadingRef = nextReadings
}

function tickTransition(): void {
  const { next, transition } = advanceRotation(statusRef, rotation, kindOf)
  statusRef = next
  const statusOf = computeStatusOf(
    { parentOf: layout.parentOf, tierOf: layout.tierOf },
    next.climberStatus,
    next.environmentStatus
  )
  useGraphSimulationStore.setState({
    climberStatus: next.climberStatus,
    environmentStatus: next.environmentStatus,
    statusOf,
  })
  if (!transition) return
  const windKph =
    transition.kind === 'environment'
      ? (environmentReadingRef.get(transition.id)?.windKph ?? 0)
      : 0
  const finding = buildFinding(transition, climberById, environmentById, regionNameByEnvironmentId, windKph)
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
  if (climberInterval !== null) {
    window.clearInterval(climberInterval)
    climberInterval = null
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
  climberInterval = window.setInterval(tickClimbers, CLIMBER_TICK_MS)
  environmentInterval = window.setInterval(tickEnvironments, ENVIRONMENT_TICK_MS)
  transitionInterval = window.setInterval(tickTransition, TRANSITION_TICK_MS)
}

export function stopGraphSimulation(): void {
  if (typeof window === 'undefined') return
  refCount = Math.max(0, refCount - 1)
  if (refCount > 0) return
  clearTimers()
}

export { climbers, companies, countries, environments, regions }
