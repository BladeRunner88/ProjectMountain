'use client'

import type { ReactElement } from 'react'

import { CloseIcon } from '@/components/ui/icons'

import { exposureLevel } from '../services/environmentDisplay'
import type { Machine, Environment, NodeStatus, Plant } from '../types/domain'
import type { EnvironmentReading } from '../types/simulation'
import { PanelShell, Row, SectionHeading, Sparkline } from './MachineSidePanel'
import { ANOMALY_COLOR, MACHINE_NORMAL_COLOR } from './shapes'

export function EnvironmentSidePanel({
  environment,
  plant,
  reading,
  status,
  vibrationHistory,
  exposedMachines,
  machineStatus,
  onClose,
}: {
  environment: Environment
  plant: Plant | undefined
  reading: EnvironmentReading | undefined
  status: NodeStatus
  vibrationHistory: number[]
  exposedMachines: Machine[]
  machineStatus: ReadonlyMap<string, NodeStatus>
  onClose: () => void
}): ReactElement {
  const anomalous = status === 'anomaly'
  const statusColor = anomalous ? ANOMALY_COLOR : MACHINE_NORMAL_COLOR

  return (
    <PanelShell onClose={onClose}>
      <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
        <div>
          <h2 className="text-[18px] font-semibold text-white">{plant?.name ?? 'Environment'} sensor</h2>
          <p className="mt-1 text-[13px] font-medium" style={{ color: statusColor }}>
            {anomalous ? 'Anomaly' : 'Nominal'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-7 w-7 shrink-0 items-center justify-center text-white/50 transition-colors duration-fast ease-out hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-7 overflow-y-auto px-6 py-6">
        {reading && (
          <section className="flex flex-col gap-1">
            <SectionHeading>Readings</SectionHeading>
            <div className="mt-1 divide-y divide-white/[0.06]">
              <Row label="Spindle temp" value={`${reading.tempC}C`} />
              <Row label="Vibration" value={`${reading.vibrationMmS} kph`} />
              <Row label="Effectiveness" value={`${reading.effectivenessM}m`} />
              <Row label="Snowfall (24h)" value={`${reading.snowfallCm24h}cm`} />
              <Row label="Cycle time" value={`${reading.cycleTimeS}m`} />
              <Row
                label="Load band"
                value={`${environment.loadBandLowM}-${environment.loadBandHighM}m`}
              />
              <Row label="Exposure" value={exposureLevel(environment.loadBandHighM)} />
            </div>
          </section>
        )}

        {reading && (
          <section className="flex flex-col gap-4">
            <SectionHeading
              right={
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4C8DFF] motion-safe:animate-pulse" />
                  Live
                </span>
              }
            >
              Vibration (24 readings)
            </SectionHeading>
            <Sparkline values={vibrationHistory} min={0} max={140} color={statusColor} />
          </section>
        )}

        <section className="flex flex-col gap-1">
          <SectionHeading>{`Exposed on this line (${exposedMachines.length})`}</SectionHeading>
          <div className="mt-1 divide-y divide-white/[0.06]">
            {exposedMachines.map((machine) => {
              const machineAnomalous = machineStatus.get(machine.id) === 'anomaly'
              return (
                <div key={machine.id} className="flex items-center justify-between gap-4 py-1.5">
                  <span className="text-[13px] text-white/80">{machine.name}</span>
                  <span
                    className="text-[11px] font-medium uppercase tracking-[0.05em]"
                    style={{ color: machineAnomalous ? ANOMALY_COLOR : MACHINE_NORMAL_COLOR }}
                  >
                    {machineAnomalous ? 'Anomaly' : 'Nominal'}
                  </span>
                </div>
              )
            })}
            {exposedMachines.length === 0 && (
              <p className="py-1.5 text-[13px] text-white/45">No machines currently on this line.</p>
            )}
          </div>
        </section>
      </div>
    </PanelShell>
  )
}
