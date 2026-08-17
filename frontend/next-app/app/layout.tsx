import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import type { ReactElement, ReactNode } from "react"

import { Providers } from "@/app/providers"
import { cn } from "@/lib/cn"
import { siteDescription, siteName, siteUrl } from "@/lib/site"

import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: siteUrl,
  // NOTE: no `title.template` yet. Every child page currently hardcodes its own
  // " — Isildur" suffix, so a template would double it. Stripping those suffixes
  // touches pages owned by other in-flight work; see the PR body for the
  // follow-up.
  title: siteName,
  description: siteDescription,
  applicationName: siteName,
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    siteName,
    title: siteName,
    description: siteDescription,
    url: siteUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: siteName,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>): ReactElement {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", inter.variable, geistMono.variable)}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
