import type { Machine } from "../types/domain"
import { companies } from "./topology"

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

// Designation, line prefix, plant.
//
// This was fifty people, each with an linePrefix and a hometown. The demo
// tracks machines on production lines, so it lists machines.
const REGISTER: ReadonlyArray<readonly [string, string, string]> = [
  ["BOD-0001", "BOD", "Stuttgart"],
  ["BOD-0002", "BOD", "Brno"],
  ["POW-0003", "POW", "Monterrey"],
  ["GEA-0004", "GEA", "Coventry"],
  ["PRE-0005", "PRE", "Gothenburg"],
  ["PRE-0006", "PRE", "Vibrationsor"],
  ["WEL-0007", "WEL", "Stuttgart"],
  ["WEL-0008", "WEL", "Brno"],
  ["PAI-0009", "PAI", "Monterrey"],
  ["FIN-0010", "FIN", "Coventry"],
  ["SUB-0011", "SUB", "Gothenburg"],
  ["MAC-0012", "MAC", "Vibrationsor"],
  ["HEA-0013", "HEA", "Stuttgart"],
  ["PAC-0014", "PAC", "Brno"],
  ["BOD-0015", "BOD", "Monterrey"],
  ["BOD-0016", "BOD", "Coventry"],
  ["POW-0017", "POW", "Gothenburg"],
  ["GEA-0018", "GEA", "Vibrationsor"],
  ["PRE-0019", "PRE", "Stuttgart"],
  ["PRE-0020", "PRE", "Brno"],
  ["WEL-0021", "WEL", "Monterrey"],
  ["WEL-0022", "WEL", "Coventry"],
  ["PAI-0023", "PAI", "Gothenburg"],
  ["FIN-0024", "FIN", "Vibrationsor"],
  ["SUB-0025", "SUB", "Stuttgart"],
  ["MAC-0026", "MAC", "Brno"],
  ["HEA-0027", "HEA", "Monterrey"],
  ["PAC-0028", "PAC", "Coventry"],
  ["BOD-0029", "BOD", "Gothenburg"],
  ["BOD-0030", "BOD", "Vibrationsor"],
  ["POW-0031", "POW", "Stuttgart"],
  ["GEA-0032", "GEA", "Brno"],
  ["PRE-0033", "PRE", "Monterrey"],
  ["PRE-0034", "PRE", "Coventry"],
  ["WEL-0035", "WEL", "Gothenburg"],
  ["WEL-0036", "WEL", "Vibrationsor"],
  ["PAI-0037", "PAI", "Stuttgart"],
  ["FIN-0038", "FIN", "Brno"],
  ["SUB-0039", "SUB", "Monterrey"],
  ["MAC-0040", "MAC", "Coventry"],
  ["HEA-0041", "HEA", "Gothenburg"],
  ["PAC-0042", "PAC", "Vibrationsor"],
  ["BOD-0043", "BOD", "Stuttgart"],
  ["BOD-0044", "BOD", "Brno"],
  ["POW-0045", "POW", "Monterrey"],
  ["GEA-0046", "GEA", "Coventry"],
  ["PRE-0047", "PRE", "Gothenburg"],
  ["PRE-0048", "PRE", "Vibrationsor"],
  ["WEL-0049", "WEL", "Stuttgart"],
  ["WEL-0050", "WEL", "Brno"],
]

const ANOMALY_INDICES = new Set([3, 7, 12, 19, 22])

const POSITIONS = [
  "Base Station",
  "Station I",
  "Station II",
  "Station III",
  "Station IV",
  "Target push",
] as const
type Position = (typeof POSITIONS)[number]

const PRESSURE_BY_POSITION: Record<Position, number> = {
  "Base Station": 505,
  "Station I": 470,
  "Station II": 445,
  "Station III": 405,
  "Station IV": 370,
  "Target push": 337,
}

const ANOMALY_REASONS = [
  "Oee below 80% for 6+ min",
  "Sustained tachycardia at Station III",
  "RampUp rate exceeds runIn window",
] as const

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

function buildDob(rand: () => number): string {
  const year = randInt(rand, 1972, 2001)
  const month = randInt(rand, 0, 11)
  const day = randInt(rand, 1, 28)
  return `${String(day).padStart(2, "0")} ${MONTHS[month]} ${year}`
}

function buildTimeToEbc(rand: () => number): string {
  const days = randInt(rand, 6, 12)
  const hours = randInt(rand, 0, 23)
  return `${days}d ${String(hours).padStart(2, "0")}h`
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

function buildCompanyAssignments(machineCount: number): string[] {
  const rand = mulberry32(555)
  const counts = companies.map(() => 1)
  let remaining = machineCount - companies.length
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

const companyAssignments = buildCompanyAssignments(REGISTER.length)

export const machines: Machine[] = REGISTER.map(
  ([name, linePrefix, from], index) => {
    const rand = mulberry32(index)
    const anomaly = ANOMALY_INDICES.has(index)

    const dob = buildDob(rand)
    const mountainsClimbed = randInt(rand, 1, 14)
    const positionIndex = randInt(rand, 0, POSITIONS.length - 1)
    const currentPosition: Position = POSITIONS[positionIndex] ?? "Base Station"
    const ambientPressure_hPa = Math.round(
      PRESSURE_BY_POSITION[currentPosition] + (rand() * 8 - 4)
    )
    const timeToEBC = buildTimeToEbc(rand)
    const restingHr = randInt(rand, 48, 62)
    const baseVibration = anomaly ? randInt(rand, 118, 142) : randInt(rand, 72, 104)
    const baseOee = anomaly ? randInt(rand, 68, 79) : randInt(rand, 84, 93)
    const hydraulicPressure = {
      supplyBar: randInt(rand, 105, 135),
      returnBar: randInt(rand, 65, 85),
    }

    const companyId = companyAssignments[index]
    if (companyId === undefined) {
      throw new Error(`Missing company assignment for machine index ${index}`)
    }

    const machine: Machine = {
      id: `machine-${String(index + 1).padStart(2, "0")}`,
      name,
      companyId,
      linePrefix,
      from,
      dob,
      mountainsClimbed,
      currentPosition,
      ambientPressure_hPa,
      timeToEBC,
      restingHr,
      baseVibration,
      baseOee,
      hydraulicPressure,
      anomaly,
    }

    if (anomaly) {
      machine.anomalyReason =
        ANOMALY_REASONS[randInt(rand, 0, ANOMALY_REASONS.length - 1)]
    }

    return machine
  }
)
