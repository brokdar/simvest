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
  { name: "chart", path: "/projection" },
  { name: "entries", path: "/entries" },
  { name: "holdings", path: "/holdings" },
  { name: "income", path: "/income" },
  { name: "planning", path: "/goals" },
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
const KNOWN_FAILURES: Record<string, string> = {}

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
