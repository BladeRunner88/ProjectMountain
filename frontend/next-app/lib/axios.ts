import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios"

/** `code` set on an ApiError raised by an unauthenticated response. */
export const ACCESS_REQUIRED_CODE = "access_required"

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: unknown
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * True when the backend rejected the request for want of access. Callers decide
 * what to do about it (show a prompt, link to /request-access, …) — the
 * transport layer deliberately does not navigate on the user's behalf.
 */
export function isAccessRequiredError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * The backend returns bare JSON (no `{ success, data }` envelope). Errors come
 * back as FastAPI's `{ detail }`, either a string or a list of validation
 * issues, so that is what we dig through for a human-readable message.
 */
function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.length > 0) return body
  if (!isRecord(body)) return fallback
  if (typeof body.message === "string" && body.message.length > 0) {
    return body.message
  }
  if (typeof body.detail === "string" && body.detail.length > 0) {
    return body.detail
  }
  if (Array.isArray(body.detail) && body.detail.length > 0) {
    const first: unknown = body.detail[0]
    if (isRecord(first) && typeof first.msg === "string") return first.msg
  }
  return fallback
}

/**
 * Same-origin base path. Requests go to this app's Route Handlers under
 * `/api/*`, which proxy to FastAPI server-side — the backend origin is never
 * exposed to the browser.
 */
export const API_BASE_PATH = "/api"

export function getApiBaseUrl(): string {
  return API_BASE_PATH
}

export const api: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
})

api.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => response,
  (error: unknown): Promise<never> => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error)
    }

    const status = error.response?.status ?? 0
    const body: unknown = error.response?.data
    const fallback =
      status > 0
        ? `Request failed with status ${status}`
        : "Network request failed"
    const message = messageFromBody(body, error.message || fallback)
    const code = status === 401 ? ACCESS_REQUIRED_CODE : undefined
    return Promise.reject(new ApiError(status, message, code, body))
  }
)

export async function apiGet<T>(
  path: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await api.get<T>(path, config)
  return response.data
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await api.post<T>(path, body, config)
  return response.data
}
