// Deterministic hierarchical radial layout — no physics simulation.
// Country -> Region -> Company -> Climber, radiating outward tier by tier,
// with Environment nodes branching perpendicular off their region. Every
// node gets a small seeded jitter so rows never look mechanically aligned.
//
// Also derives everything the two motion systems need: per-node spawn delay
// and drift phase/amplitude, and per-edge reveal timing — all seeded and
// computed once here, so the canvas component only has to render and drive
// the frame loop, not derive any more numbers.

import type { Climber, Company, Country, Environment, NodeStatus, Region } from '../../../demo/types'

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

// Small string hash so every node gets its own stable seed without needing a
// shared numeric index across unrelated entity lists.
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

// perpendicular (tangential) unit vector at a given angle — for pushing
// environment nodes off to the side of the radial axis rather than further
// out along it
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

// 'structure' edges are true parent -> child links (their colour is derived
// at render time from the target/child's rolled-up status). 'ring' edges are
// the peer links joining consecutive countries purely for connectivity —
// they have no child to take a status from, so they never recolour. 'weather'
// edges are the environment sensor's direct national feed to its country —
// a peer link like 'ring', coloured from the environment (source) itself
// rather than any parent/child relationship.
export type EdgeKind = 'structure' | 'ring' | 'weather'

export interface HierarchyEdge {
  source: string
  target: string
  kind: EdgeKind
  // which tier landing triggers this edge's draw-in reveal
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
  // child id -> parent id, for the hover ancestor-chain highlight
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
  countries: Country[],
  regions: Region[],
  companies: Company[],
  climbers: Climber[],
  environments: Environment[]
): HierarchyLayout {
  const positions = new Map<string, Point>()
  const sizes = new Map<string, number>()
  const edges: HierarchyEdge[] = []
  const tierOf = new Map<string, Tier>()
  const spawnDelay = new Map<string, number>()
  const driftPhase = new Map<string, number>()
  const driftAmplitude = new Map<string, number>()
  const parentOf = new Map<string, string>()

  function setNodeMeta(id: string, tier: Tier, indexInTier: number) {
    tierOf.set(id, tier)
    spawnDelay.set(id, SPAWN_TIER_DELAY[tier] + indexInTier * SPAWN_STAGGER_PER_NODE)
    const rand = mulberry32(seedFromId(id, 9))
    driftPhase.set(id, rand() * Math.PI * 2)
    driftAmplitude.set(id, DRIFT_AMPLITUDE[tier])
  }

  const countryLanded = tierLandedTime('country', countries.length)
  const regionLanded = tierLandedTime('region', regions.length)
  const environmentLanded = tierLandedTime('environment', environments.length)
  const companyLanded = tierLandedTime('company', companies.length)
  const climberLanded = tierLandedTime('climber', climbers.length)

  const environmentByRegion = new Map(environments.map((e) => [e.regionId, e]))
  const countryWedgeWidth = 360 / countries.length

  countries.forEach((country, ci) => {
    const centerAngle = ci * countryWedgeWidth
    const countryWedge = { start: centerAngle - countryWedgeWidth / 2, end: centerAngle + countryWedgeWidth / 2 }

    const cBase = pointAt(centerAngle, R_COUNTRY)
    const cj = jitter(seedFromId(country.id, 1))
    positions.set(country.id, { x: cBase.x + cj.x, y: cBase.y + cj.y })
    sizes.set(country.id, country.isMajor ? NODE_SIZE.country * NODE_SIZE.countryMajorScale : NODE_SIZE.country)
    setNodeMeta(country.id, 'country', ci)

    const countryRegions = regions.filter((r) => r.countryId === country.id)
    const regionWedges = splitWedge(countryWedge.start, countryWedge.end, countryRegions.length)

    countryRegions.forEach((region, ri) => {
      const regionIndexGlobal = regions.indexOf(region)
      edges.push({ source: country.id, target: region.id, kind: 'structure', revealTier: 'region', revealDelay: regionLanded })
      parentOf.set(region.id, country.id)
      const rw = regionWedges[ri]

      const rBase = pointAt(rw.center, R_REGION)
      const rj = jitter(seedFromId(region.id, 2))
      const regionPos = { x: rBase.x + rj.x, y: rBase.y + rj.y }
      positions.set(region.id, regionPos)
      sizes.set(region.id, NODE_SIZE.region)
      setNodeMeta(region.id, 'region', regionIndexGlobal)

      // Environment branch — same radial depth as the region, pushed
      // tangentially so it reads as a side-branch, not another child row.
      // It gets two connectors: the grey structural link to its region, and
      // a dashed "national weather feed" straight to the country — a peer
      // link, not part of the parent chain, so it's excluded from parentOf.
      const env = environmentByRegion.get(region.id)
      if (env) {
        const envIndexGlobal = environments.indexOf(env)
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

      const regionCompanies = companies.filter((c) => c.regionId === region.id)
      const companyWedges = splitWedge(rw.start, rw.end, regionCompanies.length)

      regionCompanies.forEach((company, coi) => {
        const companyIndexGlobal = companies.indexOf(company)
        edges.push({ source: region.id, target: company.id, kind: 'structure', revealTier: 'company', revealDelay: companyLanded })
        parentOf.set(company.id, region.id)
        const cw = companyWedges[coi]

        const coBase = pointAt(cw.center, R_COMPANY)
        const coj = jitter(seedFromId(company.id, 3))
        positions.set(company.id, { x: coBase.x + coj.x, y: coBase.y + coj.y })
        sizes.set(company.id, NODE_SIZE.company)
        setNodeMeta(company.id, 'company', companyIndexGlobal)

        const companyClimbers = climbers.filter((cl) => cl.companyId === company.id)
        const climberWedges = splitWedge(cw.start, cw.end, companyClimbers.length)

        companyClimbers.forEach((climber, li) => {
          const climberIndexGlobal = climbers.indexOf(climber)
          edges.push({ source: company.id, target: climber.id, kind: 'structure', revealTier: 'climber', revealDelay: climberLanded })
          parentOf.set(climber.id, company.id)
          const lBase = pointAt(climberWedges[li].center, R_CLIMBER)
          const lj = jitter(seedFromId(climber.id, 4))
          positions.set(climber.id, { x: lBase.x + lj.x, y: lBase.y + lj.y })
          sizes.set(climber.id, NODE_SIZE.climber)
          setNodeMeta(climber.id, 'climber', climberIndexGlobal)
        })
      })
    })
  })

  // The canvas centre holds nothing, so without this the 5 countries would
  // be 5 disconnected trees (a forest) rather than "one connected tree" — a
  // thin ring joining consecutive countries makes the whole graph one
  // component while keeping the centre empty and each branch distinct. It's
  // a peer link, not a parent -> child one, so it's tagged 'ring' rather
  // than 'structure' and never takes a status colour.
  countries.forEach((country, ci) => {
    const next = countries[(ci + 1) % countries.length]
    edges.push({ source: country.id, target: next.id, kind: 'ring', revealTier: 'country', revealDelay: countryLanded })
  })

  return { positions, sizes, edges, tierOf, spawnDelay, driftPhase, driftAmplitude, parentOf }
}

// Status roll-up is computed separately from (and after) the static layout
// above, and re-run any time it changes — both climber and environment
// status are now live (a central simulation store owns them, see
// useGraphSimulation.ts), so company/region/country roll up fresh every call
// rather than being derived once at layout-build time.
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

  // Company status isn't a simple worst-of-children roll-up: one anomalous
  // climber is a 'watch', two or more tips it to 'anomaly'.
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
    for (const id of companiesByRegion.get(regionId) ?? []) worst = worstStatus(worst, statusOf.get(id)!)
    for (const id of environmentsByRegion.get(regionId) ?? []) worst = worstStatus(worst, statusOf.get(id)!)
    statusOf.set(regionId, worst)
  }

  const regionsByCountry = childrenByParent('region')
  for (const countryId of idsOfTier('country')) {
    let worst: NodeStatus = 'nominal'
    for (const id of regionsByCountry.get(countryId) ?? []) worst = worstStatus(worst, statusOf.get(id)!)
    statusOf.set(countryId, worst)
  }

  return statusOf
}
