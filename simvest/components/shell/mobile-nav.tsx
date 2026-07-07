"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog as DialogPrimitive } from "radix-ui"
import { Icon } from "@/components/icon"
import { NAV_SECTIONS, isNavItemActive } from "./nav-items"

// Off-canvas navigation for phone widths (<=640px, where the sidebar rail is
// removed). Built on Radix Dialog so focus trap, focus return to the trigger,
// Escape-to-close, body scroll lock and the click-to-close backdrop come for
// free. The trigger is CSS-hidden above 640px, so the drawer can only open on
// small screens; the desktop sidebar remains the nav there.
export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="btn btn-icon btn-secondary nav-toggle"
          aria-label="Open navigation menu"
          data-testid="nav-toggle"
        >
          <Icon name="menu" size={18} />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay" />
        <DialogPrimitive.Content
          className="drawer-panel"
          data-testid="mobile-drawer"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Navigation
          </DialogPrimitive.Title>
          <div className="brand">
            <div className="brand-mark">
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
              >
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
                  onClick={() => setOpen(false)}
                >
                  <span className="ico">
                    <Icon name={it.icon} />
                  </span>
                  {it.label}
                </Link>
              ))}
            </nav>
          ))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
