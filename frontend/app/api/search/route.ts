import type { NextRequest } from "next/server"

import { pickSearchParams, proxyGet } from "@/lib/server/backend"

export const dynamic = "force-dynamic"

const ALLOWED_PARAMS = ["q"] as const

export function GET(request: NextRequest): Promise<Response> {
  return proxyGet("/search", {
    search: pickSearchParams(request.nextUrl.searchParams, ALLOWED_PARAMS),
    signal: request.signal,
  })
}
