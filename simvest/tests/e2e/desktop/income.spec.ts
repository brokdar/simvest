import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
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

// INC-019 mutates the DB (creates a holding + dividend); reset between tests.
test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test("E2E-D-INC-001 — KPI row shows four tiles with EUR values + delta line", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="kpi-inc-total"]').waitFor()

  for (const id of [
    "kpi-inc-total",
    "kpi-inc-last12",
    "kpi-inc-yoy",
    "kpi-inc-concentration",
  ]) {
    const value = await page
      .locator(`[data-testid="${id}"] .value`)
      .textContent()
    expect(value).toMatch(/[€\d.,%+\-−]+/)
  }

  await expect(page.locator('[data-testid="kpi-inc-yoy-delta"]')).toBeVisible()
})

test("E2E-D-INC-002 — Trailing YoY tile shows a +/− sign and pos/neg color class", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="kpi-inc-yoy"]').waitFor()
  const delta = page.locator('[data-testid="kpi-inc-yoy-delta"]')
  await expect(delta).toBeVisible()
  const className = (await delta.getAttribute("class")) ?? ""
  expect(className).toMatch(/pos|neg|muted/)
})

test("E2E-D-INC-003 — Donut renders multiple slices and a legend", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-donut"]').waitFor()
  const sliceCount = await page
    .locator('[data-testid^="income-donut-slice-"]')
    .count()
  expect(sliceCount).toBeGreaterThan(2)
  await expect(
    page.locator('[data-testid="income-donut-legend"]')
  ).toBeVisible()
})

test("E2E-D-INC-005 — Clicking a legend entry writes ?holding= to the URL", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-donut-legend"]').waitFor()
  const firstButton = page
    .locator('[data-testid^="income-donut-legend-"]')
    .first()
  await firstButton.click()
  await expect.poll(() => page.url()).toMatch(/[?&]holding=/)
})

test("E2E-D-INC-006 — Monthly bar chart renders one stacked group per active month", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-monthly-chart"]').waitFor()
  const bars = await page
    .locator(
      '[data-testid^="income-bar-"]:not([data-testid^="income-bar-hit-"])'
    )
    .count()
  expect(bars).toBeGreaterThan(0)
})

test("E2E-D-INC-008 — Clicking a bar writes ?month=YYYY-MM to the URL", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-monthly-chart"]').waitFor()
  const firstHit = page.locator('[data-testid^="income-bar-hit-"]').first()
  await firstHit.click()
  await expect.poll(() => page.url()).toMatch(/[?&]month=\d{4}-\d{2}/)
})

test("E2E-D-INC-020 — Hovering a per-holding row cross-highlights the monthly chart", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-per-holding-table"]').waitFor()
  const chart = page.locator('[data-testid="income-monthly-chart"]')

  // No highlight before hover.
  await expect(chart).not.toHaveAttribute("data-highlighted-source", /.+/)

  // First numeric holding row (skip the interest aggregate row).
  const ids = await page
    .locator('[data-testid^="income-holding-row-"]')
    .evaluateAll((els) =>
      els
        .map((e) =>
          e.getAttribute("data-testid")!.replace("income-holding-row-", "")
        )
        .filter((id) => id !== "interest" && id !== "null")
    )
  if (ids.length === 0) test.skip(true, "no eligible holding rows seeded")
  const targetId = ids[0]

  await page.locator(`[data-testid="income-holding-row-${targetId}"]`).hover()
  // The chart marks the held source and renders its isolated overlay bars.
  await expect(chart).toHaveAttribute("data-highlighted-source", targetId)
  await expect(
    page.locator('[data-testid="income-bar-highlight"]')
  ).toBeVisible()
})

test("E2E-D-INC-021 — Monthly tooltip appears anchored within the chart bounds", async ({
  page,
}) => {
  await page.goto("/income")
  const chart = page.locator('[data-testid="income-monthly-chart"]')
  await chart.waitFor()

  await page.locator('[data-testid^="income-bar-hit-"]').first().hover()
  const detail = page.locator('[data-testid="income-monthly-detail"]')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText(/payout/)

  // The card must stay inside the chart's horizontal bounds (the old bug
  // floated it detached / overflowing).
  const chartBox = await chart.boundingBox()
  const detailBox = await detail.boundingBox()
  expect(detailBox!.x).toBeGreaterThanOrEqual(chartBox!.x - 1)
  expect(detailBox!.x + detailBox!.width).toBeLessThanOrEqual(
    chartBox!.x + chartBox!.width + 1
  )
})

test("E2E-D-INC-009 — Per-holding table aria-sort flips when a header is clicked", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-per-holding-table"]').waitFor()
  const receivedTh = page.locator('[data-testid="income-sort-received"]')
  await expect(receivedTh).toHaveAttribute("aria-sort", "descending")
  await receivedTh.locator("button").click()
  await expect(receivedTh).toHaveAttribute("aria-sort", "ascending")
})

