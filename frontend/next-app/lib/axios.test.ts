import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, api, apiGet, apiPost, getApiBaseUrl } from "@/lib/axios"

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
  const original = process.env.NEXT_PUBLIC_API_URL

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_API_URL
    else process.env.NEXT_PUBLIC_API_URL = original
  })

  it("falls back to the local backend", () => {
    delete process.env.NEXT_PUBLIC_API_URL
    expect(getApiBaseUrl()).toBe("http://localhost:8010")
  })

  it("prefers the configured URL", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com"
    expect(getApiBaseUrl()).toBe("https://api.example.com")
  })
})

describe("response interceptor: success envelopes", () => {
  it("unwraps the data field of a success envelope", async () => {
    respondWith(200, { success: true, data: { id: 7, name: "node" } })
    await expect(apiGet("/things")).resolves.toEqual({ id: 7, name: "node" })
  })

  it("unwraps falsy envelope payloads", async () => {
    respondWith(200, { success: true, data: null })
    await expect(apiGet("/things")).resolves.toBeNull()
  })

  it("unwraps array payloads", async () => {
    respondWith(200, { success: true, data: [1, 2, 3] })
    await expect(apiGet("/things")).resolves.toEqual([1, 2, 3])
  })

  it("passes through a body that is not an envelope", async () => {
    respondWith(200, { id: 7 })
    await expect(apiGet("/things")).resolves.toEqual({ id: 7 })
  })

  it("passes through a body with success:true but no data key", async () => {
    respondWith(200, { success: true })
    await expect(apiGet("/things")).resolves.toEqual({ success: true })
  })

  it("unwraps envelopes on POST as well", async () => {
    respondWith(200, { success: true, data: "created" })
    await expect(apiPost("/things", { name: "x" })).resolves.toBe("created")
  })
})

describe("response interceptor: error envelope on a 2xx response", () => {
  it("throws an ApiError built from an object error", async () => {
    respondWith(200, {
      success: false,
      error: { message: "Nope", code: "denied", details: { field: "name" } },
    })
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 200,
      message: "Nope",
      code: "denied",
      details: { field: "name" },
    })
  })

  it("throws an ApiError built from a string error", async () => {
    respondWith(200, { success: false, error: "Plain failure" })
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe("Plain failure")
    expect((error as ApiError).code).toBeUndefined()
  })

  it("uses a generic message when the error object has none", async () => {
    respondWith(200, { success: false, error: { code: "weird" } })
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect((error as ApiError).message).toBe("Request failed")
    expect((error as ApiError).code).toBe("weird")
  })

  it("falls back to the whole error object as details", async () => {
    respondWith(200, { success: false, error: { message: "Bad" } })
    expect(
      (await apiGet("/things").catch((e: unknown) => e)) as ApiError
    ).toHaveProperty("details", { message: "Bad" })
  })

  it("uses a generic message when the error is neither string nor object", async () => {
    respondWith(200, { success: false, error: 42 })
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect((error as ApiError).message).toBe("Request failed")
    expect((error as ApiError).details).toBe(42)
  })
})

describe("response interceptor: failed requests", () => {
  it("maps an error envelope in a failed response", async () => {
    failWith(422, {
      success: false,
      error: { message: "Invalid", code: "validation" },
    })
    const error = await apiGet("/things").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      message: "Invalid",
      code: "validation",
    })
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
  it("redirects to the request-access page", async () => {
    const assign = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    } as unknown as Location)

    failWith(401, { detail: "Not authenticated" })
    const error = await apiGet("/things").catch((e: unknown) => e)

    expect(assign).toHaveBeenCalledWith("/request-access")
    expect((error as ApiError).status).toBe(401)
  })

  it("does not redirect on other statuses", async () => {
    const assign = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    } as unknown as Location)

    failWith(403, { detail: "Forbidden" })
    await apiGet("/things").catch(() => undefined)

    expect(assign).not.toHaveBeenCalled()
  })
})
