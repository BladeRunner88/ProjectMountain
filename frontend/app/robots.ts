import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Gated demo surfaces — not public, and not useful in an index.
      disallow: ["/app", "/demo"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  }
}
