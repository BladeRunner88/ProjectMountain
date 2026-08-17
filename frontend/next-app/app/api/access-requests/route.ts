import type { NextRequest } from "next/server"

import { proxyPost } from "@/lib/server/backend"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return Response.json(
      { detail: "Expected a JSON request body." },
      { status: 415 }
    )
  }

  let body: string
  try {
    // Re-serialise rather than streaming the raw body through, so a malformed
    // payload fails here with a 400 instead of confusing the backend.
    const parsed: unknown = await request.json()
    body = JSON.stringify(parsed)
  } catch {
    return Response.json(
      { detail: "Request body was not valid JSON." },
      { status: 400 }
    )
  }

  return proxyPost("/access-requests", body, { signal: request.signal })
}
