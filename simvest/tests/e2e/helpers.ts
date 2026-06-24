import type { Page } from "@playwright/test"

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
