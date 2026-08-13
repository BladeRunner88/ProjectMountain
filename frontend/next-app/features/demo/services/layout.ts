import type { Climber, Company, Country, Environment, NodeStatus, Region } from '../types/domain'

export interface Point {
  x: number
  y: number
}

export const CANVAS_SIZE = 2400
export const CENTER: Point = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 }

const R_COUNTRY = 480
const R_REGION = 650
const R_COMPANY = 800
const R_CLIMBER = 930
const ENV_PERP_OFFSET = 70
const JITTER_PX = 8
const WEDGE_MARGIN = 0.82

export const NODE_SIZE = {
  country: 46,
  countryMajorScale: 1.4,
  region: 26,
  company: 14,
  climber: 8,
  environment: 20,
}

export type Tier = 'country' | 'region' | 'environment' | 'company' | 'climber'

export const SPAWN_TIER_DELAY: Record<Tier, number> = {
  country: 0,
  region: 250,
  environment: 400,
  company: 550,
  climber: 800,
}
export const SPAWN_STAGGER_PER_NODE = 12
export const SPAWN_NODE_DURATION = 800
export const EDGE_REVEAL_DURATION = 320

export const DRIFT_AMPLITUDE: Record<Tier, number> = {
  country: 2,
  region: 4,
  company: 6,
  climber: 8,
  environment: 5,
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

function seedFromId(id: string, salt: number): number {
  let h = salt
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0
  return h
}

function jitter(seed: number): Point {
  const rand = mulberry32(seed)
  return { x: (rand() * 2 - 1) * JITTER_PX, y: (rand() * 2 - 1) * JITTER_PX }
}

function pointAt(angleDeg: number, radius: number): Point {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CENTER.x + radius * Math.sin(rad), y: CENTER.y - radius * Math.cos(rad) }
}

function tangentAt(angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180
  return { x: Math.cos(rad), y: Math.sin(rad) }
}

interface Wedge {
  start: number
  end: number
  center: number
}

function splitWedge(start: number, end: number, count: number, margin = WEDGE_MARGIN): Wedge[] {
  if (count <= 0) return []
  const slotWidth = (end - start) / count
  const results: Wedge[] = []
  for (let i = 0; i < count; i++) {
    const slotStart = start + i * slotWidth
    const slotEnd = slotStart + slotWidth
    const used = slotWidth * margin
    const pad = (slotWidth - used) / 2
    const childStart = slotStart + pad
    const childEnd = slotEnd - pad
    results.push({ start: childStart, end: childEnd, center: (childStart + childEnd) / 2 })
  }
  return results
}

export type EdgeKind = 'structure' | 'ring' | 'weather'

export interface HierarchyEdge {
  source: string
  target: string
  kind: EdgeKind
  revealTier: Tier
  revealDelay: number
}

export interface HierarchyLayout {
  positions: Map<string, Point>
  sizes: Map<string, number>
  edges: HierarchyEdge[]
  tierOf: Map<string, Tier>
  spawnDelay: Map<string, number>
  driftPhase: Map<string, number>
  driftAmplitude: Map<string, number>
  parentOf: Map<string, string>
}

function tierLandedTime(tier: Tier, tierCount: number): number {
  return SPAWN_TIER_DELAY[tier] + Math.max(0, tierCount - 1) * SPAWN_STAGGER_PER_NODE + SPAWN_NODE_DURATION
}

const STATUS_RANK: Record<NodeStatus, number> = { nominal: 0, watch: 1, anomaly: 2 }
function worstStatus(a: NodeStatus, b: NodeStatus): NodeStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a
}

