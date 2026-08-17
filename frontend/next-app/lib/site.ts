/**
 * Canonical origin for absolute URLs in metadata, sitemap, and robots output.
 * Overridable per deployment; falls back to the local dev origin.
 */
export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
)

export const siteName = "Isildur"

export const siteDescription =
  "Isildur builds the layer that turns scattered operational data into one decision you can act on with confidence."
