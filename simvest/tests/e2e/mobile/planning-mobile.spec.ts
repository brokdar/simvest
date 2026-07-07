/**
 * Planning — Mobile E2E Tests
 *
 * The workspace body (assumptions column + trajectory chart) and the KPI row
 * used fixed inline grid styles (`minmax(260px, 360px) 1fr` and
 * `repeat(3, 1fr)`), so no media query could collapse them — at iPhone width
 * the trajectory chart (the page's main output) was pushed off-screen
 * entirely and the third KPI tile clipped mid-word. Both now collapse to a
 * single column below 640px via `.planning-body` / `.planning-kpis`, and the
 * SolverChart measures its real pixel width instead of squishing a fixed
 * 1000-unit viewBox (mirrors the entries-bar-chart fix).
 */
import { test, expect } from "../fixtures"

test.describe("Planning — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.clear()
      } catch {
        // about:blank or restricted origin — ignore
      }
    })
  })

  // E2E-M-PLAN-001 — No horizontal page overflow at iPhone width.
  test("E2E-M-PLAN-001 — planning page has no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/planning")
    await page.locator('[data-testid="goal-strip"]').waitFor()

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)
  })

  // E2E-M-PLAN-002 — The trajectory chart is the page's main output; it must
  // render fully within the viewport width, not be pushed off-screen by a
  // fixed-width assumptions column.
  test("E2E-M-PLAN-002 — trajectory chart is visible within the viewport", async ({
    page,
  }) => {
    await page.goto("/planning")

    const svg = page.locator('[data-testid="solver-chart-svg"]')
    await expect(svg).toBeVisible()

    const viewport = page.viewportSize()
    const vw = viewport?.width ?? 390

    const box = await svg.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw + 1)
    // Not squished to a sliver — the old fixed 1000x360 viewBox stretched by
    // preserveAspectRatio="none" still reported a nonzero box even when
    // horizontally scrolled off-screen, so also assert a reasonable width.
    expect(box?.width ?? 0).toBeGreaterThan(200)
  })

  // E2E-M-PLAN-003 — All three KPI tiles (stacked one-per-row on mobile) are
  // fully on-screen — the third tile used to clip mid-word under the fixed
  // 3-column grid.
  test("E2E-M-PLAN-003 — third KPI tile is fully within the viewport", async ({
    page,
  }) => {
    await page.goto("/planning")

    // Default active goal (seed's first goal, "Comfortable FI") is an
    // annual_income goal: required-monthly, portfolio-target, inflated.
    const thirdTile = page.locator('[data-testid="kpi-inflated"]')
    await expect(thirdTile).toBeVisible()

    const viewport = page.viewportSize()
    const vw = viewport?.width ?? 390

    const box = await thirdTile.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw + 1)
  })

  // E2E-M-PLAN-004 — KPI tiles stack to a single column below 640px.
  test("E2E-M-PLAN-004 — KPI tiles stack to a single column on mobile", async ({
    page,
  }) => {
    await page.goto("/planning")
    await page.locator('[data-testid="kpi-required-monthly"]').waitFor()

    const columnCount = await page.evaluate(() => {
      const el = document.querySelector(".planning-kpis")
      if (!el) return -1
      return window.getComputedStyle(el).gridTemplateColumns.split(" ").length
    })
    expect(columnCount).toBe(1)
  })
})