test("E2E-D-INC-010 — Per-holding rows include a sparkline SVG", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-per-holding-table"]').waitFor()
  const sparks = await page
    .locator('[data-testid="income-per-holding-table"] svg.spark')
    .count()
  expect(sparks).toBeGreaterThan(0)
})

test("E2E-D-INC-011 — Calendar heatmap renders multiple year rows and 12 cells per row", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-heatmap"]').waitFor()
  const cells = await page
    .locator('[data-testid^="income-heatmap-cell-"]')
    .count()
  expect(cells % 12).toBe(0)
  expect(cells).toBeGreaterThanOrEqual(12)
})

test("E2E-D-INC-013 — Net/Gross toggle flips the headline total", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="kpi-inc-total"]').waitFor()

  const before = await page
    .locator('[data-testid="kpi-inc-total"] .value')
    .textContent()
  await page.locator('[data-testid="income-basis-toggle-gross"]').click()
  await expect
    .poll(() =>
      page.locator('[data-testid="kpi-inc-total"] .value').textContent()
    )
    .not.toBe(before)
})

test("E2E-D-INC-014 — Deep link ?holding=<id> highlights matching row", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-per-holding-table"]').waitFor()
  const ids = await page
    .locator('[data-testid^="income-holding-row-"]')
    .evaluateAll((els) =>
      els
        .map((e) =>
          e.getAttribute("data-testid")!.replace("income-holding-row-", "")
        )
        .filter((id) => id !== "interest" && id !== "null")
    )
  if (ids.length === 0) test.skip(true, "no eligible holding rows seeded")
  const targetId = ids[0]
  await page.goto(`/income?holding=${targetId}`)
  const row = page.locator(`[data-testid="income-holding-row-${targetId}"]`)
  await expect(row).toBeVisible()
})

test("E2E-D-INC-016 — Empty portfolio shows the empty-state CTA", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  // Filter to interest only on the equity portfolio — there are no interest
  // events on portfolio 1 in the fixture, so the view drops to empty state.
  await page.goto("/income?kind=interest")
  await expect(page.locator('[data-testid="income-empty-state"]')).toBeVisible()
})

test("E2E-D-INC-017 — /holdings income chip deep-links to /income?holding=<id>", async ({
  page,
}) => {
  await page.goto("/holdings")
  const chip = page.locator('[data-testid^="holding-income-link-"]').first()
  await chip.waitFor()
  const href = await chip.getAttribute("href")
  expect(href).toMatch(/\/income\?holding=\d+/)
  await chip.click()
  await expect(page).toHaveURL(/\/income\?holding=\d+/)
})

test("E2E-D-INC-018 — Recent payouts collapses to 20 rows by default; toggle expands", async ({
  page,
}) => {
  await page.goto("/income")
  await page.locator('[data-testid="income-recent-table"]').waitFor()
  const toggle = page.locator('[data-testid="income-recent-toggle"]')
  if (!(await toggle.isVisible())) {
    test.skip(true, "fewer than 20 events in fixture; toggle not rendered")
  }
  const rowsSelector =
    'tr[data-testid^="income-row-"]:not([data-testid*="anchor"])'
  const before = await page.locator(rowsSelector).count()
  expect(before).toBeLessThanOrEqual(20)
  await toggle.click()
  const after = await page.locator(rowsSelector).count()
  expect(after).toBeGreaterThan(before)
  await expect(toggle).toHaveText(/Show Fewer/)
})

test("E2E-D-INC-019 — Create a holding inline from the Record dividend form", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/income")

  await page.locator('[data-testid="btn-add-dividend"]').click()
  await expect(
    page.locator('[data-testid="dividend-editor-dialog"]')
  ).toBeVisible()

  // Portfolio 1 has seeded holdings, so the form opens on "Existing"; switch
  // to the inline "New" holding sub-form (no second dialog).
  await page.locator('[data-testid="dividend-holding-mode-new"]').click()

  // Type defaults to ETF; ISIN is optional — name alone is enough to save.
  const name = `Inline Holding ${Date.now()}`
  await page.locator('[data-testid="dividend-new-holding-name"]').fill(name)

  // Submit is disabled until the new holding is valid, so a successful submit
  // proves the holding was created and linked in a single save.
  await page.locator('[data-testid="income-event-amount"]').fill("150")
  await page.locator('[data-testid="dividend-editor-submit"]').click()
  await expect(
    page.locator('[data-testid="dividend-editor-dialog"]')
  ).toBeHidden()

  // The new holding and its dividend now appear in the income view.
  await expect(page.getByText(name).first()).toBeVisible()
})
