import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import type { ReactElement, ReactNode } from "react"

import { Providers } from "@/app/providers"
import { cn } from "@/lib/cn"

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
  title: "Isildur",
  description: "A data intelligence platform.",
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
