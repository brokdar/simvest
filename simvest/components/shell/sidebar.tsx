"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon, type IconName } from "@/components/icon"

type NavItem = {
  href: string
  label: string
  icon: IconName
  testId: string
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Portfolio",
    items: [
      {
        href: "/",
        label: "Overview",
        icon: "dashboard",
        testId: "nav-overview",
      },
      {
        href: "/holdings",
        label: "Holdings",
        icon: "wallet",
        testId: "nav-holdings",
      },
      {
        href: "/entries",
        label: "Monthly Entries",
        icon: "table",
        testId: "nav-entries",
      },
      {
        href: "/income",
        label: "Income",
        icon: "note",
        testId: "nav-income",
      },
    ],
  },
  {
    title: "Planning",
    items: [
      { href: "/chart", label: "Forecast", icon: "chart", testId: "nav-chart" },
      {
        href: "/planning",
        label: "Planning",
        icon: "target",
        testId: "nav-planning",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: "settings",
        testId: "nav-settings",
      },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M4 18L10 12L14 16L20 6"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">Simvest</div>
          <div className="brand-sub">Portfolio · Simulate</div>
        </div>
      </div>

      {NAV_SECTIONS.map((section) => (
        <nav key={section.title} aria-label={section.title}>
          <div className="nav-section">{section.title}</div>
          {section.items.map((it) => {
            const active =
              it.href === "/" ? pathname === "/" : pathname.startsWith(it.href)
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`nav-item ${active ? "active" : ""}`}
                data-testid={it.testId}
              >
                <span className="ico">
                  <Icon name={it.icon} />
                </span>
                {it.label}
              </Link>
            )
          })}
        </nav>
      ))}

      <div className="sidebar-foot">
        <div className="avatar" aria-label="User avatar: Elena Kovac">
          EK
        </div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Elena Kovac</div>
          <div style={{ fontSize: 11, color: "var(--neutral-400)" }}>
            Personal · EUR
          </div>
        </div>
      </div>
    </aside>
  )
}
