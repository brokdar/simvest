"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { Icon } from "@/components/icon"
import { TopbarSearch } from "./topbar-search"

const CRUMBS: Record<string, string> = {
  "/": "Overview",
  "/chart": "Forecast",
  "/entries": "Monthly entries",
  "/holdings": "Holdings",
  "/income": "Income",
  "/planning": "Planning",
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
  const crumb = CRUMBS[pathname] ?? "Overview"
  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-left">
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
        <button
          type="button"
          className="btn btn-icon btn-secondary"
          aria-label="Notifications"
        >
          <Icon name="bell" size={16} />
        </button>
        {action}
      </div>
    </header>
  )
}
