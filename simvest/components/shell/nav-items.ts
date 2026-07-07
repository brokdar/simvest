import type { IconName } from "@/components/icon"

export type NavItem = {
  href: string
  label: string
  icon: IconName
  testId: string
}

// Shared by the desktop sidebar (components/shell/sidebar.tsx) and the mobile
// nav drawer (components/shell/mobile-nav.tsx) so both render the exact same
// items, icons, and order from a single source.
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
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
      { href: "/income", label: "Income", icon: "note", testId: "nav-income" },
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

// A nav item is active when the current path matches it. "/" only matches the
// exact root; every other item matches its path prefix.
export function isNavItemActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
