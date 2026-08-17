import type { MetadataRoute } from "next"

import { siteDescription, siteName } from "@/lib/site"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteName} — operational intelligence`,
    short_name: siteName,
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  }
}
