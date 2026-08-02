import { useEffect, useMemo, useRef, useState } from 'react'
import { climbers, companies, countries, environments, regions, useGraphSimulationContext } from '../components/demo/graph/GraphSimulationContext'
import type { SourceId } from '../components/demo/graph/useGraphSimulation'
import { BG, TEXT_PRIMARY } from '../components/dashboard/tokens'
import { KpiTile, Panel, PanelLabel, PanelRow } from '../components/dashboard/primitives'
import { ExpeditionClock } from '../components/dashboard/ExpeditionClock'
import { RouteAnalysis } from '../components/dashboard/RouteAnalysis'
import { AscentBalance } from '../components/dashboard/AscentBalance'
import { ExposureLoad } from '../components/dashboard/ExposureLoad'
import { CampTemperature } from '../components/dashboard/CampTemperature'
import { Conditions } from '../components/dashboard/Conditions'
import { DataStream } from '../components/dashboard/DataStream'
import { ConnectedSystems } from '../components/dashboard/ConnectedSystems'
import type { SourceRow } from '../components/dashboard/ConnectedSystems'
import { SystemCounters } from '../components/dashboard/SystemCounters'
import { FindingsList } from '../components/dashboard/FindingsList'

// Base Camp -> Camp I -> ... -> Summit push, the same six stages climbers.js
// assigns each climber's currentPosition from — reused as-is for the camp
// progression axis on both CAMP TEMPERATURE and DATA STREAM.
const POSITIONS = ['Base Camp', 'Camp I', 'Camp II', 'Camp III', 'Camp IV', 'Summit push']
const EXPOSED_POSITIONS = new Set(['Camp III', 'Camp IV', 'Summit push'])
// Illustrative reference curve (m/hr) — slower higher up the mountain. Not
// live data: the grey "context" series against the two live red/white ones.
const ASCENT_RATE_REFERENCE = [220, 190, 160, 130, 100, 70]
const MAX_PARTIES_ON_ROUTE = 26

const EXPOSURE_HISTORY_LENGTH = 30
const EXPOSURE_SAMPLE_MS = 3000

const SOURCE_NAME: Record<SourceId, string> = {
  'sensor-mesh': 'Sensor mesh',
  'weather-feed': 'Weather feed',
  'permit-registry': 'Permit registry',
  'operator-rosters': 'Operator rosters',
  'medical-logs': 'Medical logs',
}
const SOURCE_NAME_BY_ID = new Map(Object.entries(SOURCE_NAME) as [SourceId, string][])

const regionById = new Map(regions.map((r) => [r.id, r]))

