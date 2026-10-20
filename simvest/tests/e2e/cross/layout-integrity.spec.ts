import { request } from "@playwright/test"
import { test, expect } from "../fixtures"
import { collectLayoutIssues, type LayoutIssues } from "./layout-checks"

/**
 * Permanent guard for quality bar 3.2 (UI must render correctly).
 *
 * For every route x viewport it asserts:
 *   1. no horizontal page scroll
 *   2. no overflow-x:visible box whose content spills out of it
 *   3. no two sibling text boxes whose bounding rects intersect
 *   4. no money figure (EUR amount) that is visually clipped
 *
 * Runs against the e2e harness's own per-worker DB (see `../fixtures.ts`),
 * never `data/simvest.db`. Viewports are set per test, so the spec runs once
 * (chromium-desktop project) and is skipped on mobile-safari.
 *
 * Known failures are `test.fixme()`d through KNOWN_FAILURES below, each tagged
 * `// P8:` (desktop owner) or `// P9:` (mobile owner).
 */

const ROUTES = [
  { name: "overview", path: "/" },
  { name: "chart", path: "/chart" },
  { name: "entries", path: "/entries" },
  { name: "holdings", path: "/holdings" },
  { name: "income", path: "/income" },
  { name: "planning", path: "/planning" },
  { name: "settings", path: "/settings" },
] as const

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
  { w: 360, h: 740 },
  { w: 414, h: 896 },
] as const

type Assertion = "hscroll" | "overflow" | "overlap" | "money"
const ASSERTIONS: Assertion[] = ["hscroll", "overflow", "overlap", "money"]

