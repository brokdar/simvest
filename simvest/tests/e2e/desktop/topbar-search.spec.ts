import { test, expect } from "../fixtures"

test.describe("Topbar search — desktop", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "desktop only")

  // E2E-D-SEARCH-001 — Dropdown is closed when the input is empty
  test("E2E-D-SEARCH-001 — dropdown is closed when the input is empty", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    // Listbox should not exist at all with empty input
    await expect(page.locator('[role="listbox"]')).not.toBeAttached()

    // Focus input without typing — listbox still absent
    await page.getByTestId("search-input").click()
    await expect(page.locator('[role="listbox"]')).not.toBeAttached()
  })

  // E2E-D-SEARCH-002 — Typing a query opens the dropdown with grouped results
  test("E2E-D-SEARCH-002 — typing a query opens the dropdown with grouped results", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    await page.getByTestId("search-input").click()
    // "port" matches both "Global Equity ETF" and "Dividend Income" ... actually
    // portfolios are named "Global Equity ETF" and "Dividend Income".
    // "equity" will match "Global Equity ETF" only in portfolio names.
    // Let's use "global" to match at least one portfolio by name.
    await page.getByTestId("search-input").fill("global")
    await expect(page.locator('[role="listbox"]')).toBeVisible()

    await expect(page.getByTestId("search-group-portfolios")).toBeVisible()
    await expect(page.getByTestId("search-group-portfolios")).toContainText(
      "Portfolios"
    )
    await expect(page.getByTestId("search-result").first()).toBeVisible()
    // Portfolio result should show "Open chart"
    const portfoliosGroup = page.getByTestId("search-group-portfolios")
    await expect(portfoliosGroup).toContainText("Open chart")
  })

  // E2E-D-SEARCH-003 — Goal results appear with correct subtext
  test("E2E-D-SEARCH-003 — goal results appear with correct subtext", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    // Seed goals: "Comfortable FI" and "Early FI" — "fi" matches both
    await page.getByTestId("search-input").fill("Comfortable")
    await expect(page.locator('[role="listbox"]')).toBeVisible()

    await expect(page.getByTestId("search-group-goals")).toBeVisible()
    // Group is titled "Goals" (the entity type). The action hint below directs
    // users to the Planning page.
    await expect(page.getByTestId("search-group-goals")).toContainText("Goals")

    // Goal sub-line should match €annual/yr · by YYYY format
    const goalsGroup = page.getByTestId("search-group-goals")
    await expect(goalsGroup).toContainText("/yr")
    await expect(goalsGroup).toContainText("by 2040")
    // Action hint
    await expect(goalsGroup).toContainText("Open planning")
  })

  // E2E-D-SEARCH-004 — Entry results appear and show portfolio attribution
  test("E2E-D-SEARCH-004 — entry results appear and show portfolio attribution", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    // Entries have labels like "Jan 21", "Feb 21" etc. "Jan" should match month labels.
    await page.getByTestId("search-input").fill("Jan")
    await expect(page.locator('[role="listbox"]')).toBeVisible()

    await expect(page.getByTestId("search-group-entries")).toBeVisible()
    await expect(page.getByTestId("search-group-entries")).toContainText(
      "Entries"
    )

    // Verify at most 6 results (MAX_ENTRIES cap)
    const entryResults = page
      .getByTestId("search-group-entries")
      .getByTestId("search-result")
    const count = await entryResults.count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(6)

    // Action hint for entries
    await expect(page.getByTestId("search-group-entries")).toContainText(
      "Open entries"
    )
  })

  // E2E-D-SEARCH-005 — "No matches" message shown for a non-matching query
  test("E2E-D-SEARCH-005 — no matches message shown for a non-matching query", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    await page.getByTestId("search-input").fill("zzznomatch")
    await expect(page.locator('[role="listbox"]')).toBeVisible()

    await expect(page.getByTestId("search-no-results")).toBeVisible()
    await expect(page.getByTestId("search-no-results")).toContainText(
      "zzznomatch"
    )
    await expect(page.getByTestId("search-result")).not.toBeAttached()
  })

  // E2E-D-SEARCH-006 — Pressing Escape closes the dropdown and blurs the input
  test("E2E-D-SEARCH-006 — pressing Escape closes the dropdown and blurs the input", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    await page.getByTestId("search-input").fill("global")
    await expect(page.locator('[role="listbox"]')).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.locator('[role="listbox"]')).not.toBeAttached()

    // Input should no longer be focused
    const isFocused = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="search-input"]')
      return document.activeElement === input
    })
    expect(isFocused).toBe(false)
  })

  // E2E-D-SEARCH-007 — Clicking outside the search container closes the dropdown
  test("E2E-D-SEARCH-007 — clicking outside the search container closes the dropdown", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    await page.getByTestId("search-input").fill("global")
    await expect(page.locator('[role="listbox"]')).toBeVisible()

    // Click somewhere outside the search container — sidebar brand area is safe
    await page.getByTestId("sidebar").locator(".brand").click()
    await expect(page.locator('[role="listbox"]')).not.toBeAttached()

    // Input value should remain
    await expect(page.getByTestId("search-input")).toHaveValue("global")
  })

  // E2E-D-SEARCH-008 — Clicking a portfolio result navigates to /chart and clears the input
  test("E2E-D-SEARCH-008 — clicking a portfolio result navigates to /chart and clears the input", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    await page.getByTestId("search-input").fill("global")
    await expect(page.locator('[role="listbox"]')).toBeVisible()
    await expect(page.getByTestId("search-group-portfolios")).toBeVisible()

    // Click first result in the Portfolios group
    const firstPortfolioResult = page
      .getByTestId("search-group-portfolios")
      .getByTestId("search-result")
      .first()
    await firstPortfolioResult.click()

    await page.waitForURL("**/chart")
    expect(page.url()).toContain("/chart")
    await expect(page.getByTestId("search-input")).toHaveValue("")
    await expect(page.locator('[role="listbox"]')).not.toBeAttached()
  })

  // E2E-D-SEARCH-009 — Clicking a goal result navigates to /planning
  test("E2E-D-SEARCH-009 — clicking a goal result navigates to /planning", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    await page.getByTestId("search-input").fill("Comfortable")
    await expect(page.locator('[role="listbox"]')).toBeVisible()
    await expect(page.getByTestId("search-group-goals")).toBeVisible()

    const firstGoalResult = page
      .getByTestId("search-group-goals")
      .getByTestId("search-result")
      .first()
    await firstGoalResult.click()

    await page.waitForURL("**/planning")
    expect(page.url()).toContain("/planning")
    await expect(page.getByTestId("search-input")).toHaveValue("")
  })

  // E2E-D-SEARCH-010 — Clicking an entry result navigates to /entries
  test("E2E-D-SEARCH-010 — clicking an entry result navigates to /entries", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("search-input")).toBeVisible()

    await page.getByTestId("search-input").fill("Jan")
    await expect(page.locator('[role="listbox"]')).toBeVisible()
    await expect(page.getByTestId("search-group-entries")).toBeVisible()

    const firstEntryResult = page
      .getByTestId("search-group-entries")
      .getByTestId("search-result")
      .first()
    await firstEntryResult.click()

    await page.waitForURL("**/entries")
    expect(page.url()).toContain("/entries")
    await expect(page.getByTestId("search-input")).toHaveValue("")
  })

  // E2E-D-SEARCH-011 — Search input is visible at 1440×900 (desktop)
  test("E2E-D-SEARCH-011 — search input is visible at 1440x900 desktop", async ({
    page,
  }) => {
    await page.goto("/")
    const searchInput = page.getByTestId("search-input")
    await expect(searchInput).toBeVisible()
    // Verify it is within the viewport (not hidden via CSS)
    const box = await searchInput.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })
})
