import { test, expect } from "../fixtures"

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
})

test.beforeEach(async ({ page }) => {
  // addInitScript runs on every navigation BEFORE any page script, so this
  // wipes localStorage on each subsequent page.goto in the test.
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      // about:blank or restricted origin — ignore
    }
  })
})

// A couple of the newer specs in this file mutate the DB to exercise empty /
// single-portfolio branches. Reset between every test so read-only specs above
// can't observe leftover state from an earlier mutating run.
test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test("E2E-D-OV-001 — Page renders the 'Overview' heading and subtitle", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const heading = page.locator("h1.title")
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText("Overview")

  const subtitle = page.locator('[data-testid="overview-subtitle"]')
  await expect(subtitle).toBeVisible()
  const subtitleText = await subtitle.textContent()
  // Subtitle uses the full entry date (e.g. "28 Dec 2023") so the year is
  // never truncated to two digits — that earlier read as a day-of-month and
  // looked broken on a financial dashboard.
  expect(subtitleText).toMatch(
    /Updated \w+ \d{4} · €[\d,.]+\/month saving plan/
  )
})

test("E2E-D-OV-002 — Four KPI cards are all visible with EUR-formatted values", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const portfolioValue = await page
    .locator('[data-testid="kpi-portfolio-value"] .value')
    .textContent()
  expect(portfolioValue).toMatch(/€[\d.,]+/)

  const totalInvested = await page
    .locator('[data-testid="kpi-total-invested"] .value')
    .textContent()
  expect(totalInvested).toMatch(/€[\d.,]+/)

  const netGain = await page
    .locator('[data-testid="kpi-net-gain"] .value')
    .textContent()
  // Net gain can be positive or negative; the app renders the sign immediately
  // after the € (e.g. "€-79.500", "+€42.500"). Accept ASCII '-' as well as
  // the Unicode minus '−' (U+2212) and the '+' prefix.
  expect(netGain).toMatch(/[+−-]?€[+−-]?[\d.,]+/)

  const dividends = await page
    .locator('[data-testid="kpi-dividends"] .value')
    .textContent()
  expect(dividends).toMatch(/€[\d.,]+/)
})

test("E2E-D-OV-003 — Portfolio value KPI shows a gain percentage delta and sparkline", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const delta = await page
    .locator('[data-testid="kpi-portfolio-value"] .delta')
    .textContent()
  // Delta uses de-DE locale formatting ("+45,1%"). Accept ASCII '-' as well
  // as Unicode minus '−' (U+2212) — the app uses Intl.NumberFormat which emits
  // ASCII hyphen, so the original `[+−]` class missed every negative value.
  expect(delta).toMatch(/[+−-][\d.,]+% vs invested/)

  const sparkSvg = page.locator('[data-testid="kpi-portfolio-value"] svg.spark')
  await expect(sparkSvg).toBeVisible()

  const sparkPath = page.locator(
    '[data-testid="kpi-portfolio-value"] svg.spark path'
  )
  await expect(sparkPath).toBeVisible()
  const dAttr = await sparkPath.getAttribute("d")
  expect(dAttr).toBeTruthy()
  expect(dAttr!.length).toBeGreaterThan(0)
})

test("E2E-D-OV-004 — Net gain KPI shows CAGR in the delta line", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const delta = await page
    .locator('[data-testid="kpi-net-gain"] .delta')
    .textContent()
  expect(delta).toMatch(/[\d.]+% CAGR/)
})

test("E2E-D-OV-005 — Value-vs-invested mini-chart SVG is rendered", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const miniChart = page.locator('[data-testid="overview-mini-chart"]')
  await expect(miniChart).toBeVisible()

  const paths = miniChart.locator("path")
  const pathCount = await paths.count()
  expect(pathCount).toBeGreaterThanOrEqual(2)

  const heading = page.locator('h2:has-text("Value vs invested")')
  await expect(heading).toBeVisible()

  const subText = page
    .locator(".muted.small")
    .filter({ hasText: /monthly entries/ })
  const subTextContent = await subText.first().textContent()
  // Subtext uses NBSP between count and unit so the count never wraps alone.
  expect(subTextContent).toMatch(/\d+\s+monthly entries · [\d.]+\s+years/)
})

test("E2E-D-OV-006 — Derived stats row shows historical return, best month, worst month", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const derivedStats = page.locator('[data-testid="derived-stats"]')
  await expect(derivedStats).toBeVisible()

  const histReturnLabel = derivedStats.locator(':has-text("Historical return")')
  await expect(histReturnLabel.first()).toBeVisible()

  // Check that the stats grid contains formatted percentage and EUR values
  const statsText = await derivedStats.textContent()
  expect(statsText).toMatch(/[\d.]+%/)
  expect(statsText).toMatch(/€[\d.,]+/)

  const bestMonthLabel = page.locator(':has-text("Best month")').first()
  await expect(bestMonthLabel).toBeVisible()

  const worstMonthLabel = page.locator(':has-text("Worst month")').first()
  await expect(worstMonthLabel).toBeVisible()
})