export function Dashboard() {
  const { climberVitals, environmentReading, statusOf, layout, findings } = useGraphSimulationContext()
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null)

  const lowestSpo2 = useMemo(() => {
    let min = 100
    for (const vitals of climberVitals.values()) min = Math.min(min, vitals.spo2)
    return min
  }, [climberVitals])

  const congestionPct = useMemo(
    () =>
      Math.round(
        (regions.reduce((sum, r) => sum + r.partiesOnRoute, 0) / regions.length / MAX_PARTIES_ON_ROUTE) * 100
      ),
    []
  )

  const totalNodes = statusOf.size
  const anomalyCount = useMemo(() => [...statusOf.values()].filter((s) => s === 'anomaly').length, [statusOf])

  // Featured route: whichever environment currently reads worst (anomaly >
  // watch > nominal, tie-broken by wind speed) — ties the ROUTE ANALYSIS,
  // CAMP TEMPERATURE, and CONDITIONS panels to whatever's live and notable.
  const featuredEnvironment = useMemo(() => {
    let best = environments[0]
    let bestScore = -1
    for (const env of environments) {
      const status = statusOf.get(env.id)
      const rank = status === 'anomaly' ? 2 : status === 'watch' ? 1 : 0
      const wind = environmentReading.get(env.id)?.windKph ?? 0
      const score = rank * 1000 + wind
      if (score > bestScore) {
        bestScore = score
        best = env
      }
    }
    return best
  }, [statusOf, environmentReading])

  const featuredRegion = regionById.get(featuredEnvironment.regionId)
  const featuredReading = environmentReading.get(featuredEnvironment.id)

  const exposedPct = useMemo(() => {
    const exposed = climbers.filter((c) => EXPOSED_POSITIONS.has(c.currentPosition)).length
    return Math.round((exposed / climbers.length) * 100)
  }, [])

  const currentExposureLoadPct = totalNodes === 0 ? 0 : (anomalyCount / totalNodes) * 100
  const [exposureHistory, setExposureHistory] = useState<number[]>(() => Array(EXPOSURE_HISTORY_LENGTH).fill(currentExposureLoadPct))
  useEffect(() => {
    const interval = window.setInterval(() => {
      setExposureHistory((prev) => [...prev.slice(1), currentExposureLoadPct])
    }, EXPOSURE_SAMPLE_MS)
    return () => window.clearInterval(interval)
  }, [currentExposureLoadPct])

  const campTemps = useMemo(() => {
    if (!featuredReading) return []
    const lapsePerM = 6.5 / 1000
    const camps = [
      { label: 'BC', offsetM: 0 },
      { label: 'C2', offsetM: 700 },
      { label: 'C3', offsetM: 1300 },
      { label: 'C4', offsetM: 1900 },
    ]
    return camps.map((camp) => ({
      label: camp.label,
      tempC: Math.round(featuredReading.tempC - camp.offsetM * lapsePerM),
    }))
  }, [featuredReading])

  const { spo2Series, hrSeries } = useMemo(() => {
    const spo2: number[] = []
    const hr: number[] = []
    for (const position of POSITIONS) {
      const atPosition = climbers.filter((c) => c.currentPosition === position)
      if (atPosition.length === 0) {
        spo2.push(90)
        hr.push(90)
        continue
      }
      let spo2Sum = 0
      let hrSum = 0
      for (const climber of atPosition) {
        const vitals = climberVitals.get(climber.id)
        spo2Sum += vitals?.spo2 ?? climber.baseSpO2
        hrSum += vitals?.hr ?? climber.baseHr
      }
      spo2.push(Math.round(spo2Sum / atPosition.length))
      hr.push(Math.round(hrSum / atPosition.length))
    }
    return { spo2Series: spo2, hrSeries: hr }
  }, [climberVitals])

  // --- CONNECTED SYSTEMS: the two live feeds grow their record count and
  // refresh their sync time on every real tick from the shared store; the
  // three registries are static, and Permit registry starts degraded with a
  // sync time hours stale — a fixed offset captured once at mount.
  const sensorMeshCountRef = useRef(climbers.length)
  const [sensorMeshCount, setSensorMeshCount] = useState(climbers.length)
  const [sensorMeshSync, setSensorMeshSync] = useState(() => new Date())
  useEffect(() => {
    sensorMeshCountRef.current += climbers.length
    setSensorMeshCount(sensorMeshCountRef.current)
    setSensorMeshSync(new Date())
  }, [climberVitals])

  const weatherFeedCountRef = useRef(environments.length)
  const [weatherFeedCount, setWeatherFeedCount] = useState(environments.length)
  const [weatherFeedSync, setWeatherFeedSync] = useState(() => new Date())
  useEffect(() => {
    weatherFeedCountRef.current += environments.length
    setWeatherFeedCount(weatherFeedCountRef.current)
    setWeatherFeedSync(new Date())
  }, [environmentReading])

  const [permitRegistrySync] = useState(() => new Date(Date.now() - (7 * 60 + 12) * 60 * 1000))
  const [operatorRosterSync] = useState(() => new Date(Date.now() - 14 * 60 * 1000))
  const [medicalLogsSync] = useState(() => new Date(Date.now() - 41 * 60 * 1000))
  const permitRegistryCount = useMemo(() => countries.reduce((sum, c) => sum + c.permitsIssued, 0), [])
  const operatorRosterCount = useMemo(() => companies.reduce((sum, c) => sum + c.guidesActive, 0), [])
  const medicalLogsCount = climbers.length

  const sources: SourceRow[] = [
    { id: 'sensor-mesh', name: SOURCE_NAME['sensor-mesh'], recordCount: sensorMeshCount, lastSync: sensorMeshSync, degraded: false },
    { id: 'weather-feed', name: SOURCE_NAME['weather-feed'], recordCount: weatherFeedCount, lastSync: weatherFeedSync, degraded: false },
    { id: 'permit-registry', name: SOURCE_NAME['permit-registry'], recordCount: permitRegistryCount, lastSync: permitRegistrySync, degraded: true },
    { id: 'operator-rosters', name: SOURCE_NAME['operator-rosters'], recordCount: operatorRosterCount, lastSync: operatorRosterSync, degraded: false },
    { id: 'medical-logs', name: SOURCE_NAME['medical-logs'], recordCount: medicalLogsCount, lastSync: medicalLogsSync, degraded: false },
  ]
  const recordsIngested = sources.reduce((sum, s) => sum + s.recordCount, 0)

  function handleSelectSource(id: SourceId) {
    setSelectedSourceId((s) => (s === id ? null : id))
  }

  return (
    <div className="h-full w-full overflow-y-auto" style={{ backgroundColor: BG, color: TEXT_PRIMARY }}>
      <PanelRow>
        <Panel span={4}>
          <KpiTile label="Lowest SpO2 on route" value={String(lowestSpo2)} unit="%" segValue={lowestSpo2} segMax={100} />
        </Panel>
        <Panel span={4}>
          <KpiTile label="Route congestion" value={String(congestionPct)} unit="%" segValue={congestionPct} segMax={100} />
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
          <PanelLabel>Expedition clock</PanelLabel>
          <ExpeditionClock />
        </Panel>
        <Panel span={4}>
          <RouteAnalysis
            routeName={featuredRegion?.name ?? 'Route analysis'}
            entry={featuredEnvironment.altitudeBandLowM}
            crux={featuredRegion?.maxAltitudeM ?? featuredEnvironment.altitudeBandHighM}
            exit={featuredEnvironment.altitudeBandHighM}
          />
        </Panel>
        <Panel span={4} className="flex flex-col gap-5">
          <PanelLabel>Ascent balance</PanelLabel>
          <AscentBalance exposedPct={exposedPct} />
        </Panel>
      </PanelRow>

      <PanelRow>
        <Panel span={6} className="flex flex-col gap-5">
          <PanelLabel>Exposure load</PanelLabel>
          <ExposureLoad values={exposureHistory} />
        </Panel>
        <Panel span={6} className="flex flex-col gap-5">
          <PanelLabel>{`Camp temperature — ${featuredRegion?.name ?? ''}`}</PanelLabel>
          <CampTemperature camps={campTemps} />
        </Panel>
      </PanelRow>

      <PanelRow>
        <Panel span={6} className="flex flex-col gap-5">
          <PanelLabel>{`Conditions — ${featuredRegion?.name ?? ''}`}</PanelLabel>
          <Conditions
            tempC={featuredReading?.tempC ?? 0}
            windKph={featuredReading?.windKph ?? 0}
            windBearingDeg={featuredReading?.windBearingDeg ?? 0}
          />
        </Panel>
        <Panel span={6} className="flex flex-col gap-5">
          <PanelLabel>Data stream</PanelLabel>
          <DataStream spo2Series={spo2Series} hrSeries={hrSeries} ascentSeries={ASCENT_RATE_REFERENCE} />
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
