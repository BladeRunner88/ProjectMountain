"use client"

import { useMutation, type UseMutationResult } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"

import { postAccessRequest } from "../services/access-request"
import type {
  AccessRequestPayload,
  AccessRequestResponse,
} from "../types/access-request"

export function useRequestAccess(): UseMutationResult<
  AccessRequestResponse,
  Error,
  AccessRequestPayload
> {
  return useMutation({
    mutationKey: queryKeys.accessRequests.all,
    mutationFn: postAccessRequest,
  })
}
