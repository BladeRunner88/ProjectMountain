/**
 * Which paths the Next.js proxy treats as gated by the demo access cookie.
 *
 * Pages get a redirect to `/request-access`. API calls get 401 JSON so the
 * client (`isAccessRequiredError`) can react without following an HTML
 * redirect. The form and the health probe stay public on purpose.
 */

export const ACCESS_REQUIRED_DETAIL = "Not authenticated"

function withoutTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function isAppPath(pathname: string): boolean {
  const path = withoutTrailingSlash(pathname)
  return (
    path === "/app" ||
    path.startsWith("/app/") ||
    path === "/demo" ||
    path.startsWith("/demo/")
  )
}

export function isApiPath(pathname: string): boolean {
  const path = withoutTrailingSlash(pathname)
  return path === "/api" || path.startsWith("/api/")
}

export function isPublicApiPath(pathname: string): boolean {
  const path = withoutTrailingSlash(pathname)
  return path === "/api/health" || path === "/api/access-requests"
}

export function requiresAccess(pathname: string): boolean {
  if (isAppPath(pathname)) return true
  return isApiPath(pathname) && !isPublicApiPath(pathname)
}