test("E2E-D-OV-007 — Goal progress section shows two goals from seed data", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const goalSection = page.locator('[data-testid="goal-progress-section"]')
  await expect(goalSection).toBeVisible()

  const goalHeading = goalSection.locator('h2:has-text("Goal progress")')
  await expect(goalHeading).toBeVisible()

  const activeChip = goalSection.locator(".chip")
  const chipText = await activeChip.textContent()
  // Chip text uses NBSP between count and label.
  expect(chipText).toMatch(/\d+\s+active/)

  const goalItems = page.locator('[data-testid="goal-item"]')
  // Other tests in the run may add goals to the shared e2e DB. Assert at least
  // the two seeded goals are present and iterate over the first two only.
  const goalCount = await goalItems.count()
  expect(goalCount).toBeGreaterThanOrEqual(2)

  for (let i = 0; i < 2; i++) {
    const item = goalItems.nth(i)
    const ring = item.locator("svg circle")
    await expect(ring.first()).toBeVisible()

    const pct = item.locator('[data-testid="goal-pct"]')
    await expect(pct).toBeVisible()
    const pctText = await pct.textContent()
    expect(pctText).toMatch(/[\d.]+%/)

    const subText = await item.locator(".muted.small").textContent()
    // Format: "€36.000/yr income · target 2040 · needs €1,3M"
    // The kind suffix (e.g. "income"/"dividends") sits between /yr and · target;
    // "needs" can be a compact value with a unit suffix (k, M).
    expect(subText).toMatch(
      /€[\d.,]+\/yr( \w+)? · target \d{4} · needs €[\d.,]+[kM]?/
    )
  }
})

test("E2E-D-OV-008 — Portfolio split section renders one bar per portfolio", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const splitSection = page.locator('[data-testid="portfolio-split"]')
  await expect(splitSection).toBeVisible()

  const heading = splitSection.locator('h2:has-text("Portfolio split")')
  await expect(heading).toBeVisible()

  const splitRows = splitSection.locator(".pbar")
  const rowCount = await splitRows.count()
  expect(rowCount).toBe(2)

  for (let i = 0; i < rowCount; i++) {
    const pbar = splitRows.nth(i)
    const inner = pbar.locator("div")
    const widthStyle = await inner.getAttribute("style")
    // React serializes inline `style` without a space after the colon
    // (e.g. "width:69.07942583732057%;background:#1E40AF").
    expect(widthStyle).toMatch(/width: ?[1-9][\d.]*%/)
  }
})

test("E2E-D-OV-009 — Recent activity shows the last 4 entries in reverse order", async ({
  page,
}) => {
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const recentActivity = page.locator('[data-testid="recent-activity"]')
  await expect(recentActivity).toBeVisible()

  const heading = recentActivity.locator('h2:has-text("Recent activity")')
  await expect(heading).toBeVisible()

  const rows = page.locator('[data-testid="activity-row"]')
  await expect(rows).toHaveCount(4)

  // Each row should have a EUR value
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i)
    const rowText = await row.textContent()
    expect(rowText).toMatch(/€[\d.,]+/)
  }

  // First row (most recent) label is the first child div containing the date.
  // The date is rendered as formatEntryDate(year, month, day) → "28 Dec 2023".
  const firstRowLabel = await rows.nth(0).locator("> div").first().textContent()
  expect(firstRowLabel).toMatch(/\d{1,2} \w+ \d{4}/)
})

test("E2E-D-OV-010 — Switching to a specific portfolio updates KPI values", async ({
  page,
}) => {
  // Clear localStorage on the first real navigation (about:blank denies access).
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      // Restricted origin — ignore.
    }
  })
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  // Confirm we start on Combined view.
  await expect(
    page.locator('[data-testid="portfolio-switcher-trigger"] .pf-dd-name')
  ).toHaveText("Combined")

  // Open the portfolio switcher and switch to portfolio 1
  const switcher = page.locator('[data-testid="portfolio-switcher-trigger"]')
  await switcher.click()

  const portfolio1Option = page.locator('[data-testid="pf-opt-1"]')
  await expect(portfolio1Option).toBeVisible()
  // Capture the option's name BEFORE clicking — earlier tests in the suite may
  // have renamed portfolio 1 (e.g. SETTINGS-003), so we can't hard-code it.
  const portfolio1Name = await portfolio1Option
    .locator(".pf-dd-name")
    .textContent()
  await portfolio1Option.click()

  // The switcher trigger label flips to the selected portfolio name once the
  // selection has propagated through the data provider. This is a strictly
  // more reliable signal than comparing KPI text — portfolio totals can
  // coincidentally equal the combined total after enough test mutation.
  await expect(
    page.locator('[data-testid="portfolio-switcher-trigger"] .pf-dd-name')
  ).toHaveText(portfolio1Name ?? "")

  // Subtitle still shows a valid "Updated ..." line (full 4-digit year).
  const subtitle = page.locator('[data-testid="overview-subtitle"]')
  await expect(subtitle).toBeVisible()
  const subtitleText = await subtitle.textContent()
  expect(subtitleText).toMatch(/Updated \w+ \d{4}/)

  // Goal progress section still shows goals (count is global, not per-portfolio).
  // Other tests in the suite may seed additional goals on the shared e2e DB,
  // so assert there are AT LEAST the two seeded goals.
  const goalItems = page.locator('[data-testid="goal-item"]')
  const goalCount = await goalItems.count()
  expect(goalCount).toBeGreaterThanOrEqual(2)
})

