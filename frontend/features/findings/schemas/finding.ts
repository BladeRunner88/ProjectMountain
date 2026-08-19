import { z } from "zod"

import type { Finding } from "../types/finding"

const findingWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
})

const findingEntitySchema = z.object({
  type: z.string(),
  name: z.string(),
})

/**
 * `computed` and `evidence` are deliberately unconstrained: their shape is
 * per finding type, and pinning it here would mean editing the frontend every
 * time the backend learns to detect something new.
 */
export const findingSchema: z.ZodType<Finding> = z.object({
  id: z.string(),
  finding_type: z.string(),
  title: z.string(),
  description: z.string(),
  sources: z.array(z.string()),
  computed: z.record(z.string(), z.unknown()),
  window: findingWindowSchema,
  entities: z.array(findingEntitySchema),
  reviewer_status: z.string(),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  evidence: z.record(z.string(), z.unknown()),
})

export const findingsSchema = z.array(findingSchema)
