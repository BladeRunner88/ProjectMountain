import { NextResponse, type NextRequest } from "next/server"

import { ACCESS_COOKIE_NAME, ACCESS_COOKIE_VALUE } from "@/lib/access"
import {
  ACCESS_REQUIRED_DETAIL,
  isApiPath,
  requiresAccess,
} from "@/lib/access-gate"

function hasAccessCookie(request: NextRequest): boolean {
  return request.cookies.get(ACCESS_COOKIE_NAME)?.value === ACCESS_COOKIE_VALUE
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  if (!requiresAccess(pathname) || hasAccessCookie(request)) {
    return NextResponse.next()
  }

  if (isApiPath(pathname)) {
    return NextResponse.json(
      { detail: ACCESS_REQUIRED_DETAIL },
      { status: 401 }
    )
  }

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = "/request-access"
  redirectUrl.search = ""
  return NextResponse.redirect(redirectUrl)
}

export const config = {
  matcher: ["/app", "/app/:path*", "/demo", "/demo/:path*", "/api/:path*"],
}
