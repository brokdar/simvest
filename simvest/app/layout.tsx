import type { Metadata } from "next"
import { Manrope, Inter } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DataProvider } from "@/components/providers/data-provider"
import { getInitialData } from "@/lib/db/queries"

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
      <body>
        <TooltipProvider delayDuration={200}>
          <DataProvider initial={initial}>{children}</DataProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
