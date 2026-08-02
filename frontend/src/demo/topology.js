// Client-side mock topology only — no backend call. Countries, regions,
// trekking companies, and per-region environment readings. Every number
// comes from mulberry32 seeded by the entity's own index within its tier
// (offset per tier so no two tiers share a seed sequence), so the same
// topology appears on every reload.

function mulberry32(seed) {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rand, min, max) {
  return Math.floor(rand() * (max - min + 1)) + min
}

function pick(rand, arr) {
  return arr[randInt(rand, 0, arr.length - 1)]
}

// ---------------------------------------------------------------------------
// TIER 1 — COUNTRY (5)
// ---------------------------------------------------------------------------

const COUNTRY_DEFS = [
  { name: 'Nepal', isMajor: true },
  { name: 'Pakistan', isMajor: false },
  { name: 'China (Tibet)', isMajor: false },
  { name: 'United States', isMajor: false },
  { name: 'Switzerland', isMajor: false },
]

export const countries = COUNTRY_DEFS.map((def, i) => {
  const rand = mulberry32(i + 1)
  return {
    id: `country-${i + 1}`,
    name: def.name,
    isMajor: def.isMajor,
    activeExpeditions: def.isMajor ? randInt(rand, 25, 45) : randInt(rand, 4, 18),
    permitsIssued: def.isMajor ? randInt(rand, 300, 650) : randInt(rand, 30, 180),
  }
})

// ---------------------------------------------------------------------------
// TIER 2 — REGION / TREKKING ROUTE (14, 2-4 per country)
// ---------------------------------------------------------------------------

const REGION_DEFS = [
  { name: 'Khumbu / Everest Base Camp', country: 'Nepal' },
  { name: 'Annapurna Circuit', country: 'Nepal' },
  { name: 'Manaslu Circuit', country: 'Nepal' },
  { name: 'Langtang', country: 'Nepal' },
  { name: 'Baltoro / K2 Base Camp', country: 'Pakistan' },
  { name: 'Nanga Parbat Fairy Meadows', country: 'Pakistan' },
  { name: 'Gasherbrum Base Camp', country: 'Pakistan' },
  { name: 'North Col Route', country: 'China (Tibet)' },
  { name: 'Cho Oyu Advance', country: 'China (Tibet)' },
  { name: 'Denali West Buttress', country: 'United States' },
  { name: 'Rainier Disappointment Cleaver', country: 'United States' },
  { name: 'Matterhorn Hornli Ridge', country: 'Switzerland' },
  { name: 'Eiger Mittellegi', country: 'Switzerland' },
  { name: 'Monte Rosa Traverse', country: 'Switzerland' },
]

const countryIdByName = new Map(countries.map((c) => [c.name, c.id]))

export const regions = REGION_DEFS.map((def, i) => {
  const rand = mulberry32(i + 101)
  return {
    id: `region-${i + 1}`,
    name: def.name,
    countryId: countryIdByName.get(def.country),
    lengthKm: randInt(rand, 15, 220),
    maxAltitudeM: randInt(rand, 3400, 8300),
    partiesOnRoute: randInt(rand, 1, 26),
  }
})

// ---------------------------------------------------------------------------
// TIER 3 — TREKKING COMPANY (30, 2-3 per region)
// The 6 Step 6 team names are reused as Nepal operators so nothing is lost.
// ---------------------------------------------------------------------------

