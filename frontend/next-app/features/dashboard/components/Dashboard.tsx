'use client'

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'

import { useGraphSimulationContext } from '@/features/demo/components/GraphSimulationProvider'
import { machines, companies, countries, environments, plants } from '@/features/demo/services/dataset'
import type { SourceId } from '@/features/demo/types'

import { useExposureHistory } from '../hooks/useExposureHistory'
import type { SourceRow } from '../types'
import { BG, TEXT_PRIMARY } from '../types/tokens'
import { RampUpBalance } from './RampUpBalance'
import { StationTemperature } from './StationTemperature'
import { Conditions } from './Conditions'
import { ConnectedSystems } from './ConnectedSystems'
import { DataStream } from './DataStream'
import { CampaignClock } from './CampaignClock'
import { ExposureLoad } from './ExposureLoad'
import { FindingsList } from './FindingsList'
import { KpiTile, Panel, PanelLabel, PanelRow } from './primitives'
import { LineAnalysis } from './LineAnalysis'
import { SystemCounters } from './SystemCounters'

const POSITIONS = ['Base Station', 'Station I', 'Station II', 'Station III', 'Station IV', 'Target push']
const EXPOSED_POSITIONS = new Set(['Station III', 'Station IV', 'Target push'])
const RAMPUP_RATE_REFERENCE = [220, 190, 160, 130, 100, 70]
const MAX_PARTIES_ON_LINE = 26

const SOURCE_NAME: Record<SourceId, string> = {
  'sensor-mesh': 'Sensor mesh',
  'weather-feed': 'Metrology lab',
  'workOrder-registry': 'CMMS',
  'operator-registers': 'Plant MES',
  'service-logs': 'Service contractor',
}
const SOURCE_NAME_BY_ID = new Map(Object.entries(SOURCE_NAME) as [SourceId, string][])

const plantById = new Map(plants.map((r) => [r.id, r]))