// Key: `<route>|<w>x<h>|<assertion>`
const KNOWN_FAILURES: Record<string, string> = {
  // P8: div.value.mono scrollWidth=192 clientWidth=190 '€1,365,192.89; div.value.mono scrollWidth=192 clientWidth=190 '€1,090,000.00
  "overview|1280x800|overflow":
    "P8: div.value.mono scrollWidth=192 clientWidth=190 '€1,365,192.89; div.value.mono scrollWidth=192 clientWidth=190 '€1,090,000.00",
  // P8: text 'Comfortable FI · €1.3M' (cut by ancestor svg[data-testid=growth-chart-svg])
  "chart|1280x800|money":
    "P8: text 'Comfortable FI · €1.3M' (cut by ancestor svg[data-testid=growth-chart-svg])",
  // P8: svg[data-testid=growth-chart-svg] > '’19’22’27’30’33’36’39’42’45' x 'Early FI · €692k
  "chart|1280x800|overlap":
    "P8: svg[data-testid=growth-chart-svg] > '’19’22’27’30’33’36’39’42’45' x 'Early FI · €692k",
  // P8: text 'Comfortable FI · €1.3M' (cut by ancestor svg[data-testid=growth-chart-svg])
  "chart|1440x900|money":
    "P8: text 'Comfortable FI · €1.3M' (cut by ancestor svg[data-testid=growth-chart-svg])",
  // P8: svg[data-testid=growth-chart-svg] > '’19’21’23’27’29’31’33’35’37’39’41’43’45' x 'Early FI · €692k
  "chart|1440x900|overlap":
    "P8: svg[data-testid=growth-chart-svg] > '’19’21’23’27’29’31’33’35’37’39’41’43’45' x 'Early FI · €692k",
  // P8: text 'Comfortable FI · €1.3M' (cut by ancestor svg[data-testid=growth-chart-svg])
  "chart|1920x1080|money":
    "P8: text 'Comfortable FI · €1.3M' (cut by ancestor svg[data-testid=growth-chart-svg])",
  // P8: svg[data-testid=growth-chart-svg] > '’19’21’23’27’29’31’33’35’37’39’41’43’45' x 'Early FI · €692k
  "chart|1920x1080|overlap":
    "P8: svg[data-testid=growth-chart-svg] > '’19’21’23’27’29’31’33’35’37’39’41’43’45' x 'Early FI · €692k",
  // P9: svg[data-testid=growth-chart-svg] > '’19’31’41' x '€692k
  "chart|360x740|overlap":
    "P9: svg[data-testid=growth-chart-svg] > '’19’31’41' x '€692k",
  // P9: svg[data-testid=growth-chart-svg] > '’19’31’41' x '€692k
  "chart|390x844|overlap":
    "P9: svg[data-testid=growth-chart-svg] > '’19’31’41' x '€692k",
  // P9: svg[data-testid=growth-chart-svg] > '’19’31’41' x '€692k
  "chart|414x896|overlap":
    "P9: svg[data-testid=growth-chart-svg] > '’19’31’41' x '€692k",
  // P9: svg[data-testid=entries-bar-chart-svg] > 'Feb 21' x 'Feb 22; svg[data-testid=entries-bar-chart-svg] > 'Feb 22' x 'Feb 23
  "entries|360x740|overlap":
    "P9: svg[data-testid=entries-bar-chart-svg] > 'Feb 21' x 'Feb 22; svg[data-testid=entries-bar-chart-svg] > 'Feb 22' x 'Feb 23",
  // P9: svg[data-testid=entries-bar-chart-svg] > 'Feb 21' x 'Feb 22; svg[data-testid=entries-bar-chart-svg] > 'Feb 22' x 'Feb 23
  "entries|390x844|overlap":
    "P9: svg[data-testid=entries-bar-chart-svg] > 'Feb 21' x 'Feb 22; svg[data-testid=entries-bar-chart-svg] > 'Feb 22' x 'Feb 23",
  // P9: tr[data-testid=holding-row-1] > 'Vanguard FTSE All-World' x 'ETF; tr[data-testid=holding-row-3] > 'Vanguard FTSE All-World High Dividend' x 'ETF
  "holdings|360x740|overlap":
    "P9: tr[data-testid=holding-row-1] > 'Vanguard FTSE All-World' x 'ETF; tr[data-testid=holding-row-3] > 'Vanguard FTSE All-World High Dividend' x 'ETF",
  // P9: tr[data-testid=holding-row-1] > 'Vanguard FTSE All-World' x 'ETF; tr[data-testid=holding-row-3] > 'Vanguard FTSE All-World High Dividend' x 'ETF
  "holdings|390x844|overlap":
    "P9: tr[data-testid=holding-row-1] > 'Vanguard FTSE All-World' x 'ETF; tr[data-testid=holding-row-3] > 'Vanguard FTSE All-World High Dividend' x 'ETF",
  // P9: tr[data-testid=holding-row-1] > 'Vanguard FTSE All-World' x 'ETF; tr[data-testid=holding-row-3] > 'Vanguard FTSE All-World High Dividend' x 'ETF
  "holdings|414x896|overlap":
    "P9: tr[data-testid=holding-row-1] > 'Vanguard FTSE All-World' x 'ETF; tr[data-testid=holding-row-3] > 'Vanguard FTSE All-World High Dividend' x 'ETF",
  // P8: button[data-testid=income-donut-legend-holding:3].focus-ring > 'Vanguard FTSE All-World High Dividend' x '25.5
  "income|1280x800|overlap":
    "P8: button[data-testid=income-donut-legend-holding:3].focus-ring > 'Vanguard FTSE All-World High Dividend' x '25.5",
  // P8: button[data-testid=income-donut-legend-holding:1].focus-ring > 'Vanguard FTSE All-World' x '35.2%; button[data-testid=income-donut-legend-holding:3].focus-ring > 'Vanguard FTSE All-World High Dividend' x '25.5
  "income|1920x1080|overlap":
    "P8: button[data-testid=income-donut-legend-holding:1].focus-ring > 'Vanguard FTSE All-World' x '35.2%; button[data-testid=income-donut-legend-holding:3].focus-ring > 'Vanguard FTSE All-World High Dividend' x '25.5",
  // P9: tr scrollWidth=123 clientWidth=32 'Holding▼Received▼Last paid▼Count▼Cadence
  "income|360x740|overflow":
    "P9: tr scrollWidth=123 clientWidth=32 'Holding▼Received▼Last paid▼Count▼Cadence",
  // P9: svg > 'Aug 26' x 'Oct 26; button[data-testid=income-donut-legend-holding:3].focus-ring > 'Vanguard FTSE All-World High Dividend' x '25.5; tr[data-testid=income-holding-row-3] > 'Vanguard FTSE All-World High Dividend' x '25.5%
  "income|360x740|overlap":
    "P9: svg > 'Aug 26' x 'Oct 26; button[data-testid=income-donut-legend-holding:3].focus-ring > 'Vanguard FTSE All-World High Dividend' x '25.5; tr[data-testid=income-holding-row-3] > 'Vanguard FTSE All-World High Dividend' x '25.5%",
  // P9: tr scrollWidth=123 clientWidth=32 'Holding▼Received▼Last paid▼Count▼Cadence
  "income|390x844|overflow":
    "P9: tr scrollWidth=123 clientWidth=32 'Holding▼Received▼Last paid▼Count▼Cadence",
  // P9: svg > 'Aug 26' x 'Oct 26; tr[data-testid=income-holding-row-3] > 'Vanguard FTSE All-World High Dividend' x '25.5%
  "income|390x844|overlap":
    "P9: svg > 'Aug 26' x 'Oct 26; tr[data-testid=income-holding-row-3] > 'Vanguard FTSE All-World High Dividend' x '25.5%",
  // P9: tr scrollWidth=123 clientWidth=32 'Holding▼Received▼Last paid▼Count▼Cadence
  "income|414x896|overflow":
    "P9: tr scrollWidth=123 clientWidth=32 'Holding▼Received▼Last paid▼Count▼Cadence",
  // P9: svg > 'Aug 26' x 'Oct 26
  "income|414x896|overlap": "P9: svg > 'Aug 26' x 'Oct 26",
  // P8: svg[data-testid=solver-chart-svg] > 'Target reached' x '€2.0M
  "planning|1280x800|overlap":
    "P8: svg[data-testid=solver-chart-svg] > 'Target reached' x '€2.0M",
  // P9: svg[data-testid=solver-chart-svg] > 'Target reached' x '€2.0M
  "planning|360x740|overlap":
    "P9: svg[data-testid=solver-chart-svg] > 'Target reached' x '€2.0M",
  // P9: svg[data-testid=solver-chart-svg] > 'Target reached' x '€2.0M
  "planning|390x844|overlap":
    "P9: svg[data-testid=solver-chart-svg] > 'Target reached' x '€2.0M",
  // P9: svg[data-testid=solver-chart-svg] > 'Target reached' x '€2.0M
  "planning|414x896|overlap":
    "P9: svg[data-testid=solver-chart-svg] > 'Target reached' x '€2.0M",
}

