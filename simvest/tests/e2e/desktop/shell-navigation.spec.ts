import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

test.describe("Shell navigation — desktop", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "desktop only")

  // E2E-D-NAV-001 — Sidebar renders the consolidated nav links on the Overview page
  test("E2E-D-NAV-001 — sidebar renders all expected nav links on the Overview page", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("sidebar")).toBeVisible()

    const navOverview = page.getByTestId("nav-overview")
    const navChart = page.getByTestId("nav-projection")
    const navEntries = page.getByTestId("nav-entries")
    const navPlanning = page.getByTestId("nav-goals")
    const navSettings = page.getByTestId("nav-settings")

    await expect(navOverview).toBeVisible()
    await expect(navOverview).toContainText("Overview")

    await expect(navChart).toBeVisible()
    await expect(navChart).toContainText("Projection")

    await expect(navEntries).toBeVisible()
    await expect(navEntries).toContainText("Monthly Entries")

    await expect(navPlanning).toBeVisible()
    await expect(navPlanning).toContainText("Goals")

    await expect(navSettings).toBeVisible()
    await expect(navSettings).toContainText("Settings")
  })

  // E2E-D-NAV-002 — Overview nav link is active on "/"
  test("E2E-D-NAV-002 — Overview nav link is active on /", async ({ page }) => {
    await page.goto("/")

    const navOverview = page.getByTestId("nav-overview")
    await expect(navOverview).toHaveClass(/active/)

    // No other nav item should be active
    for (const testId of [
      "nav-projection",
      "nav-entries",
      "nav-goals",
      "nav-settings",
    ]) {
      await expect(page.getByTestId(testId)).not.toHaveClass(/active/)
    }
  })

  // E2E-D-NAV-003 — Clicking "Growth Chart" navigates to /projection and updates active state
  test("E2E-D-NAV-003 — clicking Growth Chart navigates to /projection and updates active state", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("nav-projection").click()
    await page.waitForURL("**/projection")

    expect(page.url()).toContain("/projection")
    await expect(page.getByTestId("nav-projection")).toHaveClass(/active/)
    await expect(page.getByTestId("nav-overview")).not.toHaveClass(/active/)
    await expect(page.getByTestId("topbar-crumb")).toContainText("Projection")
  })

  // E2E-D-NAV-004 — Clicking "Monthly Entries" navigates to /entries
  test("E2E-D-NAV-004 — clicking Monthly Entries navigates to /entries", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("nav-entries").click()
    await page.waitForURL("**/entries")

    expect(page.url()).toContain("/entries")
    await expect(page.getByTestId("nav-entries")).toHaveClass(/active/)
    await expect(page.getByTestId("topbar-crumb")).toContainText(
      "Monthly entries"
    )
  })

  // E2E-D-NAV-005 — Clicking "Goals" navigates to /goals
  test("E2E-D-NAV-005 — clicking Goals navigates to /goals", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("nav-goals").click()
    await page.waitForURL("**/goals")

    expect(page.url()).toContain("/goals")
    await expect(page.getByTestId("nav-goals")).toHaveClass(/active/)
  })

  // E2E-D-NAV-006 — old paths redirect to the renamed routes (back-compat, C6)
  test("E2E-D-NAV-006 — /planning, /simulation and /chart redirect to the renamed routes", async ({
    page,
  }) => {
    await page.goto("/planning?goal=1")
    await page.waitForURL(/\/goals(\?|$)/)
    expect(page.url()).toContain("/goals")

    await page.goto("/chart")
    await page.waitForURL("**/projection")
    await expect(page.locator("h1.title")).toHaveText("Projection")

    await page.goto("/simulation")
    await page.waitForURL("**/goals")
    expect(page.url()).toContain("/goals")
  })

  // E2E-D-NAV-007 — Topbar breadcrumb shows "Simvest / Overview" on root
  test("E2E-D-NAV-007 — topbar breadcrumb shows Simvest / Overview on root", async ({
    page,
  }) => {
    await page.goto("/")
    const crumb = page.getByTestId("topbar-crumb")
    await expect(crumb).toBeVisible()
    await expect(crumb).toContainText("Simvest")
    await expect(crumb).toContainText("Overview")
  })

  // E2E-D-NAV-008 — "New entry" button appears only on /entries
  test("E2E-D-NAV-008 — New entry button appears only on /entries", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("action-new-entry")).not.toBeAttached()

    await page.goto("/projection")
    await expect(page.getByTestId("action-new-entry")).not.toBeAttached()

    await page.goto("/entries")
    const newEntryBtn = page.getByTestId("action-new-entry")
    await expect(newEntryBtn).toBeVisible()
    await expect(newEntryBtn).toContainText("New entry")
  })

  // E2E-D-NAV-009 — "New entry" topbar action enters edit mode and appends a draft row.
  //
  // Tests the EditorIntent context bus contract: HeaderShell calls
  // `requestNew("entry")`; EntriesView's `useEditorIntent("entry", …)`
  // subscription toggles the editable grid into edit mode and inserts a
  // new draft row.
  test("E2E-D-NAV-009 — New entry topbar action enters edit mode with a draft row", async ({
    page,
  }) => {
    // The action-new-entry button is disabled in Combined mode — seed a
    // specific portfolio in both the cookie (for SSR) and localStorage so
    // the button is enabled on first paint without a hydration flicker.
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    const newEntryBtn = page.getByTestId("action-new-entry")
    await expect(newEntryBtn).toBeEnabled()

    // Not in edit mode before the click.
    await expect(
      page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
    ).not.toBeAttached()

    await newEntryBtn.click()

    await expect(
      page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
    ).toBeVisible()
    await expect(
      page
        .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
        .first()
    ).toBeVisible()
  })

  // E2E-D-NAV-010 — "New goal" topbar action only renders on /goals and
  // opens the goal editor dialog when clicked. Tests the EditorIntent
  // context bus contract; replaces the legacy `simvest:new-goal`
  // window-event assertion.
  test("E2E-D-NAV-010 — New goal topbar action opens the goal editor on /goals", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("action-new-goal")).not.toBeAttached()

    await page.goto("/goals")
    const newGoalBtn = page.getByTestId("action-new-goal")
    await expect(newGoalBtn).toBeVisible()
    await expect(newGoalBtn).toContainText("New goal")

    await newGoalBtn.click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })

  // E2E-D-NAV-011 — Brand logo is visible in the sidebar
  test("E2E-D-NAV-011 — brand logo is visible in the sidebar", async ({
    page,
  }) => {
    await page.goto("/")
    const sidebar = page.getByTestId("sidebar")
    await expect(sidebar).toBeVisible()
    await expect(sidebar).toContainText("Simvest")
  })

  // E2E-D-NAV-012 — Direct navigation to /projection from URL bar sets correct active item
  test("E2E-D-NAV-012 — direct navigation to /projection sets correct active nav item", async ({
    page,
  }) => {
    await page.goto("/projection")
    await expect(page.getByTestId("nav-projection")).toHaveClass(/active/)
    await expect(page.getByTestId("nav-overview")).not.toHaveClass(/active/)
  })
})