export function Dashboard(): ReactElement {
  const { machineReadings, environmentReading, statusOf, layout, findings } = useGraphSimulationContext()
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null)

  const lowestOee = useMemo(() => {
    let min = 100
    for (const readings of machineReadings.values()) min = Math.min(min, readings.oee)
    return min
  }, [machineReadings])

  const congestionPct = useMemo(
    () =>
      Math.round(
        (plants.reduce((sum, r) => sum + r.partiesOnLine, 0) / plants.length / MAX_PARTIES_ON_LINE) * 100
      ),
    []
  )

  const totalNodes = statusOf.size
  const anomalyCount = useMemo(() => [...statusOf.values()].filter((s) => s === 'anomaly').length, [statusOf])

  const featuredEnvironment = useMemo(() => {
    let best = environments[0]
    let bestScore = -1
    for (const env of environments) {
      const status = statusOf.get(env.id)
      const rank = status === 'anomaly' ? 2 : status === 'watch' ? 1 : 0
      const vibration = environmentReading.get(env.id)?.vibrationMmS ?? 0
      const score = rank * 1000 + vibration
      if (score > bestScore) {
        bestScore = score
        best = env
      }
    }
    return best
  }, [statusOf, environmentReading])

  const featuredPlant = featuredEnvironment ? plantById.get(featuredEnvironment.plantId) : undefined
  const featuredReading = featuredEnvironment ? environmentReading.get(featuredEnvironment.id) : undefined

  const exposedPct = useMemo(() => {
    const exposed = machines.filter((c) => EXPOSED_POSITIONS.has(c.currentPosition)).length
    return Math.round((exposed / machines.length) * 100)
  }, [])

  const currentExposureLoadPct = totalNodes === 0 ? 0 : (anomalyCount / totalNodes) * 100
  const exposureHistory = useExposureHistory(currentExposureLoadPct)

  const stationTemps = useMemo(() => {
    if (!featuredReading) return []
    const lapsePerM = 6.5 / 1000
    const stations = [
      { label: 'BC', offsetM: 0 },
      { label: 'C2', offsetM: 700 },
      { label: 'C3', offsetM: 1300 },
      { label: 'C4', offsetM: 1900 },
    ]
    return stations.map((station) => ({
      label: station.label,
      tempC: Math.round(featuredReading.tempC - station.offsetM * lapsePerM),
    }))
  }, [featuredReading])

  const { oeeSeries, hrSeries } = useMemo(() => {
    const oee: number[] = []
    const vibration: number[] = []
    for (const position of POSITIONS) {
      const atPosition = machines.filter((c) => c.currentPosition === position)
      if (atPosition.length === 0) {
        oee.push(90)
        vibration.push(90)
        continue
      }
      let oeeSum = 0
      let hrSum = 0
      for (const machine of atPosition) {
        const readings = machineReadings.get(machine.id)
        oeeSum += readings?.oee ?? machine.baseOee
        hrSum += readings?.vibration ?? machine.baseVibration
      }
      oee.push(Math.round(oeeSum / atPosition.length))
      vibration.push(Math.round(hrSum / atPosition.length))
    }
    return { oeeSeries: oee, hrSeries: vibration }
  }, [machineReadings])

  const sensorMeshCountRef = useRef(machines.length)
  const [sensorMeshCount, setSensorMeshCount] = useState(machines.length)
  const [sensorMeshSync, setSensorMeshSync] = useState(() => new Date())
  useEffect(() => {
    sensorMeshCountRef.current += machines.length
    setSensorMeshCount(sensorMeshCountRef.current)
    setSensorMeshSync(new Date())
  }, [machineReadings])

  const weatherFeedCountRef = useRef(environments.length)
  const [weatherFeedCount, setWeatherFeedCount] = useState(environments.length)
  const [weatherFeedSync, setWeatherFeedSync] = useState(() => new Date())
  useEffect(() => {
    weatherFeedCountRef.current += environments.length
    setWeatherFeedCount(weatherFeedCountRef.current)
    setWeatherFeedSync(new Date())
  }, [environmentReading])

  const [workOrderRegistrySync] = useState(() => new Date(Date.now() - (7 * 60 + 12) * 60 * 1000))
  const [operatorRegisterSync] = useState(() => new Date(Date.now() - 14 * 60 * 1000))
  const [serviceLogsSync] = useState(() => new Date(Date.now() - 41 * 60 * 1000))
  const workOrderRegistryCount = useMemo(() => countries.reduce((sum, c) => sum + c.workOrdersIssued, 0), [])
  const operatorRegisterCount = useMemo(() => companies.reduce((sum, c) => sum + c.guidesActive, 0), [])
  const serviceLogsCount = machines.length

  const sources: SourceRow[] = [
    {
      id: 'sensor-mesh',
      name: SOURCE_NAME['sensor-mesh'],
      recordCount: sensorMeshCount,
      lastSync: sensorMeshSync,
      degraded: false,
    },
    {
      id: 'weather-feed',
      name: SOURCE_NAME['weather-feed'],
      recordCount: weatherFeedCount,
      lastSync: weatherFeedSync,
      degraded: false,
    },
    {
      id: 'workOrder-registry',
      name: SOURCE_NAME['workOrder-registry'],
      recordCount: workOrderRegistryCount,
      lastSync: workOrderRegistrySync,
      degraded: true,
    },
    {
      id: 'operator-registers',
      name: SOURCE_NAME['operator-registers'],
      recordCount: operatorRegisterCount,
      lastSync: operatorRegisterSync,
      degraded: false,
    },
    {
      id: 'service-logs',
      name: SOURCE_NAME['service-logs'],
      recordCount: serviceLogsCount,
      lastSync: serviceLogsSync,
      degraded: false,
    },
  ]
  const recordsIngested = sources.reduce((sum, s) => sum + s.recordCount, 0)

  function handleSelectSource(id: SourceId): void {
    setSelectedSourceId((s) => (s === id ? null : id))
  }

  if (!featuredEnvironment) {
    return (
      <div className="h-full min-h-svh w-full overflow-y-auto" style={{ backgroundColor: BG, color: TEXT_PRIMARY }}>
        <p className="px-8 py-8 font-mono text-[12px]" style={{ color: TEXT_PRIMARY }}>
          No campaign environments in this demo dataset.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-svh w-full overflow-y-auto" style={{ backgroundColor: BG, color: TEXT_PRIMARY }}>
      <PanelRow>
        <Panel span={4}>
          <KpiTile label="Lowest Oee on line" value={String(lowestOee)} unit="%" segValue={lowestOee} segMax={100} />
        </Panel>
        <Panel span={4}>
          <KpiTile label="Line congestion" value={String(congestionPct)} unit="%" segValue={congestionPct} segMax={100} />
        </Panel>
        <Panel span={4}>
          <KpiTile
            label="Anomaly load"
            value={`${anomalyCount} / ${totalNodes}`}
            unit=""
            segValue={anomalyCount}
            segMax={totalNodes || 1}
          />
        </Panel>
      </PanelRow>

      <PanelRow>
        <Panel span={4} className="flex flex-col gap-5">
          <PanelLabel>Campaign clock</PanelLabel>
          <CampaignClock />
        </Panel>
        <Panel span={4}>
          <LineAnalysis
            lineName={featuredPlant?.name ?? 'Line analysis'}
            entry={featuredEnvironment.loadBandLowM}
            crux={featuredPlant?.maxLoadM ?? featuredEnvironment.loadBandHighM}
            exit={featuredEnvironment.loadBandHighM}
          />
        </Panel>
        <Panel span={4} className="flex flex-col gap-5">
          <PanelLabel>RampUp balance</PanelLabel>
          <RampUpBalance exposedPct={exposedPct} />
        </Panel>
      </PanelRow>

      <PanelRow>
        <Panel span={6} className="flex flex-col gap-5">
          <PanelLabel>Exposure load</PanelLabel>
          <ExposureLoad values={exposureHistory} />
        </Panel>
        <Panel span={6} className="flex flex-col gap-5">
          <PanelLabel>{`Station temperature — ${featuredPlant?.name ?? ''}`}</PanelLabel>
          <StationTemperature stations={stationTemps} />
        </Panel>
      </PanelRow>

      <PanelRow>
        <Panel span={6} className="flex flex-col gap-5">
          <PanelLabel>{`Conditions — ${featuredPlant?.name ?? ''}`}</PanelLabel>
          <Conditions
            tempC={featuredReading?.tempC ?? 0}
            vibrationMmS={featuredReading?.vibrationMmS ?? 0}
            vibrationBearingDeg={featuredReading?.vibrationBearingDeg ?? 0}
          />
        </Panel>
        <Panel span={6} className="flex flex-col gap-5">
          <PanelLabel>Data stream</PanelLabel>
          <DataStream oeeSeries={oeeSeries} hrSeries={hrSeries} rampUpSeries={RAMPUP_RATE_REFERENCE} />
        </Panel>
      </PanelRow>

      <PanelRow>
        <Panel span={12} className="flex flex-col gap-8">
          <PanelLabel>Connected systems</PanelLabel>
          <ConnectedSystems sources={sources} selectedSourceId={selectedSourceId} onSelectSource={handleSelectSource} />
          <div className="border-t pt-6" style={{ borderColor: '#1C1C1C' }}>
            <SystemCounters
              entitiesResolved={totalNodes}
              linksBuilt={layout.edges.length}
              anomaliesOpen={anomalyCount}
              recordsIngested={recordsIngested}
            />
          </div>
          <div className="border-t pt-6" style={{ borderColor: '#1C1C1C' }}>
            <FindingsList findings={findings} selectedSourceId={selectedSourceId} sourceNameById={SOURCE_NAME_BY_ID} />
          </div>
        </Panel>
      </PanelRow>
    </div>
  )
}