// Stress data on top of the standard seed: a long portfolio name and a
// seven-figure balance, the two things most likely to overflow.
const STRESS_NAME = "Long-Named Retirement Savings Portfolio (Joint Account)"

test.describe("Layout integrity", () => {
  test.beforeAll(async ({ workerServer }) => {
    const api = await request.newContext({ baseURL: workerServer.baseURL })
    try {
      const list = await (await api.get("/api/portfolios")).json()
      if (list.some((p: { name: string }) => p.name === STRESS_NAME)) return
      const created = await (
        await api.post("/api/portfolios", {
          data: { name: STRESS_NAME, color: "#7C3AED" },
        })
      ).json()
      const res = await api.post(`/api/portfolios/${created.id}/entries`, {
        data: {
          year: 2026,
          month: 9,
          day: 30,
          invested: 1_000_000,
          value: 1_234_567.89,
        },
      })
      expect(res.ok()).toBe(true)
    } finally {
      await api.dispose()
    }
  })

  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      test.describe(`${route.name} @ ${vp.w}x${vp.h}`, () => {
        // The four assertions read one audit of the same page, so run them
        // in order on one worker and load + audit only once. "default" (not
        // "serial") keeps a failing assertion from skipping its siblings; if
        // a failure restarts the worker, `issues` is unset and re-collected.
        test.describe.configure({ mode: "default" })
        let issues: LayoutIssues | undefined

        test.beforeEach(async ({ page }, testInfo) => {
          test.skip(
            testInfo.project.name !== "chromium-desktop",
            "viewport is set per test; runs once under chromium-desktop"
          )
          if (issues) return
          await page.setViewportSize({ width: vp.w, height: vp.h })
          await page.goto(route.path)
          await expect(page.locator("h1").first()).toBeVisible()
          await page.waitForLoadState("networkidle")
          issues = await page.evaluate(collectLayoutIssues)
        })

        for (const assertion of ASSERTIONS) {
          test(`${assertion}`, () => {
            const key = `${route.name}|${vp.w}x${vp.h}|${assertion}`
            test.fixme(key in KNOWN_FAILURES, KNOWN_FAILURES[key])
            if (!issues) throw new Error("layout audit did not run")
            switch (assertion) {
              case "hscroll":
                expect(issues.hScroll, "document scrolls horizontally").toBe(
                  null
                )
                break
              case "overflow":
                expect(issues.overflowVisible).toEqual([])
                break
              case "overlap":
                expect(issues.textOverlaps).toEqual([])
                break
              case "money":
                expect(issues.clippedMoney).toEqual([])
                break
            }
          })
        }
      })
    }
  }
})
