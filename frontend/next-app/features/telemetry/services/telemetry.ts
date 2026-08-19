import type { AxiosRequestConfig } from "axios"

import { ApiError, apiGet, isAccessRequiredError } from "@/lib/axios"

import {
  channelsResponseSchema,
  snapshotResponseSchema,
} from "../schemas/telemetry"
import type { Channel, Snapshot } from "../types/telemetry"

export interface SnapshotQuery {
  /** History per channel, in seconds. 0 asks for the instant only. */
  windowSeconds?: number
  /** Repeatable channel filter. Omit for every channel. */
  channels?: string[]
  limit?: number
}

export async function fetchSnapshot(
  query: SnapshotQuery = {},
  config?: AxiosRequestConfig
): Promise<Snapshot> {
  const params = new URLSearchParams()
  if (query.windowSeconds !== undefined)
    params.set("window_seconds", String(query.windowSeconds))
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  for (const channel of query.channels ?? []) params.append("channel", channel)

  const data = await apiGet<unknown>(
    `/telemetry/snapshot?${params.toString()}`,
    config
  )
  const parsed = snapshotResponseSchema.safeParse(data)
  if (!parsed.success) throw new ApiError(0, "Unexpected telemetry snapshot")

  return {
    asOf: parsed.data.as_of,
    tick: parsed.data.tick,
    tickSeconds: parsed.data.tick_seconds,
    nextAt: parsed.data.next_at,
    windowSeconds: parsed.data.window_seconds,
    readings: parsed.data.readings.map((reading) => ({
      sensorId: reading.sensor_id,
      machineId: reading.machine_id,
      channel: reading.channel,
      unit: reading.unit,
      value: reading.value,
      baseline: reading.baseline,
      deviationSigma: reading.deviation_sigma,
      quality: reading.quality,
      qualityReason: reading.quality_reason,
      status: reading.status,
      series: reading.series,
    })),
    sources: parsed.data.sources.map((source) => ({
      sourceFile: source.source_file,
      lastSyncAt: source.last_sync_at,
      ageSeconds: source.age_seconds,
      records: source.records,
      failed: source.failed,
      degraded: source.degraded,
    })),
    counters: {
      sensorsReporting: parsed.data.counters.sensors_reporting,
      sensorsStale: parsed.data.counters.sensors_stale,
      sensorsSuspect: parsed.data.counters.sensors_suspect,
      machinesMonitored: parsed.data.counters.machines_monitored,
    },
  }
}

export async function fetchChannels(
  config?: AxiosRequestConfig
): Promise<Channel[]> {
  const data = await apiGet<unknown>("/telemetry/channels", config)
  const parsed = channelsResponseSchema.safeParse(data)
  if (!parsed.success) throw new ApiError(0, "Unexpected telemetry channels")

  return parsed.data.map((channel) => ({
    channel: channel.channel,
    unit: channel.unit,
    sensorCount: channel.sensor_count,
    nominalMin: channel.nominal_min,
    nominalMax: channel.nominal_max,
  }))
}

export function describeTelemetryError(
  error: unknown,
  fallback: string
): string {
  if (isAccessRequiredError(error)) {
    return "Your access to Isildur has expired. Request access to continue."
  }
  if (error instanceof ApiError && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