export function buildHierarchyLayout(
  countryList: Country[],
  regionList: Region[],
  companyList: Company[],
  climberList: Climber[],
  environmentList: Environment[]
): HierarchyLayout {
  const positions = new Map<string, Point>()
  const sizes = new Map<string, number>()
  const edges: HierarchyEdge[] = []
  const tierOf = new Map<string, Tier>()
  const spawnDelay = new Map<string, number>()
  const driftPhase = new Map<string, number>()
  const driftAmplitude = new Map<string, number>()
  const parentOf = new Map<string, string>()

  function setNodeMeta(id: string, tier: Tier, indexInTier: number): void {
    tierOf.set(id, tier)
    spawnDelay.set(id, SPAWN_TIER_DELAY[tier] + indexInTier * SPAWN_STAGGER_PER_NODE)
    const rand = mulberry32(seedFromId(id, 9))
    driftPhase.set(id, rand() * Math.PI * 2)
    driftAmplitude.set(id, DRIFT_AMPLITUDE[tier])
  }

  const countryLanded = tierLandedTime('country', countryList.length)
  const regionLanded = tierLandedTime('region', regionList.length)
  const environmentLanded = tierLandedTime('environment', environmentList.length)
  const companyLanded = tierLandedTime('company', companyList.length)
  const climberLanded = tierLandedTime('climber', climberList.length)

  const environmentByRegion = new Map(environmentList.map((e) => [e.regionId, e]))
  const countryWedgeWidth = 360 / countryList.length

  countryList.forEach((country, ci) => {
    const centerAngle = ci * countryWedgeWidth
    const countryWedge = { start: centerAngle - countryWedgeWidth / 2, end: centerAngle + countryWedgeWidth / 2 }

    const cBase = pointAt(centerAngle, R_COUNTRY)
    const cj = jitter(seedFromId(country.id, 1))
    positions.set(country.id, { x: cBase.x + cj.x, y: cBase.y + cj.y })
    sizes.set(country.id, country.isMajor ? NODE_SIZE.country * NODE_SIZE.countryMajorScale : NODE_SIZE.country)
    setNodeMeta(country.id, 'country', ci)

    const countryRegions = regionList.filter((r) => r.countryId === country.id)
    const regionWedges = splitWedge(countryWedge.start, countryWedge.end, countryRegions.length)

    countryRegions.forEach((region, ri) => {
      const regionIndexGlobal = regionList.indexOf(region)
      edges.push({ source: country.id, target: region.id, kind: 'structure', revealTier: 'region', revealDelay: regionLanded })
      parentOf.set(region.id, country.id)
      const rw = regionWedges[ri]
      if (!rw) return

      const rBase = pointAt(rw.center, R_REGION)
      const rj = jitter(seedFromId(region.id, 2))
      const regionPos = { x: rBase.x + rj.x, y: rBase.y + rj.y }
      positions.set(region.id, regionPos)
      sizes.set(region.id, NODE_SIZE.region)
      setNodeMeta(region.id, 'region', regionIndexGlobal)

      const env = environmentByRegion.get(region.id)
      if (env) {
        const envIndexGlobal = environmentList.indexOf(env)
        const tangent = tangentAt(rw.center)
        const ej = jitter(seedFromId(env.id, 5))
        positions.set(env.id, {
          x: regionPos.x + tangent.x * ENV_PERP_OFFSET + ej.x,
          y: regionPos.y + tangent.y * ENV_PERP_OFFSET + ej.y,
        })
        sizes.set(env.id, NODE_SIZE.environment)
        setNodeMeta(env.id, 'environment', envIndexGlobal)
        parentOf.set(env.id, region.id)
        edges.push({ source: region.id, target: env.id, kind: 'structure', revealTier: 'environment', revealDelay: environmentLanded })
        edges.push({ source: env.id, target: country.id, kind: 'weather', revealTier: 'environment', revealDelay: environmentLanded })
      }

      const regionCompanies = companyList.filter((c) => c.regionId === region.id)
      const companyWedges = splitWedge(rw.start, rw.end, regionCompanies.length)

      regionCompanies.forEach((company, coi) => {
        const companyIndexGlobal = companyList.indexOf(company)
        edges.push({ source: region.id, target: company.id, kind: 'structure', revealTier: 'company', revealDelay: companyLanded })
        parentOf.set(company.id, region.id)
        const cw = companyWedges[coi]
        if (!cw) return

        const coBase = pointAt(cw.center, R_COMPANY)
        const coj = jitter(seedFromId(company.id, 3))
        positions.set(company.id, { x: coBase.x + coj.x, y: coBase.y + coj.y })
        sizes.set(company.id, NODE_SIZE.company)
        setNodeMeta(company.id, 'company', companyIndexGlobal)

        const companyClimbers = climberList.filter((cl) => cl.companyId === company.id)
        const climberWedges = splitWedge(cw.start, cw.end, companyClimbers.length)

        companyClimbers.forEach((climber, li) => {
          const climberIndexGlobal = climberList.indexOf(climber)
          edges.push({ source: company.id, target: climber.id, kind: 'structure', revealTier: 'climber', revealDelay: climberLanded })
          parentOf.set(climber.id, company.id)
          const climberWedge = climberWedges[li]
          if (!climberWedge) return
          const lBase = pointAt(climberWedge.center, R_CLIMBER)
          const lj = jitter(seedFromId(climber.id, 4))
          positions.set(climber.id, { x: lBase.x + lj.x, y: lBase.y + lj.y })
          sizes.set(climber.id, NODE_SIZE.climber)
          setNodeMeta(climber.id, 'climber', climberIndexGlobal)
        })
      })
    })
  })

  countryList.forEach((country, ci) => {
    const next = countryList[(ci + 1) % countryList.length]
    if (!next) return
    edges.push({ source: country.id, target: next.id, kind: 'ring', revealTier: 'country', revealDelay: countryLanded })
  })

  return { positions, sizes, edges, tierOf, spawnDelay, driftPhase, driftAmplitude, parentOf }
}

