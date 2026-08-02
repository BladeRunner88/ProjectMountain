// Client-side mock data only — no backend call, nothing fetched. Every
// derived number comes from mulberry32 seeded by the climber's own index, so
// the same 50 climbers with the same vitals appear on every reload.

import { companies } from './topology.js'

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

// [name, ethnicity, from] — index 0 is fixed per spec. Ethnicity labels are
// deliberately varied (never more than 4 uses each) across a wide range:
// European, West/East/Horn of African, East/South/Southeast Asian, Central
// Asian, Middle Eastern, Latin American, Caribbean, Indigenous North
// American, Pacific Islander, Maori, Sherpa/Tamang/Gurung Nepali, Tibetan,
// Mongolian, and mixed heritage.
const ROSTER = [
  ['James Marshall III', 'White American', 'Boulder, Colorado, USA'],
  ['Priya Sharma', 'Indian', 'Mumbai, India'],
  ['Chidi Okafor', 'Nigerian', 'Lagos, Nigeria'],
  ['Haruto Tanaka', 'Japanese', 'Osaka, Japan'],
  ['Camila Flores', 'Peruvian', 'Cusco, Peru'],
  ['Pemba Sherpa', 'Sherpa', 'Solukhumbu, Nepal'],
  ['Emily Hartley', 'British', 'Manchester, England'],
  ['Wanjiru Kamau', 'Kenyan', 'Nairobi, Kenya'],
  ['Min-jun Park', 'Korean', 'Busan, South Korea'],
  ['Diego Hernandez', 'Mexican', 'Guadalajara, Mexico'],
  ['Tenzin Wangchuk', 'Tibetan', 'Lhasa, Tibet'],
  ['Thomas Ashworth', 'British', 'Bristol, England'],
  ['Selamawit Bekele', 'Ethiopian', 'Addis Ababa, Ethiopia'],
  ['Yuki Sato', 'Japanese', 'Sapporo, Japan'],
  ['Valentina Cruz', 'Mexican', 'Monterrey, Mexico'],
  ['Nima Tamang', 'Tamang', 'Rasuwa, Nepal'],
  ['Aoife Byrne', 'Irish', 'Galway, Ireland'],
  ['Otieno Odhiambo', 'Kenyan', 'Kisumu, Kenya'],
  ['Ji-woo Kim', 'Korean', 'Incheon, South Korea'],
  ['Marcus Campbell', 'Jamaican', 'Kingston, Jamaica'],
  ['Batbayar Ganbold', 'Mongolian', 'Ulaanbaatar, Mongolia'],
  ['Giulia Romano', 'Italian', 'Turin, Italy'],
  ['Tunde Balogun', 'Nigerian', 'Abuja, Nigeria'],
  ['Arjun Mehta', 'Indian', 'Delhi, India'],
  ['Dolma Choden', 'Tibetan', 'Shigatse, Tibet'],
  ['Bikram Gurung', 'Gurung', 'Lamjung, Nepal'],
  ['Katarzyna Nowak', 'Polish', 'Krakow, Poland'],
  ['Dawit Girma', 'Ethiopian', 'Gondar, Ethiopia'],
  ['Rohan Gupta', 'Indian', 'Bengaluru, India'],
  ['Shanice Brown', 'Jamaican', 'Montego Bay, Jamaica'],
  ['Oyun Erdene', 'Mongolian', 'Darkhan, Mongolia'],
  ['Marco Ferrari', 'Italian', 'Milan, Italy'],
  ['Njoroge Mwangi', 'Kenyan', 'Nakuru, Kenya'],
  ['Nimal Perera', 'Sri Lankan', 'Kandy, Sri Lanka'],
  ['Waisake Tuilagi', 'Fijian', 'Suva, Fiji'],
  ['Dineh Yazzie', 'Navajo', 'Window Rock, Arizona, USA'],
  ['Aigerim Bekova', 'Kazakh', 'Almaty, Kazakhstan'],
  ['Marisol Santos', 'Filipino', 'Cebu City, Philippines'],
  ['Rami Haddad', 'Lebanese', 'Beirut, Lebanon'],
  ['Hemi Ngata', 'Maori', 'Rotorua, New Zealand'],
  ['Dilnoza Yusupova', 'Uzbek', 'Tashkent, Uzbekistan'],
  ['Ramon Cruz', 'Filipino', 'Manila, Philippines'],
  ['Sara Hosseini', 'Iranian', 'Isfahan, Iran'],
  ['Aroha Rangi', 'Maori', 'Auckland, New Zealand'],
  ['Nurlan Serik', 'Kazakh', 'Astana, Kazakhstan'],
  ['Wayan Putra', 'Indonesian', 'Ubud, Bali, Indonesia'],
  ['Zara Osei-Lindqvist', 'Mixed heritage (Ghanaian-Swedish)', 'Stockholm, Sweden'],
  ['Ahiga Begay', 'Navajo', 'Shiprock, New Mexico, USA'],
  ['Litia Naidu', 'Fijian', 'Nadi, Fiji'],
  ['Kai Anderson-Kim', 'Mixed heritage (French-Korean)', 'Lyon, France'],
]

