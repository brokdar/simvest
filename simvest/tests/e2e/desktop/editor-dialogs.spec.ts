import { test, expect } from "../fixtures"

// DIALOG-012/017/018 add/edit goals and portfolios via dialogs. Reset after
// each so subsequent tests see the seeded fixture.
test.afterEach(async ({ resetDb }) => {
  resetDb()
})

/**
 * Entries no longer use a dialog editor — adding and editing entries happens
 * inline in the editable grid (see tests/e2e/desktop/entries.spec.ts EDIT-*).
 * The Dialog primitive itself is still exercised by the goal editor, the
 * portfolio editor, and the paste-data dialog (covered in accessibility.spec).
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-007 — Goal editor opens from topbar "New goal" on /planning
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-007 — Goal editor opens from topbar New goal on /planning", async ({
  page,
}) => {
  await page.goto("/planning")

  await page.locator('button:has-text("New goal")').click()

  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()
  await expect(page.locator('[role="dialog"] h2')).toContainText("New goal")
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-008 — Goal editor color selection changes the active swatch border
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-008 — Goal editor color selection changes the active swatch border", async ({
  page,
}) => {
  await page.goto("/planning")
  await page.locator('button:has-text("New goal")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  const defaultSwatch = page.locator(
    '[role="dialog"] button[aria-label="Color #1E40AF"]'
  )
  const defaultBorderBefore = await defaultSwatch.evaluate(
    (el) => (el as HTMLElement).style.border
  )
  expect(defaultBorderBefore).toContain("2px solid")

  await page
    .locator('[role="dialog"] button[aria-label="Color #7C3AED"]')
    .click()

  const purpleSwatch = page.locator(
    '[role="dialog"] button[aria-label="Color #7C3AED"]'
  )
  const purpleBorderAfter = await purpleSwatch.evaluate(
    (el) => (el as HTMLElement).style.border
  )
  expect(purpleBorderAfter).toContain("2px solid")

  const defaultBorderAfter = await defaultSwatch.evaluate(
    (el) => (el as HTMLElement).style.border
  )
  expect(defaultBorderAfter).toContain("transparent")
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-009 — Goal editor "Create goal" disabled with empty name and annualIncome ≤ 0
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-009 — Goal editor Create goal disabled with empty name and annualIncome <= 0", async ({
  page,
}) => {
  await page.goto("/planning")
  await page.locator('button:has-text("New goal")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  await expect(
    page.locator('[role="dialog"] button:has-text("Create goal")')
  ).toBeDisabled()

  const nameInput = page.locator(
    '[role="dialog"] input[placeholder="e.g. Coast FI"]'
  )
  await nameInput.fill("My Goal")
  await expect(
    page.locator('[role="dialog"] button:has-text("Create goal")')
  ).toBeEnabled()

  const incomeInput = page.getByTestId("goal-editor-target")
  await incomeInput.fill("0")
  await expect(
    page.locator('[role="dialog"] button:has-text("Create goal")')
  ).toBeDisabled()

  await incomeInput.fill("1")
  await expect(
    page.locator('[role="dialog"] button:has-text("Create goal")')
  ).toBeEnabled()
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-010 — Portfolio editor opens from "Add portfolio" on /settings
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-010 — Portfolio editor opens from Add portfolio on /settings", async ({
  page,
}) => {
  await page.goto("/settings")

  await page.locator('button:has-text("Add portfolio")').click()

  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()
  await expect(
    page.locator('[role="dialog"] h2:has-text("New portfolio")')
  ).toBeVisible()

  await expect(
    page.locator('[role="dialog"] input[placeholder="e.g. Pension brokerage"]')
  ).toHaveValue("")

  await expect(page.getByTestId("monthly-contribution-input")).toHaveValue(
    "500.00"
  )

  const firstSwatch = page.locator(
    '[role="dialog"] button[aria-label="Color #1E40AF"]'
  )
  const firstSwatchBorder = await firstSwatch.evaluate(
    (el) => (el as HTMLElement).style.border
  )
  expect(firstSwatchBorder).toContain("2px solid")
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-011 — Portfolio editor color selection works (6-swatch palette)
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-011 — Portfolio editor color selection works (6-swatch palette)", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  const swatches = page.locator('[role="dialog"] button[aria-label^="Color "]')
  await expect(swatches).toHaveCount(6)

  await page
    .locator('[role="dialog"] button[aria-label="Color #334155"]')
    .click()

  const darkSwatch = page.locator(
    '[role="dialog"] button[aria-label="Color #334155"]'
  )
  const darkBorderAfter = await darkSwatch.evaluate(
    (el) => (el as HTMLElement).style.border
  )
  expect(darkBorderAfter).toContain("2px solid")

  const defaultSwatch = page.locator(
    '[role="dialog"] button[aria-label="Color #1E40AF"]'
  )
  const defaultBorderAfter = await defaultSwatch.evaluate(
    (el) => (el as HTMLElement).style.border
  )
  expect(defaultBorderAfter).toContain("transparent")
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-012 — Cancel/close paths discard changes for goals and portfolios
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-012 — Cancel/close paths discard changes for goals and portfolios", async ({
  page,
}) => {
  // --- GoalEditor ---
  await page.goto("/planning")
  const goalCountBefore = await page
    .locator('[data-testid^="goal-card"]')
    .count()

  await page.locator('button:has-text("New goal")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  await page
    .locator('[role="dialog"] input[placeholder="e.g. Coast FI"]')
    .fill("Cancel Test")
  await page.locator('[role="dialog"] button:has-text("Cancel")').click()
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  const goalCountAfter = await page
    .locator('[data-testid^="goal-card"]')
    .count()
  expect(goalCountAfter).toBe(goalCountBefore)

  // --- PortfolioEditor ---
  await page.goto("/settings")
  const portfolioCountBefore = await page
    .locator('[data-testid^="portfolio-row"]')
    .count()

  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  await page
    .locator('[role="dialog"] input[placeholder="e.g. Pension brokerage"]')
    .fill("Cancel Test")
  await page.locator('[role="dialog"] button:has-text("Cancel")').click()
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  const portfolioCountAfter = await page
    .locator('[data-testid^="portfolio-row"]')
    .count()
  expect(portfolioCountAfter).toBe(portfolioCountBefore)
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-013 — Escape key closes goal and portfolio dialogs
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-013 — Escape key closes goal and portfolio dialogs", async ({
  page,
}) => {
  // --- GoalEditor ---
  await page.goto("/planning")
  await page.locator('button:has-text("New goal")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  // --- PortfolioEditor ---
  await page.goto("/settings")
  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-014 — Outside-click closes goal and portfolio dialogs
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-014 — Outside-click closes goal and portfolio dialogs", async ({
  page,
}) => {
  // --- GoalEditor ---
  await page.goto("/planning")
  await page.locator('button:has-text("New goal")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()
  await page.mouse.click(10, 10)
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  // --- PortfolioEditor ---
  await page.goto("/settings")
  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()
  await page.mouse.click(10, 10)
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-015 — Only one dialog can be open at a time
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-015 — Only one dialog can be open at a time", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  const dialogCount = await page.locator('[role="dialog"]').count()
  expect(dialogCount).toBe(1)

  await page.keyboard.press("Escape")
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  await page.goto("/planning")
  await page.locator('button:has-text("New goal")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  const dialogCountGoals = await page.locator('[role="dialog"]').count()
  expect(dialogCountGoals).toBe(1)
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-017 — Portfolio editor form resets to defaults on re-open after cancel
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-017 — Portfolio editor form resets to defaults on re-open after cancel", async ({
  page,
}) => {
  await page.goto("/settings")

  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  await page
    .locator('[role="dialog"] input[placeholder="e.g. Pension brokerage"]')
    .fill("Draft Name")

  await page.keyboard.press("Escape")
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  await expect(
    page.locator('[role="dialog"] input[placeholder="e.g. Pension brokerage"]')
  ).toHaveValue("")

  await expect(page.getByTestId("monthly-contribution-input")).toHaveValue(
    "500.00"
  )
})

// ---------------------------------------------------------------------------
// E2E-D-DIALOG-018 — Goal editor form resets correctly when reopened after cancel
// ---------------------------------------------------------------------------
test("E2E-D-DIALOG-018 — Goal editor form resets to defaults when reopened after cancel", async ({
  page,
}) => {
  await page.goto("/planning")

  await page.getByTestId("action-new-goal").click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  const nameInput = page.locator('[role="dialog"] input[placeholder^="e.g."]')
  await nameInput.fill("Throwaway draft")

  const targetInput = page.getByTestId("goal-editor-target")
  await targetInput.fill("12345")

  await page.keyboard.press("Escape")
  await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

  await page.getByTestId("action-new-goal").click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

  await expect(nameInput).toHaveValue("")
  // MoneyInput renders the default (30000) locale-formatted with two decimals
  // — en-US "30,000.00" or de-DE "30.000,00". Both acceptable.
  await expect(targetInput).toHaveValue(/^30[.,]000[.,]00$/)
})