const COMPANY_DEFS = [
  { name: 'Khumbu Vertical', region: 'Khumbu / Everest Base Camp' },
  { name: 'Sagarmatha Collective', region: 'Khumbu / Everest Base Camp' },
  { name: 'Eight-Thousander Union', region: 'Khumbu / Everest Base Camp' },
  { name: 'Alpine Meridian', region: 'Annapurna Circuit' },
  { name: 'Annapurna Trail Partners', region: 'Annapurna Circuit' },
  { name: 'North Col Traverse', region: 'Manaslu Circuit' },
  { name: 'Manaslu Base Alpine', region: 'Manaslu Circuit' },
  { name: 'Thin Air Research', region: 'Langtang' },
  { name: 'Langtang Valley Guides', region: 'Langtang' },
  { name: 'Baltoro Alpine Guides', region: 'Baltoro / K2 Base Camp' },
  { name: 'K2 Expedition Partners', region: 'Baltoro / K2 Base Camp' },
  { name: 'Nanga Parbat Trekking Co', region: 'Nanga Parbat Fairy Meadows' },
  { name: 'Fairy Meadows Alpine', region: 'Nanga Parbat Fairy Meadows' },
  { name: 'Gasherbrum Expeditions', region: 'Gasherbrum Base Camp' },
  { name: 'Karakoram Ascent Guides', region: 'Gasherbrum Base Camp' },
  { name: 'North Face Tibet Expeditions', region: 'North Col Route' },
  { name: 'Rongbuk Alpine Guides', region: 'North Col Route' },
  { name: 'Cho Oyu Base Camp Co', region: 'Cho Oyu Advance' },
  { name: 'Tibet Summit Partners', region: 'Cho Oyu Advance' },
  { name: 'Denali Ascent Co', region: 'Denali West Buttress' },
  { name: 'Alaska Range Guides', region: 'Denali West Buttress' },
  { name: 'Talkeetna Air Taxi Guides', region: 'Denali West Buttress' },
  { name: 'Rainier Mountaineering Partners', region: 'Rainier Disappointment Cleaver' },
  { name: 'Cascade Summit Guides', region: 'Rainier Disappointment Cleaver' },
  { name: 'Matterhorn Alpine Guides', region: 'Matterhorn Hornli Ridge' },
  { name: 'Zermatt Summit Co', region: 'Matterhorn Hornli Ridge' },
  { name: 'Eiger North Face Guides', region: 'Eiger Mittellegi' },
  { name: 'Grindelwald Alpine Partners', region: 'Eiger Mittellegi' },
  { name: 'Monte Rosa Ascent Co', region: 'Monte Rosa Traverse' },
  { name: 'Alps Traverse Guides', region: 'Monte Rosa Traverse' },
]

const regionIdByName = new Map(regions.map((r) => [r.name, r.id]))

export const companies = COMPANY_DEFS.map((def, i) => {
  const rand = mulberry32(i + 301)
  return {
    id: `company-${i + 1}`,
    name: def.name,
    regionId: regionIdByName.get(def.region),
    guidesActive: randInt(rand, 2, 20),
    safetyRating: pick(rand, ['A', 'A', 'B', 'B', 'B', 'C']),
  }
})

// ---------------------------------------------------------------------------
// SIDE TIER — ENVIRONMENT (1 per region, 14)
// Status is not authored here — it's owned live by the central simulation
// store (see useGraphSimulation.ts), which also seeds indices 1, 6, and 11
// as starting in 'anomaly'. These readings just need to look the part: wind
// mostly stays calm, and those same three sensors are seeded hot so their
// numbers agree with the status they start in.
// ---------------------------------------------------------------------------

const WINDY_INDICES = new Set([1, 6, 11])

export const environments = regions.map((region, i) => {
  const rand = mulberry32(i + 701)
  const windy = WINDY_INDICES.has(i)
  const altitudeBandLowM = Math.round(region.maxAltitudeM - randInt(rand, 500, 900))
  return {
    id: `environment-${i + 1}`,
    regionId: region.id,
    tempC: randInt(rand, -30, 12),
    windKph: windy ? randInt(rand, 75, 115) : randInt(rand, 5, 60),
    visibilityM: randInt(rand, 50, 10000),
    snowfallCm24h: randInt(rand, 0, 80),
    freezingLevelM: randInt(rand, 2000, 5500),
    altitudeBandLowM,
    altitudeBandHighM: altitudeBandLowM + randInt(rand, 900, 1300),
  }
})
