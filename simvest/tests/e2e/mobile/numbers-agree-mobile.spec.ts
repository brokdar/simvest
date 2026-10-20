import { test, expect } from "../fixtures"
import { setRange } from "../helpers"

// P4 on phones: the Forecast preview/apply model and the honest Income labels.

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      /* ignore */
    }
  })
})

test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test("E2E-M-P4-W9-001 — Forecast sliders preview on a phone; Apply and Reset are tappable", async ({
  page,
}) => {
  const before = (await (await page.request.get("/api/settings")).json()) as {
    horizonYears: number
  }
  await page.goto("/projection")
  await expect(page.getByTestId("assumptions-status")).toHaveText(
    "Matches your plan"
  )
  await setRange(
    page.getByTestId("chart-slider-horizon"),
    before.horizonYears + 1
  )
  await expect(page.getByTestId("assumptions-status")).toHaveText(
    "Preview — not saved"
  )
  const apply = page.getByTestId("assumptions-apply")
  await apply.scrollIntoViewIfNeeded()
  const box = await apply.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(32)
  await page.waitForLoadState("networkidle")
  expect(
    (
      (await (await page.request.get("/api/settings")).json()) as {
        horizonYears: number
      }
    ).horizonYears
  ).toBe(before.horizonYears)
  await page.getByTestId("assumptions-reset").tap()
  await expect(page.getByTestId("assumptions-status")).toHaveText(
    "Matches your plan"
  )
})

test("E2E-M-P4-INC-001 — Income shows the window, the top-3 label and the heatmap legend", async ({
  page,
}) => {
  await page.goto("/income")
  await expect(page.getByTestId("kpi-inc-last12-window")).toContainText(
    "12 months to"
  )
  await expect(
    page.locator('[data-testid="kpi-inc-concentration"] .label')
  ).toHaveText(/top 3 sources/i)
  await page.getByTestId("income-heatmap-legend").scrollIntoViewIfNeeded()
  await expect(page.getByTestId("income-heatmap-legend")).toBeVisible()
})
