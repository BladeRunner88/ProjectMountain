import type { NextRequest } from "next/server"

import { pickSearchParams, proxyGet } from "@/lib/server/backend"

export const dynamic = "force-dynamic"

const ALLOWED_PARAMS = ["market"] as const

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
): Promise<Response> {
  const { name } = await context.params
  return proxyGet(`/metrics/${encodeURIComponent(name)}`, {
    search: pickSearchParams(request.nextUrl.searchParams, ALLOWED_PARAMS),
    signal: request.signal,
  })
}
