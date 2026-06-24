import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

test.describe("Portfolio switcher — desktop", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "desktop only")

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure a clean slate before each test
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())
  })

  // E2E-D-SWITCHER-001 — Default selection is "Combined" on fresh load
  test("E2E-D-SWITCHER-001 — default selection is Combined on fresh load", async ({
    page,
  }) => {
    await page.goto("/")
    const trigger = page.getByTestId("portfolio-switcher-trigger")
    await expect(trigger).toBeVisible()

    const name = trigger.locator(".pf-dd-name")
    await expect(name).toContainText("Combined")

    const sub = trigger.locator(".pf-dd-sub")
    const subText = await sub.textContent()
    expect(subText).toMatch(/\d+\s+portfolios?/)
  })

  // E2E-D-SWITCHER-002 — Clicking trigger opens the popover with all options
  test("E2E-D-SWITCHER-002 — clicking trigger opens the popover with all options", async ({
    page,
  }) => {
    await page.goto("/")
    const trigger = page.getByTestId("portfolio-switcher-trigger")
    await expect(trigger).toBeVisible()

    await trigger.click()
    const content = page.getByTestId("portfolio-switcher-content")
    await expect(content).toBeVisible()

    // Combined option should be visible
    const combinedOpt = page.getByTestId("pf-opt-0")
    await expect(combinedOpt).toBeVisible()
    await expect(combinedOpt).toContainText("Combined")

    // Should have at least two individual portfolio options
    await expect(page.getByTestId("pf-opt-1")).toBeVisible()
    await expect(page.getByTestId("pf-opt-2")).toBeVisible()

    // Combined option has the checkmark (it is the active selection)
    await expect(
      page.getByTestId("pf-opt-0").getByTestId("pf-opt-check")
    ).toBeVisible()
  })

  // E2E-D-SWITCHER-003 — Selecting a specific portfolio updates the trigger label
  test("E2E-D-SWITCHER-003 — selecting a specific portfolio updates the trigger label", async ({
    page,
  }) => {
    await page.goto("/")
    const trigger = page.getByTestId("portfolio-switcher-trigger")
    await expect(trigger).toBeVisible()

    await trigger.click()
    await expect(page.getByTestId("portfolio-switcher-content")).toBeVisible()

    // Read the portfolio name from the first non-Combined option before clicking
    const opt1 = page.getByTestId("pf-opt-1")
    const portfolioName = await opt1.locator(".pf-dd-name").textContent()
    expect(portfolioName).toBeTruthy()

    await opt1.click()

    // Popover should close after selection
    await expect(
      page.getByTestId("portfolio-switcher-content")
    ).not.toBeVisible()

    // Trigger label should now show the selected portfolio name
    await expect(trigger.locator(".pf-dd-name")).toContainText(portfolioName!)

    // Sub-line should show a EUR compact value (last entry value)
    const sub = await trigger.locator(".pf-dd-sub").textContent()
    expect(sub).toMatch(/€[\d,.]+[kKmM]?/)
  })

  // E2E-D-SWITCHER-004 — Selection persists to localStorage
  test("E2E-D-SWITCHER-004 — selection persists to localStorage", async ({
    page,
  }) => {
    await page.goto("/")
    const trigger = page.getByTestId("portfolio-switcher-trigger")
    await expect(trigger).toBeVisible()

    await trigger.click()
    await expect(page.getByTestId("portfolio-switcher-content")).toBeVisible()
    await page.getByTestId("pf-opt-1").click()
    await expect(
      page.getByTestId("portfolio-switcher-content")
    ).not.toBeVisible()

    const stored = await page.evaluate(() =>
      localStorage.getItem("simvest.selectedPortfolio")
    )
    expect(stored).toBe("1")
  })

  // E2E-D-SWITCHER-005 — Selected portfolio survives a full page reload
  test("E2E-D-SWITCHER-005 — selected portfolio survives a full page reload", async ({
    page,
  }) => {
    await page.goto("/")
    const trigger = page.getByTestId("portfolio-switcher-trigger")
    await expect(trigger).toBeVisible()

    await trigger.click()
    await expect(page.getByTestId("portfolio-switcher-content")).toBeVisible()

    const opt1 = page.getByTestId("pf-opt-1")
    const portfolioName = await opt1.locator(".pf-dd-name").textContent()
    await opt1.click()
    await expect(
      page.getByTestId("portfolio-switcher-content")
    ).not.toBeVisible()

    // Reload the page
    await page.reload()
    await expect(page.getByTestId("portfolio-switcher-trigger")).toBeVisible()

    // The trigger should still show the same portfolio name after reload
    await expect(
      page.getByTestId("portfolio-switcher-trigger").locator(".pf-dd-name")
    ).toContainText(portfolioName!)

    // localStorage should still have the selection
    const stored = await page.evaluate(() =>
      localStorage.getItem("simvest.selectedPortfolio")
    )
    expect(stored).toBe("1")
  })

  // E2E-D-SWITCHER-006 — Selecting "Combined" restores to id 0 and shows sum sub-text
  test("E2E-D-SWITCHER-006 — selecting Combined restores to id 0 and shows sum sub-text", async ({
    page,
  }) => {
    // Simulate previous session with portfolio 1 selected
    await preselectPortfolio(page, 1)
    await page.goto("/")

    const trigger = page.getByTestId("portfolio-switcher-trigger")
    await expect(trigger).toBeVisible()
    // Should show portfolio 1's name (not "Combined")
    await expect(trigger.locator(".pf-dd-name")).not.toContainText("Combined")

    await trigger.click()
    await expect(page.getByTestId("portfolio-switcher-content")).toBeVisible()
    await page.getByTestId("pf-opt-0").click()
    await expect(
      page.getByTestId("portfolio-switcher-content")
    ).not.toBeVisible()

    await expect(trigger.locator(".pf-dd-name")).toContainText("Combined")

    const sub = await trigger.locator(".pf-dd-sub").textContent()
    expect(sub).toMatch(/\d+\s+portfolios?/)

    const stored = await page.evaluate(() =>
      localStorage.getItem("simvest.selectedPortfolio")
    )
    expect(stored).toBe("0")
  })

  // E2E-D-SWITCHER-007 — Switcher reflects selection on /chart view as well
  test("E2E-D-SWITCHER-007 — switcher reflects selection on /chart view", async ({
    page,
  }) => {
    await page.goto("/")
    const trigger = page.getByTestId("portfolio-switcher-trigger")
    await expect(trigger).toBeVisible()

    await trigger.click()
    await expect(page.getByTestId("portfolio-switcher-content")).toBeVisible()

    const opt1 = page.getByTestId("pf-opt-1")
    const portfolioName = await opt1.locator(".pf-dd-name").textContent()
    await opt1.click()
    await expect(
      page.getByTestId("portfolio-switcher-content")
    ).not.toBeVisible()

    // Navigate to /chart via the sidebar
    await page.getByTestId("nav-chart").click()
    await page.waitForURL("**/chart")

    // The chart page switcher should show the same portfolio
    await expect(
      page.getByTestId("portfolio-switcher-trigger").locator(".pf-dd-name")
    ).toContainText(portfolioName!)
  })

  // E2E-D-SWITCHER-008 — Combined view: Monthly saving shows read-only sum on /chart
  test("E2E-D-SWITCHER-008 — Combined view shows read-only monthly saving sum on /chart", async ({
    page,
  }) => {
    await page.goto("/chart")

    // In Combined mode, the monthly saving should be read-only
    const readonlyControl = page.getByTestId("monthly-saving-readonly")
    await expect(readonlyControl).toBeVisible()
    await expect(readonlyControl).toContainText("Monthly saving (sum)")
    await expect(readonlyControl).toContainText(
      "Switch to a specific portfolio in the dropdown to edit its contribution."
    )

    // There should be NO range input for monthly saving
    await expect(
      readonlyControl.locator('input[type="range"]')
    ).not.toBeAttached()
  })

  // E2E-D-SWITCHER-009 — Specific portfolio: Monthly saving shows an editable slider on /chart
  test("E2E-D-SWITCHER-009 — specific portfolio shows editable monthly saving slider on /chart", async ({
    page,
  }) => {
    // Set localStorage before navigating so the portfolio is selected on load
    await preselectPortfolio(page, 1)
    await page.goto("/chart")

    // The hint text should NOT be present
    await expect(
      page.locator(
        "text=Switch to a specific portfolio in the dropdown to edit its contribution."
      )
    ).not.toBeAttached()

    // An editable range input for monthly saving should be present
    // SliderRow renders: label "Monthly saving" + input[type="range"]
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
    await expect(page.locator('input[type="range"]').first()).toBeEnabled()
  })

  // E2E-D-SWITCHER-010 — Dropdown sub-text uses the last *valued* entry
  // (regression for the same bug fixed in the Overview view's portfolio
  // split). A future-month deposit row would otherwise zero out the
  // dropdown summary even though prior entries carry a real value.
  test("E2E-D-SWITCHER-010 — dropdown sub-text shows last valued amount, ignoring deposit-only future rows", async ({
    page,
    resetDb,
  }) => {
    // Append a future-month deposit with no recorded value to portfolio 1.
    await page.request.post("/api/portfolios/1/entries", {
      data: {
        year: 2099,
        month: 12,
        day: 31,
        invested: 1000,
        value: null,
      },
    })

    await page.goto("/")
    const trigger = page.getByTestId("portfolio-switcher-trigger")
    await trigger.click()

    const opt1 = page.getByTestId("pf-opt-1")
    const sub = await opt1.locator(".pf-dd-sub").textContent()
    // Should be a EUR amount (€ + digits/compact suffix), not the fallback dash.
    expect(sub).toMatch(/€[\d.,]+[kM]?/)
    expect(sub).not.toBe("—")

    resetDb()
  })

  // E2E-D-SWITCHER-011 — The header switcher is context-aware: it appears on
  // portfolio-scoped routes and is hidden on routes whose content ignores the
  // selection (Holdings lists all portfolios, Settings is global).
  test("E2E-D-SWITCHER-011 — switcher shows on scoped routes and is hidden on non-scoped routes", async ({
    page,
  }) => {
    const trigger = page.getByTestId("portfolio-switcher-trigger")

    // Scoped routes: present.
    for (const route of ["/", "/chart", "/entries", "/income"]) {
      await page.goto(route)
      await expect(trigger).toBeVisible()
    }

    // Non-scoped routes: absent.
    for (const route of ["/holdings", "/planning", "/settings"]) {
      await page.goto(route)
      await expect(trigger).toHaveCount(0)
    }
  })
})
