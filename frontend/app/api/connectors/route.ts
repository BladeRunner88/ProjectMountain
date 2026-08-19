import type { NextRequest } from "next/server"

import { proxyGet } from "@/lib/server/backend"

export const dynamic = "force-dynamic"

export function GET(request: NextRequest): Promise<Response> {
  return proxyGet("/connectors", { signal: request.signal })
}
