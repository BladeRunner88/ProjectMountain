import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/site"

/**
 * Public marketing surface only. `/app/*` and `/demo/*` sit behind the access
 * gate and are excluded here as well as in robots.ts.
 */
const publicLines = [
  "/",
  "/about",
  "/how-it-works",
  "/documentation",
  "/contact",
  "/request-access",
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return publicLines.map((line) => ({
    url: new URL(line, siteUrl).toString(),
    lastModified,
    changeFrequency: "monthly",
    priority: line === "/" ? 1 : 0.7,
  }))
}
