import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/site"

/**
 * Public marketing surface only. `/app/*` and `/demo/*` sit behind the access
 * gate and are excluded here as well as in robots.ts.
 */
const publicRoutes = [
  "/",
  "/about",
  "/how-it-works",
  "/documentation",
  "/contact",
  "/request-access",
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return publicRoutes.map((route) => ({
    url: new URL(route, siteUrl).toString(),
    lastModified,
    changeFrequency: "monthly",
    priority: route === "/" ? 1 : 0.7,
  }))
}
