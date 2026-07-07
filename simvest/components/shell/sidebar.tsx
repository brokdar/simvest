"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon } from "@/components/icon"
import { NAV_SECTIONS, isNavItemActive } from "./nav-items"

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
          {section.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`nav-item ${isNavItemActive(it.href, pathname) ? "active" : ""}`}
              data-testid={it.testId}
            >
              <span className="ico">
                <Icon name={it.icon} />
              </span>
              {it.label}
            </Link>
          ))}
        </nav>
      ))}
    </aside>
  )
}