export function computeStatusOf(
  layout: Pick<HierarchyLayout, 'parentOf' | 'tierOf'>,
  climberStatus: ReadonlyMap<string, NodeStatus>,
  environmentStatus: ReadonlyMap<string, NodeStatus>
): Map<string, NodeStatus> {
  const { parentOf, tierOf } = layout
  const statusOf = new Map<string, NodeStatus>()

  for (const [climberId, status] of climberStatus) {
    statusOf.set(climberId, status)
  }
  for (const [envId, status] of environmentStatus) {
    statusOf.set(envId, status)
  }

  function idsOfTier(tier: Tier): string[] {
    const ids: string[] = []
    for (const [id, t] of tierOf) if (t === tier) ids.push(id)
    return ids
  }
  function childrenByParent(childTier: Tier): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const [child, parent] of parentOf) {
      if (tierOf.get(child) !== childTier) continue
      const list = map.get(parent)
      if (list) list.push(child)
      else map.set(parent, [child])
    }
    return map
  }

  const climbersByCompany = childrenByParent('climber')
  for (const companyId of idsOfTier('company')) {
    const anomalousClimbers = (climbersByCompany.get(companyId) ?? []).filter(
      (id) => statusOf.get(id) === 'anomaly'
    ).length
    statusOf.set(
      companyId,
      anomalousClimbers === 0 ? 'nominal' : anomalousClimbers === 1 ? 'watch' : 'anomaly'
    )
  }

  const companiesByRegion = childrenByParent('company')
  const environmentsByRegion = childrenByParent('environment')
  for (const regionId of idsOfTier('region')) {
    let worst: NodeStatus = 'nominal'
    for (const id of companiesByRegion.get(regionId) ?? []) {
      worst = worstStatus(worst, statusOf.get(id) ?? 'nominal')
    }
    for (const id of environmentsByRegion.get(regionId) ?? []) {
      worst = worstStatus(worst, statusOf.get(id) ?? 'nominal')
    }
    statusOf.set(regionId, worst)
  }

  const regionsByCountry = childrenByParent('region')
  for (const countryId of idsOfTier('country')) {
    let worst: NodeStatus = 'nominal'
    for (const id of regionsByCountry.get(countryId) ?? []) {
      worst = worstStatus(worst, statusOf.get(id) ?? 'nominal')
    }
    statusOf.set(countryId, worst)
  }

  return statusOf
}
