import { z } from "zod"

const seriesPointSchema = z.object({ t: z.string(), v: z.number() })

const readingSchema = z.object({
  sensor_id: z.string(),
  machine_id: z.string().nullable(),
  channel: z.string(),
  unit: z.string(),
  value: z.number(),
  baseline: z.number(),
  deviation_sigma: z.number(),
  quality: z.string(),
  quality_reason: z.string().nullable(),
  status: z.string(),
  series: z.array(seriesPointSchema),
})

export const snapshotResponseSchema = z.object({
  as_of: z.string(),
  tick: z.number(),
  tick_seconds: z.number(),
  next_at: z.string(),
  window_seconds: z.number(),
  readings: z.array(readingSchema),
  sources: z.array(
    z.object({
      source_file: z.string(),
      last_sync_at: z.string().nullable(),
      age_seconds: z.number().nullable(),
      records: z.number(),
      failed: z.number(),
      degraded: z.boolean(),
    })
  ),
  counters: z.object({
    sensors_reporting: z.number(),
    sensors_stale: z.number(),
    sensors_suspect: z.number(),
    machines_monitored: z.number(),
  }),
})

export const channelsResponseSchema = z.array(
  z.object({
    channel: z.string(),
    unit: z.string(),
    sensor_count: z.number(),
    nominal_min: z.number(),
    nominal_max: z.number(),
  })
)
