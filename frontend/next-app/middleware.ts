import { NextResponse, type NextRequest } from "next/server"

import { ACCESS_COOKIE_NAME, ACCESS_COOKIE_VALUE } from "@/lib/access"

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/demo" ||
    pathname.startsWith("/demo/")
  )
}

export function middleware(request: NextRequest): NextResponse {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value
  if (cookie === ACCESS_COOKIE_VALUE) {
    return NextResponse.next()
  }

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = "/request-access"
  redirectUrl.search = ""
  return NextResponse.redirect(redirectUrl)
}

export const config = {
  matcher: ["/app", "/app/:path*", "/demo", "/demo/:path*"],
}
