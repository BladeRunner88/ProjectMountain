import type { Climber, Environment, NodeStatus, Region } from '../../../demo/types'
import { ANOMALY_COLOR, CLIMBER_NORMAL_COLOR } from './shapes'
import { PanelShell, Row, SectionHeading, Sparkline } from './ClimberSidePanel'
import { exposureLevel } from './environmentDisplay'
import type { EnvironmentReading } from './useGraphSimulation'
import { CloseIcon } from '../../icons'

export function EnvironmentSidePanel({
  environment,
  region,
  reading,
  status,
  windHistory,
  exposedClimbers,
  climberStatus,
  onClose,
}: {
  environment: Environment
  region: Region | undefined
  reading: EnvironmentReading | undefined
  status: NodeStatus
  windHistory: number[]
  exposedClimbers: Climber[]
  climberStatus: ReadonlyMap<string, NodeStatus>
  onClose: () => void
}) {
  const anomalous = status === 'anomaly'
  const statusColor = anomalous ? ANOMALY_COLOR : CLIMBER_NORMAL_COLOR

  return (
    <PanelShell onClose={onClose}>
      <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
        <div>
          <h2 className="text-[18px] font-semibold text-white">{region?.name ?? 'Environment'} sensor</h2>
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
              <Row label="Temperature" value={`${reading.tempC}C`} />
              <Row label="Wind" value={`${reading.windKph} kph`} />
              <Row label="Visibility" value={`${reading.visibilityM}m`} />
              <Row label="Snowfall (24h)" value={`${reading.snowfallCm24h}cm`} />
              <Row label="Freezing level" value={`${reading.freezingLevelM}m`} />
              <Row label="Altitude band" value={`${environment.altitudeBandLowM}-${environment.altitudeBandHighM}m`} />
              <Row label="Exposure" value={exposureLevel(environment.altitudeBandHighM)} />
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
              Wind (24 readings)
            </SectionHeading>
            <Sparkline values={windHistory} min={0} max={140} color={statusColor} />
          </section>
        )}

        <section className="flex flex-col gap-1">
          <SectionHeading>{`Exposed on this route (${exposedClimbers.length})`}</SectionHeading>
          <div className="mt-1 divide-y divide-white/[0.06]">
            {exposedClimbers.map((climber) => {
              const anomalous = climberStatus.get(climber.id) === 'anomaly'
              return (
                <div key={climber.id} className="flex items-center justify-between gap-4 py-1.5">
                  <span className="text-[13px] text-white/80">{climber.name}</span>
                  <span
                    className="text-[11px] font-medium uppercase tracking-[0.05em]"
                    style={{ color: anomalous ? ANOMALY_COLOR : CLIMBER_NORMAL_COLOR }}
                  >
                    {anomalous ? 'Anomaly' : 'Nominal'}
                  </span>
                </div>
              )
            })}
            {exposedClimbers.length === 0 && <p className="py-1.5 text-[13px] text-white/45">No climbers currently on this route.</p>}
          </div>
        </section>
      </div>
    </PanelShell>
  )
}
