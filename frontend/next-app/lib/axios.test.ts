import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCESS_REQUIRED_CODE,
  API_BASE_PATH,
  ApiError,
  api,
  apiGet,
  apiPost,
  getApiBaseUrl,
  isAccessRequiredError,
} from "@/lib/axios"

const originalAdapter = api.defaults.adapter

/** Make every request resolve with the given status and body. */
function respondWith(status: number, data: unknown): void {
  const adapter: AxiosAdapter = (config) =>
    Promise.resolve({
      data,
      status,
      statusText: "OK",
      headers: {},
      config,
    } as AxiosResponse)
  api.defaults.adapter = adapter
}

/** Make every request fail the way axios fails on a non-2xx response. */
function failWith(
  status: number,
  data: unknown,
  message = "Request failed"
): void {
  const adapter: AxiosAdapter = (config) =>
    Promise.reject(
      new AxiosError(message, "ERR_BAD_RESPONSE", config, {}, {
        data,
        status,
        statusText: "Error",
        headers: {},
        config,
      } as AxiosResponse)
    )
  api.defaults.adapter = adapter
}

/** Make every request fail with no response at all, as on a network outage. */
function failWithoutResponse(message = "Network Error"): void {
  const adapter: AxiosAdapter = (config) =>
    Promise.reject(new AxiosError(message, AxiosError.ERR_NETWORK, config, {}))
  api.defaults.adapter = adapter
}

beforeEach(() => {
  api.defaults.adapter = originalAdapter
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
})

describe("ApiError", () => {
  it("is an Error carrying status, code and details", () => {
    const error = new ApiError(404, "Missing", "not_found", { id: 1 })
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.name).toBe("ApiError")
    expect(error.message).toBe("Missing")
    expect(error.status).toBe(404)
    expect(error.code).toBe("not_found")
    expect(error.details).toEqual({ id: 1 })
  })

  it("leaves code and details undefined when not supplied", () => {
    const error = new ApiError(500, "Boom")
    expect(error.code).toBeUndefined()
    expect(error.details).toBeUndefined()
  })
})

describe("getApiBaseUrl", () => {
  it("is the same-origin Route Handler path", () => {
    expect(getApiBaseUrl()).toBe(API_BASE_PATH)
    expect(getApiBaseUrl()).toBe("/api")
  })

  it("never exposes the backend origin to the browser", () => {
    // The backend URL is a server-only concern; the browser only ever sees
    // this app's own origin.
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com"
    expect(getApiBaseUrl()).toBe("/api")
    delete process.env.NEXT_PUBLIC_API_URL
  })

  it("is the instance's configured baseURL", () => {
    expect(api.defaults.baseURL).toBe(API_BASE_PATH)
  })
})

describe("successful responses", () => {
  // The backend returns bare JSON — there is no `{ success, data }` envelope
  // to unwrap, so every 2xx body reaches the caller untouched.
  it("returns an object body as-is", async () => {
    respondWith(200, { id: 7, name: "node" })
    await expect(apiGet("/things")).resolves.toEqual({ id: 7, name: "node" })
  })

  it("returns an array body as-is", async () => {
    respondWith(200, [1, 2, 3])
    await expect(apiGet("/things")).resolves.toEqual([1, 2, 3])
  })

  it("returns a null body as-is", async () => {
    respondWith(200, null)
    await expect(apiGet("/things")).resolves.toBeNull()
  })

  it("does not unwrap an envelope-shaped body", async () => {
    respondWith(200, { success: true, data: { id: 7 } })
    await expect(apiGet("/things")).resolves.toEqual({
      success: true,
      data: { id: 7 },
    })
  })

  it("returns POST bodies as-is", async () => {
    respondWith(200, { created: true })
    await expect(apiPost("/things", { name: "x" })).resolves.toEqual({
      created: true,
    })
  })
})

describe("response interceptor: failed requests", () => {
  it("keeps the status and body of a failure it cannot read a message from", async () => {
    failWith(422, { unexpected: "shape" }, "Request failed with status code 422")
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      message: "Request failed with status code 422",
      details: { unexpected: "shape" },
    })
    expect((error as ApiError).code).toBeUndefined()
  })

  it("reads a FastAPI string detail", async () => {
    failWith(400, { detail: "Bad request payload" })
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe("Bad request payload")
    expect((error as ApiError).status).toBe(400)
  })

  it("reads the first message of a FastAPI validation detail array", async () => {
    failWith(422, {
      detail: [{ msg: "field required", loc: ["body", "name"] }],
    })
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect((error as ApiError).message).toBe("field required")
  })

  it("prefers a message field over detail", async () => {
    failWith(500, { message: "Server exploded", detail: "ignored" })
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect((error as ApiError).message).toBe("Server exploded")
  })

  it("uses a string body as the message", async () => {
    failWith(503, "service unavailable")
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect((error as ApiError).message).toBe("service unavailable")
  })

  it("falls back to the axios message when the body carries none", async () => {
    failWith(500, {}, "Request failed with status code 500")
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect((error as ApiError).message).toBe(
      "Request failed with status code 500"
    )
    expect((error as ApiError).details).toEqual({})
  })

  it("reports status 0 and the axios message on a network failure", async () => {
    failWithoutResponse("Network Error")
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
    expect((error as ApiError).message).toBe("Network Error")
  })

  it("rejects non-axios errors untouched", async () => {
    const boom = new Error("adapter blew up")
    api.defaults.adapter = () => Promise.reject(boom)
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect(error).toBe(boom)
    expect(error).not.toBeInstanceOf(ApiError)
  })
})

describe("401 handling", () => {
  it("tags a 401 so callers can react to it", async () => {
    failWith(401, { detail: "Not authenticated" })
    const error = await apiGet("/things").catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 401,
      message: "Not authenticated",
      code: ACCESS_REQUIRED_CODE,
    })
    expect(isAccessRequiredError(error)).toBe(true)
  })

  it("does not navigate on the caller's behalf", async () => {
    const assign = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    } as unknown as Location)

    failWith(401, { detail: "Not authenticated" })
    await apiGet("/things").catch(() => undefined)

    expect(assign).not.toHaveBeenCalled()
  })

  it("does not tag other statuses as access errors", async () => {
    failWith(403, { detail: "Forbidden" })
    const error = await apiGet("/things").catch((e: unknown) => e)

    expect((error as ApiError).code).toBeUndefined()
    expect(isAccessRequiredError(error)).toBe(false)
  })
})
