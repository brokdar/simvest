import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

// No project scoping guard — runs on both chromium-desktop and mobile-safari.

test.describe("Data flow — cross-cutting", () => {
  // Each test in this file mutates the fixture (creates entries, edits values,
  // adds goals). Reset after each so the next test reads the seeded state.
  test.afterEach(async ({ resetDb }) => {
    resetDb()
  })

  // E2E-X-DATAFLOW-001 — New entry appears in Overview "Recent activity" without reload
  test("E2E-X-DATAFLOW-001 — new entry appears in Overview Recent activity without reload", async ({
    page,
  }) => {
    // Pre-select portfolio 1 before full-page load so DataProvider hydrates with it.
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await expect(page.locator("h1")).toContainText("Monthly entries")
    await expect(page.locator('[data-testid="btn-edit-table"]')).toBeEnabled()

    // Edit table → Add row → fill value → Save all.
    await page.locator('[data-testid="btn-edit-table"]').click()
    await page.locator('[data-testid="btn-add-row"]').click()
    const draftRow = page
      .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
      .first()
    await expect(draftRow).toBeVisible()
    await draftRow.locator('[data-testid^="cell-value-draft-"]').fill("123456")
    await page.locator('[data-testid="entries-grid-save"]').click()

    // Edit mode exits after a successful save.
    await expect(
      page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
    ).not.toBeAttached()

    // Client-side navigate to Overview — NO page.goto, NO page.reload
    await page.getByTestId("nav-overview").click()
    await page.waitForURL("**/")

    // Assert Recent activity section is visible and shows our value
    await expect(page.locator('[data-testid="recent-activity"]')).toBeVisible()
    // 123456 formatted as EUR — accept both de-DE ("123.456") and en-US
    // ("123,456") group separators since Playwright's default locale is
    // en-US but production tends to render de-DE for German operators.
    await expect(page.locator('[data-testid="recent-activity"]')).toContainText(
      /123[.,]456/
    )
  })

  // E2E-X-DATAFLOW-002 — New entry is reflected in Growth Chart history without reload
  test("E2E-X-DATAFLOW-002 — new entry is reflected in Growth Chart without reload", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await expect(page.locator("h1")).toContainText("Monthly entries")
    await expect(page.locator('[data-testid="btn-edit-table"]')).toBeEnabled()

    // Add a new entry with portfolio value 999001 via the inline grid.
    await page.locator('[data-testid="btn-edit-table"]').click()
    await page.locator('[data-testid="btn-add-row"]').click()
    const draftRow = page
      .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
      .first()
    await expect(draftRow).toBeVisible()
    await draftRow.locator('[data-testid^="cell-value-draft-"]').fill("999001")
    await page.locator('[data-testid="entries-grid-save"]').click()
    await expect(
      page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
    ).not.toBeAttached()

    // Client-side navigate to Growth Chart — NO reload
    await page.getByTestId("nav-chart").click()
    await page.waitForURL("**/chart")

    // Wait for chart to render — current source uses growth-chart-svg testid.
    await expect(page.locator('[data-testid="growth-chart-svg"]')).toBeVisible({
      timeout: 10_000,
    })

    // The chart stats grid should show scenario data — confirming it re-computed from entries
    await expect(page.locator('[data-testid="chart-stats-grid"]')).toBeVisible()
  })

  // E2E-X-DATAFLOW-003 — Entry update (edit) is reflected immediately on Overview
  test("E2E-X-DATAFLOW-003 — editing an entry is reflected immediately on Overview", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await expect(page.locator("h1")).toContainText("Monthly entries")
    await expect(page.locator('[data-testid="btn-edit-table"]')).toBeEnabled()

    // Edit the first row's Value cell inline.
    await page.locator('[data-testid="btn-edit-table"]').click()
    const firstRow = page
      .locator('[data-testid="entries-table"] tbody tr')
      .first()
    const entryId = await firstRow.getAttribute("data-testid")
    const idNum = entryId!.replace("entry-row-", "")
    await page.locator(`[data-testid="cell-value-${idNum}"]`).fill("777777")
    await page.locator('[data-testid="entries-grid-save"]').click()
    await expect(
      page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
    ).not.toBeAttached()

    // Client-side navigate to Overview — NO reload
    await page.getByTestId("nav-overview").click()
    await page.waitForURL("**/")

    await expect(page.locator('[data-testid="recent-activity"]')).toBeVisible()
    // 777777 formatted as EUR — accept both de-DE ("777.777") and en-US
    // ("777,777") group separators (see DATAFLOW-001 for the rationale).
    await expect(page.locator('[data-testid="recent-activity"]')).toContainText(
      /777[.,]777/
    )
  })

  // E2E-X-DATAFLOW-004 — New goal appears in Overview "Goal progress" card without reload
  test("E2E-X-DATAFLOW-004 — new goal appears in Overview Goal progress card without reload", async ({
    page,
  }) => {
    await page.goto("/planning")
    await expect(page.locator("h1")).toContainText("Planning")

    // Open goal editor
    await page.getByTestId("action-new-goal").click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Fill in name
    const nameInput = page.locator(
      '[data-slot="dialog-content"] input[placeholder="e.g. Coast FI"]'
    )
    await nameInput.fill("DataFlow Test Goal")

    // Fill annual income
    const numberInputs = page.locator(
      '[data-slot="dialog-content"] input[type="number"]'
    )
    await numberInputs.first().fill("24000")

    // Save (Create goal button)
    const saveBtn = page
      .locator('[data-slot="dialog-content"]')
      .locator(".btn-primary")
    await saveBtn.click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Client-side navigate to Overview — NO reload
    await page.getByTestId("nav-overview").click()
    await page.waitForURL("**/")

    // Assert goal appears in Goal progress section
    await expect(
      page.locator('[data-testid="goal-progress-section"]')
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="goal-progress-section"]')
    ).toContainText("DataFlow Test Goal")
  })

  // E2E-X-DATAFLOW-005 — Portfolio selection (selectedPortfolio) is preserved across client-side navigation
  test("E2E-X-DATAFLOW-005 — selected portfolio is preserved across client-side navigation", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(
      page.locator('[data-testid="portfolio-switcher-trigger"]')
    ).toBeVisible()

    // Open switcher and select portfolio id=1 (first non-Combined option)
    await page.locator('[data-testid="portfolio-switcher-trigger"]').click()
    await expect(page.locator('[data-testid="pf-opt-1"]')).toBeVisible()
    await page.locator('[data-testid="pf-opt-1"]').click()

    // Capture the selected portfolio name from the trigger
    const selectedName = await page.locator(".pf-dd-name").first().textContent()
    expect(selectedName).not.toBe("Combined")

    // Client-side navigate to Entries
    await page.getByTestId("nav-entries").click()
    await page.waitForURL("**/entries")

    // Portfolio name should still be the same in the switcher
    await expect(
      page.locator('[data-testid="portfolio-switcher-trigger"]')
    ).toContainText(selectedName!)

    // Client-side navigate to Chart
    await page.getByTestId("nav-chart").click()
    await page.waitForURL("**/chart")

    // Portfolio name should still be the same
    await expect(
      page.locator('[data-testid="portfolio-switcher-trigger"]')
    ).toContainText(selectedName!)
  })

  // E2E-X-DATAFLOW-006 — DataProvider does not re-fetch portfolios on client-side navigation
  test("E2E-X-DATAFLOW-006 — DataProvider does not re-fetch portfolios on client-side navigation", async ({
    page,
  }) => {
    // Track /api/portfolios GET calls
    const portfolioFetches: string[] = []

    // Navigate to / first (full load — this IS expected to fetch)
    await page.goto("/")
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()

    // Start counting AFTER initial hydration
    await page.route("**/api/portfolios", async (route) => {
      if (route.request().method() === "GET") {
        portfolioFetches.push(route.request().url())
      }
      await route.continue()
    })

    // Client-side navigate through multiple routes (Forecast, Entries, Planning).
    // /simulation and /goals were retired and now redirect to /planning;
    // nav-simulation and nav-goals testids no longer exist.
    await page.getByTestId("nav-chart").click()
    await page.waitForURL("**/chart")
    await page.getByTestId("nav-entries").click()
    await page.waitForURL("**/entries")
    await page.getByTestId("nav-planning").click()
    await page.waitForURL("**/planning")

    // Give any async fetches time to fire
    await page.waitForTimeout(500)

    // No GET /api/portfolios during client-side navigation
    expect(portfolioFetches.length).toBe(0)
  })
})
