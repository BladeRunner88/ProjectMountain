import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchSnapshot } from "@/features/telemetry"
import type { Snapshot } from "@/features/telemetry"

import { BUFFER_SIZE, createReadingsStore } from "./readingsStore"

vi.mock("@/features/telemetry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/telemetry")>()
  return { ...actual, fetchSnapshot: vi.fn() }
})

const mockedFetch = vi.mocked(fetchSnapshot)

function reading(
  channel: string,
  value: number,
  baseline: number,
  points: number
) {
  return {
    sensorId: `sensor:${channel}`,
    machineId: "machine-1",
    channel,
    unit: "x",
    value,
    baseline,
    deviationSigma: 0,
    quality: "good",
    qualityReason: null,
    status: "healthy",
    series: Array.from({ length: points }, (_, i) => ({
      t: new Date(i * 5000).toISOString(),
      v: value + i * 0.1,
    })),
  }
}

function frame(points = BUFFER_SIZE): Snapshot {
  return {
    asOf: "2026-07-01T12:00:00Z",
    tick: 1782907200,
    tickSeconds: 5,
    nextAt: "2026-07-01T12:00:05Z",
    windowSeconds: points * 5,
    readings: [
      reading("oee_pct", 78, 78, points),
      reading("vibration_mm_s", 2.4, 2.4, points),
      reading("pressure_bar", 6.21, 6.2, points),
      reading("return_pressure_bar", 1.83, 1.8, points),
    ],
    sources: [
      {
        sourceFile: "scada_historian.xml",
        lastSyncAt: null,
        ageSeconds: 120,
        records: 46373,
        failed: 0,
        degraded: false,
      },
    ],
    counters: {
      sensorsReporting: 4,
      sensorsStale: 0,
      sensorsSuspect: 0,
      machinesMonitored: 1,
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mockedFetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("readingsStore", () => {
  it("is empty and unloaded before any frame arrives", () => {
    const store = createReadingsStore()

    expect(store.getSnapshot().machineId).toBeNull()
    expect(store.getSnapshot().loaded).toBe(false)
  })

  it("fills its buffers from the snapshot series", async () => {
    mockedFetch.mockResolvedValue(frame())
    const store = createReadingsStore()

    store.setActiveMachine("machine-1", "nominal")
    await vi.waitFor(() => expect(store.getSnapshot().loaded).toBe(true))

    expect(store.getSnapshot().oee).toHaveLength(BUFFER_SIZE)
    expect(store.getSnapshot().vibration).toHaveLength(BUFFER_SIZE)
  })

  it("takes its baselines from the reading rather than inventing them", async () => {
    mockedFetch.mockResolvedValue(frame())
    const store = createReadingsStore()

    store.setActiveMachine("machine-1", "nominal")
    await vi.waitFor(() => expect(store.getSnapshot().loaded).toBe(true))

    expect(store.getSnapshot().oeeBaseline).toBe(78)
    expect(store.getSnapshot().hrBaseline).toBe(2)
  })

  it("reads supply and return pressure as two separate measured channels", async () => {
    mockedFetch.mockResolvedValue(frame())
    const store = createReadingsStore()

    store.setActiveMachine("machine-1", "nominal")
    await vi.waitFor(() => expect(store.getSnapshot().loaded).toBe(true))

    expect(store.getSnapshot().supplyBar).toBe(6.21)
    expect(store.getSnapshot().returnBar).toBe(1.83)
  })

  it("reports how stale the feed behind the readings is", async () => {
    mockedFetch.mockResolvedValue(frame())
    const store = createReadingsStore()

    store.setActiveMachine("machine-1", "nominal")
    await vi.waitFor(() => expect(store.getSnapshot().loaded).toBe(true))

    expect(store.getSnapshot().fixAgeMinutes).toBe(2)
  })

  it("notifies subscribers when a frame lands", async () => {
    mockedFetch.mockResolvedValue(frame())
    const store = createReadingsStore()
    const seen = vi.fn()
    store.subscribe(seen)

    store.setActiveMachine("machine-1", "nominal")
    await vi.waitFor(() => expect(store.getSnapshot().loaded).toBe(true))

    expect(seen).toHaveBeenCalled()
  })

  it("keeps the last good frame when a poll fails", async () => {
    mockedFetch.mockResolvedValueOnce(frame())
    const store = createReadingsStore()
    store.setActiveMachine("machine-1", "nominal")
    await vi.waitFor(() => expect(store.getSnapshot().loaded).toBe(true))
    const good = store.getSnapshot().oee

    // Blanking the panel on a transient failure is worse than showing the
    // previous frame for one tick.
    mockedFetch.mockRejectedValueOnce(new Error("network"))
    await vi.advanceTimersByTimeAsync(5000)

    expect(store.getSnapshot().oee).toEqual(good)
    expect(store.getSnapshot().loaded).toBe(true)
  })

  it("clears and stops polling when the selection is cleared", async () => {
    mockedFetch.mockResolvedValue(frame())
    const store = createReadingsStore()
    store.setActiveMachine("machine-1", "nominal")
    await vi.waitFor(() => expect(store.getSnapshot().loaded).toBe(true))

    store.setActiveMachine(null, "nominal")
    const callsAfterStop = mockedFetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(20000)

    expect(store.getSnapshot().machineId).toBeNull()
    expect(mockedFetch.mock.calls).toHaveLength(callsAfterStop)
  })

  it("asks only for the channels the panel draws", async () => {
    mockedFetch.mockResolvedValue(frame())
    const store = createReadingsStore()

    store.setActiveMachine("machine-1", "nominal")
    await vi.waitFor(() => expect(store.getSnapshot().loaded).toBe(true))

    expect(mockedFetch.mock.calls[0]?.[0]?.channels).toEqual([
      "oee_pct",
      "vibration_mm_s",
      "pressure_bar",
      "return_pressure_bar",
    ])
  })
})
