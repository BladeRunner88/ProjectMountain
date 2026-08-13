import type { Climber } from '../types/domain'
import { companies } from './topology'

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

const ROSTER: ReadonlyArray<readonly [string, string, string]> = [
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

const ANOMALY_INDICES = new Set([3, 7, 12, 19, 22])

const POSITIONS = ['Base Camp', 'Camp I', 'Camp II', 'Camp III', 'Camp IV', 'Summit push'] as const
type Position = (typeof POSITIONS)[number]

const PRESSURE_BY_POSITION: Record<Position, number> = {
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
] as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function buildDob(rand: () => number): string {
  const year = randInt(rand, 1972, 2001)
  const month = randInt(rand, 0, 11)
  const day = randInt(rand, 1, 28)
  return `${String(day).padStart(2, '0')} ${MONTHS[month]} ${year}`
}

function buildTimeToEbc(rand: () => number): string {
  const days = randInt(rand, 6, 12)
  const hours = randInt(rand, 0, 23)
  return `${days}d ${String(hours).padStart(2, '0')}h`
}

function shuffle<T>(rand: () => number, arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randInt(rand, 0, i)
    const a = result[i]
    const b = result[j]
    if (a === undefined || b === undefined) continue
    result[i] = b
    result[j] = a
  }
  return result
}

function buildCompanyAssignments(climberCount: number): string[] {
  const rand = mulberry32(555)
  const counts = companies.map(() => 1)
  let remaining = climberCount - companies.length
  while (remaining > 0) {
    const idx = randInt(rand, 0, companies.length - 1)
    const current = counts[idx]
    if (current !== undefined && current < 4) {
      counts[idx] = current + 1
      remaining--
    }
  }
  const assignments: string[] = []
  companies.forEach((c, i) => {
    const n = counts[i] ?? 0
    for (let k = 0; k < n; k++) assignments.push(c.id)
  })
  return shuffle(mulberry32(556), assignments)
}

const companyAssignments = buildCompanyAssignments(ROSTER.length)

export const climbers: Climber[] = ROSTER.map(([name, ethnicity, from], index) => {
  const rand = mulberry32(index)
  const anomaly = ANOMALY_INDICES.has(index)

  const dob = buildDob(rand)
  const mountainsClimbed = randInt(rand, 1, 14)
  const positionIndex = randInt(rand, 0, POSITIONS.length - 1)
  const currentPosition: Position = POSITIONS[positionIndex] ?? 'Base Camp'
  const ambientPressure_hPa = Math.round(PRESSURE_BY_POSITION[currentPosition] + (rand() * 8 - 4))
  const timeToEBC = buildTimeToEbc(rand)
  const restingHr = randInt(rand, 48, 62)
  const baseHr = anomaly ? randInt(rand, 118, 142) : randInt(rand, 72, 104)
  const baseSpO2 = anomaly ? randInt(rand, 68, 79) : randInt(rand, 84, 93)
  const bloodPressure = {
    systolic: randInt(rand, 105, 135),
    diastolic: randInt(rand, 65, 85),
  }

  const companyId = companyAssignments[index]
  if (companyId === undefined) {
    throw new Error(`Missing company assignment for climber index ${index}`)
  }

  const climber: Climber = {
    id: `climber-${String(index + 1).padStart(2, '0')}`,
    name,
    companyId,
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
