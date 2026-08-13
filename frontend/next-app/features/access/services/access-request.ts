import { api, ApiError } from "@/lib/axios"

import type {
  AccessRequestPayload,
  AccessRequestResponse,
} from "../types/access-request"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isAccessRequestResponse(
  value: unknown
): value is AccessRequestResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.submitted_at === "string"
  )
}

export async function postAccessRequest(
  payload: AccessRequestPayload
): Promise<AccessRequestResponse> {
  const response = await api.post<AccessRequestResponse>(
    "/access-requests",
    payload
  )
  const data: unknown = response.data
  if (!isAccessRequestResponse(data)) {
    throw new ApiError(0, "Unexpected access-request response")
  }
  return data
}

export function describeAccessRequestError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422) {
      return "The server rejected some of the submitted information. Please review your answers and try again."
    }
    if (err.status >= 500) {
      return "The server hit an error processing your request. Please try again in a moment."
    }
    if (err.status > 0) {
      return `Your request could not be submitted (error ${err.status}). Please try again.`
    }
    return "Could not reach the server. Check your connection and try again."
  }
  return "Could not reach the server. Check your connection and try again."
}
