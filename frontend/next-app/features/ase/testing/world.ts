/**
 * A world fixture for tests.
 *
 * Mirrors the shape `/sources`, `/pipeline/stages`, `/hierarchy` and
 * `/ontology` actually return, so a test exercises the same code path the
 * browser does. The values are small and fixed rather than generated — a test
 * that has to reason about randomly generated input is testing the generator.
 *
 * Test scaffolding only. Nothing here is served to anyone.
 */

import type {
  AseWorld,
  WorldNode,
  WorldSource,
  WorldStage,
} from "../types/world"

const SOURCES: WorldSource[] = [
  source(
    "mes_platform.json",
    "Plant MES",
    "json",
    "asset register, production runs",
    5551,
    0
  ),
  source(
    "scada_historian.xml",
    "OT historian",
    "xml",
    "part catalogue, machine cycles",
    46373,
    0
  ),
  source("qc_inline.csv", "Inline QC", "csv", "batch dispositions", 10000, 0),
  // The one feed with genuinely unparseable rows, so the degraded path is covered.
  source("qc_lab.csv", "Metrology lab", "csv", "batch dispositions", 8000, 18),
  source("maintenance_plan.xlsx", "CMMS", "xlsx", "work orders", 2200, 0),
  source(
    "contractor_service.csv",
    "Service contractor",
    "csv",
    "callouts",
    260,
    0
  ),
]

const STAGES: WorldStage[] = [
  stage(1, "Generate", "Synthesizes the six vendor exports.", null),
  stage(
    2,
    "Ingest and normalise",
    "Maps every feed onto one vocabulary.",
    72384
  ),
  stage(3, "Resolve", "Groups records describing the same machine.", null),
  stage(4, "Findings", "Computes cross-source discrepancies.", 8),
]

export interface TestWorldOptions {
  machineCount?: number
  sensorsPerMachine?: number
}

export function testWorld(options: TestWorldOptions = {}): AseWorld {
  const machineCount = options.machineCount ?? 6
  const sensorsPerMachine = options.sensorsPerMachine ?? 2

  return {
    sources: SOURCES,
    stages: STAGES,
    nodes: buildNodes(machineCount, sensorsPerMachine),
    operators: [
      { id: "operator_0001", name: "A. Baumann" },
      { id: "operator_0002", name: "C. Novak" },
      { id: "operator_0003", name: "M. Ortiz" },
    ],
    ontology: {
      objectTypes: [
        {
          name: "Machine",
          properties: ["name", "plant", "commissioned_at"],
          instanceCount: machineCount,
        },
        {
          name: "Plant",
          properties: ["name", "country", "timezone", "unit_system"],
          instanceCount: 2,
        },
        {
          name: "Sensor",
          properties: ["channel", "unit"],
          instanceCount: machineCount * sensorsPerMachine,
        },
      ],
      relationshipTypes: [
        {
          name: "INSTALLED_ON",
          source: "Machine",
          target: "ProductionLine",
          instanceCount: machineCount,
        },
        {
          name: "MOUNTED_ON",
          source: "Sensor",
          target: "Machine",
          instanceCount: machineCount * sensorsPerMachine,
        },
      ],
    },
  }
}

const PLANTS: ReadonlyArray<readonly [string, string]> = [
  ["Stuttgart", "Germany"],
  ["Brno", "Czechia"],
  ["Monterrey", "Mexico"],
  ["Coventry", "United Kingdom"],
  ["Gothenburg", "Sweden"],
  ["Windsor", "Canada"],
]

const LINE_NAMES = [
  "Body-in-white A",
  "Body-in-white B",
  "Powertrain machining",
  "Gearbox assembly",
  "Press shop 1",
  "Press shop 2",
  "Weld cell north",
  "Weld cell south",
  "Paint prep",
  "Final assembly",
  "Subassembly cell",
  "Machining centre 4",
  "Heat treatment",
  "Packing and dispatch",
]

/** Mirrors the real warehouse's proportions, so spread assertions mean something. */
function buildNodes(
  machineCount: number,
  sensorsPerMachine: number
): WorldNode[] {
  const nodes: WorldNode[] = []

  for (const [, country] of PLANTS) {
    const countryId = `country:${country}`
    if (!nodes.some((n) => n.id === countryId)) {
      nodes.push(node(countryId, "country", country, null, { country }))
    }
  }

  const plantIds = PLANTS.map(([plantName, country], index) => {
    const id = `plant_${String(index + 1).padStart(2, "0")}`
    nodes.push(
      node(id, "plant", plantName, `country:${country}`, {
        plant: plantName,
        country,
      })
    )
    return id
  })

  const lineIds = LINE_NAMES.map((name, index) => {
    const id = `line_${String(index + 1).padStart(3, "0")}`
    const plantIndex = index % plantIds.length
    nodes.push(
      node(id, "line", name, plantIds[plantIndex], {
        plant: PLANTS[plantIndex][0],
      })
    )
    return id
  })

  for (let index = 0; index < machineCount; index++) {
    const lineIndex = index % lineIds.length
    const plantName = PLANTS[lineIndex % PLANTS.length][0]
    const machineId = `machine_${String(index + 1).padStart(5, "0")}`
    const prefix = LINE_NAMES[lineIndex].split(" ")[0].slice(0, 3).toUpperCase()
    nodes.push(
      node(
        machineId,
        "machine",
        `${prefix}-${String(index + 1).padStart(4, "0")}`,
        lineIds[lineIndex],
        {
          plant: plantName,
        }
      )
    )

    for (let channel = 0; channel < sensorsPerMachine; channel++) {
      nodes.push(
        node(
          `${machineId}:channel_${channel}`,
          "sensor",
          `${machineId}:channel_${channel}`,
          machineId,
          { plant: plantName }
        )
      )
    }
  }
  return nodes
}

function source(
  sourceFile: string,
  owner: string,
  format: string,
  describes: string,
  records: number,
  failed: number
): WorldSource {
  const offered = records + failed
  return {
    sourceFile,
    owner,
    department: owner,
    format,
    describes,
    reliability: offered === 0 ? 0 : records / offered,
    records,
    failed,
    degraded: failed > 0,
    lastSyncAt: "2026-08-18T09:33:03+00:00",
  }
}

function stage(
  order: number,
  name: string,
  description: string,
  records: number | null
): WorldStage {
  return {
    order,
    name,
    description,
    state: "ok",
    lastRunAt: "2026-08-18T09:33:20+00:00",
    durationSeconds: 1.5,
    records,
  }
}

function node(
  id: string,
  tier: string,
  label: string,
  parentId: string | null,
  extra: { plant?: string; country?: string } = {}
): WorldNode {
  return {
    id,
    tier,
    label,
    parentId,
    plant: extra.plant ?? null,
    country: extra.country ?? null,
    status: "nominal",
    childCount: 0,
    descendantMachines: 0,
  }
}
