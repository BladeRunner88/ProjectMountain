import type { NextRequest } from "next/server"

import { proxyGet } from "@/lib/server/backend"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params
  return proxyGet(`/objects/${encodeURIComponent(id)}`, {
    signal: request.signal,
  })
}
