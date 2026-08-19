/**
 * A world fixture sized for the graph tests.
 *
 * The Control Room's fixture is deliberately tiny; the graph asserts on
 * spread, clustering and anomaly distribution, which need a realistic number
 * of machines to mean anything. Same shape, more of it.
 */

import { testWorld, type TestWorldOptions } from "@/features/ase/testing/world"
import type { AseWorld } from "@/features/ase/types/world"

export const GRAPH_TEST_MACHINE_COUNT = 50
export const GRAPH_TEST_SENSORS_PER_MACHINE = 2

export function graphTestWorld(options: TestWorldOptions = {}): AseWorld {
  return testWorld({
    machineCount: options.machineCount ?? GRAPH_TEST_MACHINE_COUNT,
    sensorsPerMachine:
      options.sensorsPerMachine ?? GRAPH_TEST_SENSORS_PER_MACHINE,
  })
}