// Exactly 5 anomalous climbers, never index 0, spread across companies. Kept
// deliberately small: this is the *initial* seed for the live simulation's
// leaf anomaly count (see useGraphSimulation.ts), which also seeds a few
// environments as anomalous — the two combined must start within the
// simulation's [6, 12] cap, not just be "a plausible few" in isolation.
const ANOMALY_INDICES = new Set([3, 7, 12, 19, 22])

const POSITIONS = ['Base Camp', 'Camp I', 'Camp II', 'Camp III', 'Camp IV', 'Summit push']
const PRESSURE_BY_POSITION = {
  'Base Camp': 505,
  'Camp I': 470,
  'Camp II': 445,
  'Camp III': 405,
  'Camp IV': 370,
  'Summit push': 337,
}
const ANOMALY_REASONS = [
  'SpO2 below 80% for 6+ min',
  'Sustained tachycardia at Camp III',
  'Ascent rate exceeds acclimatisation window',
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function buildDob(rand) {
  const year = randInt(rand, 1972, 2001)
  const month = randInt(rand, 0, 11)
  const day = randInt(rand, 1, 28) // avoids invalid-day-for-month edge cases
  return `${String(day).padStart(2, '0')} ${MONTHS[month]} ${year}`
}

function buildTimeToEbc(rand) {
  const days = randInt(rand, 6, 12)
  const hours = randInt(rand, 0, 23)
  return `${days}d ${String(hours).padStart(2, '0')}h`
}

function shuffle(rand, arr) {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randInt(rand, 0, i)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Every company gets 1-4 climbers, uneven on purpose so the graph looks
// organic rather than combed. Baseline of 1 per company (so none are
// orphaned), then the remaining climbers are handed out at random —
// capped at 4 — and the resulting per-climber list is shuffled so company
// membership doesn't just track roster order.
function buildCompanyAssignments(climberCount) {
  const rand = mulberry32(555)
  const counts = companies.map(() => 1)
  let remaining = climberCount - companies.length
  while (remaining > 0) {
    const idx = randInt(rand, 0, companies.length - 1)
    if (counts[idx] < 4) {
      counts[idx]++
      remaining--
    }
  }
  const assignments = []
  companies.forEach((c, i) => {
    for (let k = 0; k < counts[i]; k++) assignments.push(c.id)
  })
  return shuffle(mulberry32(556), assignments)
}

const companyAssignments = buildCompanyAssignments(ROSTER.length)

export const climbers = ROSTER.map(([name, ethnicity, from], index) => {
  const rand = mulberry32(index)
  const anomaly = ANOMALY_INDICES.has(index)

  const dob = buildDob(rand)
  const mountainsClimbed = randInt(rand, 1, 14)
  const currentPosition = POSITIONS[randInt(rand, 0, POSITIONS.length - 1)]
  const ambientPressure_hPa = Math.round(PRESSURE_BY_POSITION[currentPosition] + (rand() * 8 - 4))
  const timeToEBC = buildTimeToEbc(rand)
  const restingHr = randInt(rand, 48, 62)
  const baseHr = anomaly ? randInt(rand, 118, 142) : randInt(rand, 72, 104)
  const baseSpO2 = anomaly ? randInt(rand, 68, 79) : randInt(rand, 84, 93)
  const bloodPressure = {
    systolic: randInt(rand, 105, 135),
    diastolic: randInt(rand, 65, 85),
  }

  const climber = {
    id: `climber-${String(index + 1).padStart(2, '0')}`,
    name,
    companyId: companyAssignments[index],
    ethnicity,
    from,
    dob,
    mountainsClimbed,
    currentPosition,
    ambientPressure_hPa,
    timeToEBC,
    restingHr,
    baseHr,
    baseSpO2,
    bloodPressure,
    anomaly,
  }

  if (anomaly) {
    climber.anomalyReason = ANOMALY_REASONS[randInt(rand, 0, ANOMALY_REASONS.length - 1)]
  }

  return climber
})
