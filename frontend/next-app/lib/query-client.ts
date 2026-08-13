import { QueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/axios"

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error): boolean => {
          if (isUnauthorized(error)) return false
          return failureCount < 2
        },
      },
      mutations: {
        retry: (failureCount, error): boolean => {
          if (isUnauthorized(error)) return false
          return failureCount < 1
        },
      },
    },
  })
}
