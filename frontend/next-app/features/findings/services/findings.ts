import type { AxiosRequestConfig } from "axios"

import { ApiError, apiGet, isAccessRequiredError } from "@/lib/axios"

import { findingsSchema } from "../schemas/finding"
import type { Finding } from "../types/finding"

export async function listFindings(
  config?: AxiosRequestConfig
): Promise<Finding[]> {
  const data = await apiGet<unknown>("/findings", config)
  const parsed = findingsSchema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError(0, "Unexpected findings response")
  }
  return parsed.data
}

export function describeFindingsError(
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
