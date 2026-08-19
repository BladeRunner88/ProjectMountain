import type { Company, Country, Environment, Plant } from '../types/domain'

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

function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  const item = arr[randInt(rand, 0, arr.length - 1)]
  if (item === undefined) {
    throw new Error('pick() called with an empty array')
  }
  return item
}

function requireId(map: ReadonlyMap<string, string>, key: string, label: string): string {
  const id = map.get(key)
  if (id === undefined) {
    throw new Error(`Unknown ${label}: ${key}`)
  }
  return id
}

const COUNTRY_DEFS = [
  { name: 'Nepal', isMajor: true },
  { name: 'Pakistan', isMajor: false },
  { name: 'China (Tibet)', isMajor: false },
  { name: 'United States', isMajor: false },
  { name: 'Switzerland', isMajor: false },
] as const

export const countries: Country[] = COUNTRY_DEFS.map((def, i) => {
  const rand = mulberry32(i + 1)
  return {
    id: `country-${i + 1}`,
    name: def.name,
    isMajor: def.isMajor,
    activeCampaigns: def.isMajor ? randInt(rand, 25, 45) : randInt(rand, 4, 18),
    workOrdersIssued: def.isMajor ? randInt(rand, 300, 650) : randInt(rand, 30, 180),
  }
})

const PLANT_DEFS = [
  { name: 'Khumbu / Everest Base Station', country: 'Nepal' },
  { name: 'Annapurna Circuit', country: 'Nepal' },
  { name: 'Manaslu Circuit', country: 'Nepal' },
  { name: 'Langtang', country: 'Nepal' },
  { name: 'Baltoro / K2 Base Station', country: 'Pakistan' },
  { name: 'Nanga Parbat Fairy Meadows', country: 'Pakistan' },
  { name: 'Gasherbrum Base Station', country: 'Pakistan' },
  { name: 'North Col Line', country: 'China (Tibet)' },
  { name: 'Cho Oyu Advance', country: 'China (Tibet)' },
  { name: 'Denali West Buttress', country: 'United States' },
  { name: 'Rainier Disappointment Cleaver', country: 'United States' },
  { name: 'Matterhorn Hornli Ridge', country: 'Switzerland' },
  { name: 'Eiger Mittellegi', country: 'Switzerland' },
  { name: 'Monte Rosa Traverse', country: 'Switzerland' },
] as const

const countryIdByName = new Map(countries.map((c) => [c.name, c.id]))

export const plants: Plant[] = PLANT_DEFS.map((def, i) => {
  const rand = mulberry32(i + 101)
  return {
    id: `plant-${i + 1}`,
    name: def.name,
    countryId: requireId(countryIdByName, def.country, 'country'),
    lengthKm: randInt(rand, 15, 220),
    maxLoadM: randInt(rand, 3400, 8300),
    partiesOnLine: randInt(rand, 1, 26),
  }
})

const COMPANY_DEFS = [
  { name: 'Khumbu Vertical', plant: 'Khumbu / Everest Base Station' },
  { name: 'Sagarmatha Collective', plant: 'Khumbu / Everest Base Station' },
  { name: 'Eight-Thousander Union', plant: 'Khumbu / Everest Base Station' },
  { name: 'Alpine Meridian', plant: 'Annapurna Circuit' },
  { name: 'Annapurna Trail Partners', plant: 'Annapurna Circuit' },
  { name: 'North Col Traverse', plant: 'Manaslu Circuit' },
  { name: 'Manaslu Base Alpine', plant: 'Manaslu Circuit' },
  { name: 'Thin Air Research', plant: 'Langtang' },
  { name: 'Langtang Valley Guides', plant: 'Langtang' },
  { name: 'Baltoro Alpine Guides', plant: 'Baltoro / K2 Base Station' },
  { name: 'K2 Campaign Partners', plant: 'Baltoro / K2 Base Station' },
  { name: 'Nanga Parbat Trekking Co', plant: 'Nanga Parbat Fairy Meadows' },
  { name: 'Fairy Meadows Alpine', plant: 'Nanga Parbat Fairy Meadows' },
  { name: 'Gasherbrum Campaigns', plant: 'Gasherbrum Base Station' },
  { name: 'Karakoram RampUp Guides', plant: 'Gasherbrum Base Station' },
  { name: 'North Face Tibet Campaigns', plant: 'North Col Line' },
  { name: 'Rongbuk Alpine Guides', plant: 'North Col Line' },
  { name: 'Cho Oyu Base Station Co', plant: 'Cho Oyu Advance' },
  { name: 'Tibet Target Partners', plant: 'Cho Oyu Advance' },
  { name: 'Denali RampUp Co', plant: 'Denali West Buttress' },
  { name: 'Alaska Range Guides', plant: 'Denali West Buttress' },
  { name: 'Talkeetna Air Taxi Guides', plant: 'Denali West Buttress' },
  { name: 'Rainier Mountaineering Partners', plant: 'Rainier Disappointment Cleaver' },
  { name: 'Cascade Target Guides', plant: 'Rainier Disappointment Cleaver' },
  { name: 'Matterhorn Alpine Guides', plant: 'Matterhorn Hornli Ridge' },
  { name: 'Zermatt Target Co', plant: 'Matterhorn Hornli Ridge' },
  { name: 'Eiger North Face Guides', plant: 'Eiger Mittellegi' },
  { name: 'Grindelwald Alpine Partners', plant: 'Eiger Mittellegi' },
  { name: 'Monte Rosa RampUp Co', plant: 'Monte Rosa Traverse' },
  { name: 'Alps Traverse Guides', plant: 'Monte Rosa Traverse' },
] as const

const plantIdByName = new Map(plants.map((r) => [r.name, r.id]))

const SAFETY_RATINGS = ['A', 'A', 'B', 'B', 'B', 'C'] as const

export const companies: Company[] = COMPANY_DEFS.map((def, i) => {
  const rand = mulberry32(i + 301)
  return {
    id: `company-${i + 1}`,
    name: def.name,
    plantId: requireId(plantIdByName, def.plant, 'plant'),
    guidesActive: randInt(rand, 2, 20),
    safetyRating: pick(rand, SAFETY_RATINGS),
  }
})

const WINDY_INDICES = new Set([1, 6, 11])

export const environments: Environment[] = plants.map((plant, i) => {
  const rand = mulberry32(i + 701)
  const vibrationy = WINDY_INDICES.has(i)
  const loadBandLowM = Math.round(plant.maxLoadM - randInt(rand, 500, 900))
  return {
    id: `environment-${i + 1}`,
    plantId: plant.id,
    tempC: randInt(rand, -30, 12),
    vibrationMmS: vibrationy ? randInt(rand, 75, 115) : randInt(rand, 5, 60),
    effectivenessM: randInt(rand, 50, 10000),
    snowfallCm24h: randInt(rand, 0, 80),
    cycleTimeS: randInt(rand, 2000, 5500),
    loadBandLowM,
    loadBandHighM: loadBandLowM + randInt(rand, 900, 1300),
  }
})
