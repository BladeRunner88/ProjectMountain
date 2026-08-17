import { describe, expect, it } from "vitest"

import { cn } from "@/lib/cn"

describe("cn", () => {
  it("joins plain class names", () => {
    expect(cn("a", "b")).toBe("a b")
  })

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b")
  })

  it("supports conditional object and array syntax", () => {
    expect(cn(["a", { b: true, c: false }], "d")).toBe("a b d")
  })

  it("returns an empty string when given nothing", () => {
    expect(cn()).toBe("")
  })

  it("lets a later tailwind class win over an earlier conflicting one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
    expect(cn("text-sm text-red-500", "text-lg")).toBe("text-red-500 text-lg")
  })

  it("keeps non-conflicting tailwind classes", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4")
  })

  it("merges conflicts across nested inputs", () => {
    expect(cn("rounded-sm", ["rounded-lg", { "rounded-full": true }])).toBe(
      "rounded-full"
    )
  })
})
