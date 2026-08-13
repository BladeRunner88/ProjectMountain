import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios"

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

type ApiSuccessEnvelope = {
  success: true
  data: unknown
}

type ApiErrorEnvelope = {
  success: false
  error: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isSuccessEnvelope(value: unknown): value is ApiSuccessEnvelope {
  return isRecord(value) && value.success === true && "data" in value
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return isRecord(value) && value.success === false && "error" in value
}

function parseEnvelopeError(error: unknown): {
  message: string
  code?: string
  details?: unknown
} {
  if (typeof error === "string" && error.length > 0) {
    return { message: error }
  }
  if (isRecord(error)) {
    const message =
      typeof error.message === "string" && error.message.length > 0
        ? error.message
        : "Request failed"
    const code = typeof error.code === "string" ? error.code : undefined
    return { message, code, details: error.details ?? error }
  }
  return { message: "Request failed", details: error }
}

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

function redirectToRequestAccess(): void {
  if (typeof window === "undefined") return
  window.location.assign("/request-access")
}

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010"
}

export const api: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
})

api.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    const body: unknown = response.data
    if (isErrorEnvelope(body)) {
      const parsed = parseEnvelopeError(body.error)
      throw new ApiError(
        response.status,
        parsed.message,
        parsed.code,
        parsed.details
      )
    }
    if (isSuccessEnvelope(body)) {
      response.data = body.data
    }
    return response
  },
  (error: unknown): Promise<never> => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error)
    }

    const status = error.response?.status ?? 0
    if (status === 401) {
      redirectToRequestAccess()
    }

    const body: unknown = error.response?.data
    if (isErrorEnvelope(body)) {
      const parsed = parseEnvelopeError(body.error)
      return Promise.reject(
        new ApiError(status, parsed.message, parsed.code, parsed.details)
      )
    }

    const fallback =
      status > 0
        ? `Request failed with status ${status}`
        : "Network request failed"
    const message = messageFromBody(body, error.message || fallback)
    return Promise.reject(new ApiError(status, message, undefined, body))
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
