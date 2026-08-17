/**
 * Server-only helpers for talking to the FastAPI backend.
 *
 * The browser never talks to FastAPI directly: it calls the same-origin
 * Route Handlers under `/api/*`, which forward here. That keeps the backend
 * origin (and any future credentials) off the client and removes the need for
 * CORS.
 */

const DEFAULT_BACKEND_URL = "http://localhost:8010"
const BACKEND_TIMEOUT_MS = 30_000

/**
 * Resolve the FastAPI origin. `API_URL` is server-only and wins;
 * `NEXT_PUBLIC_API_URL` is honoured as a fallback so existing local setups
 * keep working, and finally the default dev port.
 */
export function getBackendBaseUrl(): string {
  const configured = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
  const trimmed = configured?.trim()
  const base = trimmed && trimmed.length > 0 ? trimmed : DEFAULT_BACKEND_URL
  return base.replace(/\/+$/, "")
}

export function buildBackendUrl(
  path: string,
  search?: URLSearchParams
): string {
  const url = new URL(`${getBackendBaseUrl()}${path}`)
  if (search) {
    for (const [key, value] of search.entries()) {
      url.searchParams.append(key, value)
    }
  }
  return url.toString()
}

/**
 * Copy only the query parameters the upstream endpoint understands, so client
 * input cannot smuggle arbitrary parameters into the backend.
 */
export function pickSearchParams(
  source: URLSearchParams,
  allowed: readonly string[]
): URLSearchParams {
  const picked = new URLSearchParams()
  for (const key of allowed) {
    for (const value of source.getAll(key)) {
      picked.append(key, value)
    }
  }
  return picked
}

export type ProxyOptions = {
  /** Query string to append to the upstream request. */
  search?: URLSearchParams
  /** Client abort signal, so a cancelled fetch cancels the upstream call. */
  signal?: AbortSignal
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(BACKEND_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function unreachable(path: string, reason: unknown): Response {
  console.error(`[api] upstream request to ${path} failed`, reason)
  return Response.json(
    { detail: "The backend service is unavailable." },
    { status: 502 }
  )
}

async function forward(
  path: string,
  init: RequestInit,
  options: ProxyOptions
): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(buildBackendUrl(path, options.search), {
      ...init,
      cache: "no-store",
      signal: withTimeout(options.signal),
    })
  } catch (reason) {
    return unreachable(path, reason)
  }

  // Read the body eagerly so the upstream connection is released, and so a
  // truncated payload surfaces here instead of mid-stream.
  let payload: string
  try {
    payload = await upstream.text()
  } catch (reason) {
    return unreachable(path, reason)
  }

  return new Response(payload.length > 0 ? payload : null, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  })
}

/** Forward a GET to the backend and mirror its status and JSON body. */
export function proxyGet(
  path: string,
  options: ProxyOptions = {}
): Promise<Response> {
  return forward(path, { method: "GET" }, options)
}

/** Forward a POST with a JSON body to the backend. */
export function proxyPost(
  path: string,
  body: string,
  options: ProxyOptions = {}
): Promise<Response> {
  return forward(
    path,
    { method: "POST", body, headers: { "content-type": "application/json" } },
    options
  )
}