test("E2E-D-OV-012 — Portfolio value KPI delta renders a directional arrow glyph", async ({
  page,
}) => {
  // The accent KPI sits on a blue background where green/red text fails WCAG
  // contrast — the arrow is the color-blind-safe sign carrier and must always
  // be present alongside the +/- percentage.
  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')
  const delta = page.locator('[data-testid="kpi-portfolio-value-delta"]')
  await expect(delta).toBeVisible()
  const arrow = delta.locator(".arrow")
  await expect(arrow).toBeVisible()
  const arrowText = await arrow.textContent()
  expect(arrowText).toMatch(/[↑↓—]/)
})

test("E2E-D-OV-013 — Overview chart renders both above- and below-invested clip regions", async ({
  page,
}) => {
  // Per-segment area colouring is implemented as two clip-paths over the
  // green/red area fills. Both must exist so the area can show red where
  // value < invested and green where value > invested, regardless of which
  // side the latest point happens to be on.
  await page.goto("/")
  await page.waitForSelector('[data-testid="overview-chart-svg"]')
  const svg = page.locator('[data-testid="overview-chart-svg"]')
  await expect(svg.locator("clipPath").nth(0)).toBeAttached()
  await expect(svg.locator("clipPath").nth(1)).toBeAttached()
  const fills = await svg
    .locator("path[fill]")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as SVGPathElement).getAttribute("fill"))
    )
  expect(fills.some((f) => f && f.includes("tertiary"))).toBe(true)
  expect(fills.some((f) => f && f.includes("destructive"))).toBe(true)
})

test("E2E-D-OV-014 — Goal progress shows an empty state when no goals exist", async ({
  page,
}) => {
  // Delete the seeded goals so the empty branch is exercised. The top-level
  // afterEach restores the seed.
  const goalsRes = await page.request.get("/api/goals")
  const goals = (await goalsRes.json()) as { id: number }[]
  for (const g of goals) {
    await page.request.delete(`/api/goals/${g.id}`)
  }

  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const empty = page.locator('[data-testid="goal-progress-empty"]')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText(/No goals yet/i)

  const cta = page.locator('[data-testid="goal-progress-empty-cta"]')
  await expect(cta).toBeVisible()

  const chip = page.locator('[data-testid="goal-progress-chip"]')
  // The chip joins count + label with a non-breaking space.
  await expect(chip).toContainText(/0\s+active/)
})

test("E2E-D-OV-015 — Portfolio split card is hidden when only one portfolio exists", async ({
  page,
}) => {
  // Seed ships 2 portfolios. Deleting one collapses the split — the card is
  // useless at 100% and was making the layout look unfinished.
  await page.request.delete("/api/portfolios/2")

  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const split = page.locator('[data-testid="portfolio-split"]')
  await expect(split).toHaveCount(0)
})

test("E2E-D-OV-016 — Goal CTA navigates to /planning and opens the goal editor", async ({
  page,
}) => {
  // The CTA used to fire requestNew('goal') from a page that has no
  // subscriber — the click was silently a no-op. Replacing it with a Link
  // that carries ?new=goal makes /planning open its editor on mount.
  const goalsRes = await page.request.get("/api/goals")
  const goals = (await goalsRes.json()) as { id: number }[]
  for (const g of goals) {
    await page.request.delete(`/api/goals/${g.id}`)
  }

  await page.goto("/")
  await page.waitForSelector('[data-testid="kpi-portfolio-value"]')

  const cta = page.locator('[data-testid="goal-progress-empty-cta"]')
  await expect(cta).toHaveAttribute("href", /\/planning\?new=goal/)
  await cta.click()

  await page.waitForURL(/\/planning(\?|$)/)
  await expect(page.locator('[data-testid="goal-editor-title"]')).toBeVisible()
  // The query is stripped once consumed so a refresh doesn't reopen.
  await expect(page).toHaveURL(/\/planning$/)
})
