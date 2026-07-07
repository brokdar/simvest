import type { Page } from "@playwright/test"

/**
 * Navigate via the primary nav in a viewport-agnostic way.
 *
 * Desktop (>640px) renders the sidebar rail — the nav link is clicked
 * directly. Mobile (<=640px) removes the rail and puts the nav behind a
 * hamburger drawer, so the toggle is opened first and the link is clicked
 * *inside* the drawer (scoping avoids the strict-mode clash with the hidden
 * sidebar copy of the same testid).
 *
 * Pass `urlPattern` (a `page.waitForURL` glob) to also wait for the route.
 */
export async function navClick(
  page: Page,
  testId: string,
  urlPattern?: string
) {
  const toggle = page.getByTestId("nav-toggle")
  if (await toggle.isVisible()) {
    await toggle.click()
    const drawer = page.getByTestId("mobile-drawer")
    await drawer.waitFor({ state: "visible" })
    await drawer.getByTestId(testId).click()
  } else {
    await page.getByTestId(testId).click()
  }
  if (urlPattern) await page.waitForURL(urlPattern)
}

/**
 * Seed the selected-portfolio for the next navigation. Writes both:
 *
 *   - a browser-context cookie (`simvest.selectedPortfolio=<id>`) — the
 *     server reads this in `getInitialData()` so SSR renders with the right
 *     portfolio on the FIRST request; no Combined→user-picked flicker, no
 *     hydration mismatch.
 *   - localStorage (`simvest.selectedPortfolio=<id>`) — kept for legacy
 *     tooling, the persistence test (PERSIST-007) that inspects the
 *     localStorage key, and any code path that reads it directly.
 *
 * Replaces the old `addInitScript(() => localStorage.setItem(...))` pattern
 * used throughout the e2e suite. The cookie part needs the browser-context
 * cookie store (set via `addCookies`) because `addInitScript` runs *after*
 * the page begins navigating, so `document.cookie = …` inside it would
 * miss the first request that the server uses to SSR.
 */
export async function preselectPortfolio(page: Page, id: number) {
  const value = String(id)
  // Use `domain: "localhost"` instead of a `url:` field — under the
  // per-worker fixture, each worker runs on its own port (3100..3100+N),
  // and a port-scoped cookie url like "http://localhost:3100" would silently
  // miss workers ≥ 1. Cookies set with a bare domain match all ports on
  // that host per RFC 6265.
  await page.context().addCookies([
    {
      name: "simvest.selectedPortfolio",
      value,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    },
  ])
  await page.addInitScript((v) => {
    try {
      window.localStorage.setItem("simvest.selectedPortfolio", v)
    } catch {
      /* ignore */
    }
  }, value)
}
