import type { NextConfig } from "next"

/**
 * Security headers applied to every response. Kept here (rather than in
 * `middleware.ts`) so they also cover static assets and error responses that
 * never reach the middleware matcher.
 */
const securityHeaders = [
  // Do not allow the app to be framed — it is an authenticated control surface.
  { key: "X-Frame-Options", value: "DENY" },
  // Send the full referrer same-origin, origin-only cross-origin, nothing on downgrade.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Never let a browser MIME-sniff a response into something executable.
  { key: "X-Content-Type-Options", value: "nosniff" },
]

const nextConfig: NextConfig = {
  // Statically typed `next/link` hrefs and `next/navigation` calls.
  typedRoutes: true,

  images: {
    // Every image in this app is a local asset served from `public/`
    // (`/showcase/*.png`). Allow exactly that prefix and nothing else, with no
    // query string, so the optimizer cannot be pointed at arbitrary paths.
    localPatterns: [{ pathname: "/showcase/**", search: "" }],
    // No remote images are used; keep the remote allowlist empty on purpose.
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
    qualities: [75],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
