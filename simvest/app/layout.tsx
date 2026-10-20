import type { Metadata, Viewport } from "next"
import { Manrope, Inter } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DataProvider } from "@/components/providers/data-provider"
import { getInitialData } from "@/lib/db/queries"
import { ThemeSync } from "@/components/providers/theme"
import { THEME_INIT_SCRIPT } from "@/lib/theme"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
})

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Simvest — Portfolio Manager & Simulator",
  description:
    "Track portfolios, project growth, and solve for retirement goals.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

// `getInitialData()` reads from SQLite — there is no value in trying to
// prerender this shell. Declaring `dynamic` explicitly stops Next.js from
// re-evaluating the bailout on every build.
export const dynamic = "force-dynamic"

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initial = await getInitialData()
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(inter.variable, manrope.variable)}
    >
      <head>
        {/* Applies the stored light/dark preference before first paint, so a
            dark-theme reload never flashes white. See lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        <TooltipProvider delayDuration={200}>
          <DataProvider initial={initial}>{children}</DataProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
