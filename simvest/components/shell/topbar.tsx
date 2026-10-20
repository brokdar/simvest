"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { MobileNav } from "./mobile-nav"
import { Notifications } from "./notifications"
import { TopbarSearch } from "./topbar-search"

const CRUMBS: Record<string, string> = {
  "/": "Overview",
  "/entries": "Monthly entries",
  "/holdings": "Holdings",
  "/income": "Income",
  "/projection": "Projection",
  "/goals": "Goals",
  "/settings": "Settings",
}

export function Topbar({
  action,
  portfolioSelector,
}: {
  action?: ReactNode
  portfolioSelector?: ReactNode
}) {
  const pathname = usePathname()
  const crumb = CRUMBS[pathname] ?? "Page not found"
  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-left">
        <MobileNav />
        <nav
          aria-label="Breadcrumb"
          className="crumbs"
          data-testid="topbar-crumb"
        >
          Simvest &nbsp;/&nbsp; <strong>{crumb}</strong>
        </nav>
        {portfolioSelector}
      </div>
      <div className="topbar-right">
        <TopbarSearch />
        <Notifications />
        {action}
      </div>
    </header>
  )
}
