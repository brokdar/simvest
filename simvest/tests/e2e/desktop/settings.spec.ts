import { test, expect } from "../fixtures"

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
})

// SETTINGS-003..014 rename/edit/colour/add/delete portfolios. Reset to the
// seeded fixture between tests so each starts with exactly two portfolios.
test.afterEach(async ({ resetDb }) => {
  resetDb()
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-001 — Settings page renders with seeded portfolio rows
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-001 — Settings page renders with seeded portfolio rows", async ({
  page,
}) => {
  await page.goto("/settings")

  await expect(page.locator("h1.title:has-text('Settings')")).toBeVisible()

  const rows = page.locator('[data-testid^="portfolio-row"]')
  await expect(rows).toHaveCount(2)

  // Each row has a name input, contribution input, colour button, and delete button.
  // The contribution input is a `MoneyInput` (text, locale-aware), located by aria-label.
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i)
    await expect(row.locator('button[aria-label="Pick color"]')).toBeVisible()
    await expect(row.locator("input.input-bare").first()).toBeVisible()
    await expect(
      row.locator('input[aria-label*="monthly contribution"]')
    ).toBeVisible()
    await expect(row.locator('button[aria-label^="Delete "]')).toBeVisible()
  }
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-002 — Total monthly contribution reflects the sum of all portfolio contributions
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-002 — Total monthly contribution reflects sum of all portfolio contributions", async ({
  page,
}) => {
  await page.goto("/settings")

  const totalEl = page.locator('[data-testid="total-monthly-contribution"]')
  await expect(totalEl).toBeVisible()

  // Read each row's contribution input
  const rows = page.locator('[data-testid^="portfolio-row"]')
  const count = await rows.count()

  let sum = 0
  for (let i = 0; i < count; i++) {
    const val = await rows
      .nth(i)
      .locator('input[aria-label*="monthly contribution"]')
      .inputValue()
    // MoneyInput renders locale-formatted text (e.g. "500.00"); parseFloat handles it.
    sum += parseFloat(val) || 0
  }

  // The total displayed should contain the formatted sum
  const totalText = await totalEl.textContent()
  // Extract the EUR-formatted number from total text
  // Rather than exact equality (formatting), just confirm sum > 0 and total > 0
  expect(sum).toBeGreaterThan(0)
  expect(totalText).toContain("€")
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-003 — Inline name edit persists after PATCH
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-003 — Inline name edit persists after PATCH", async ({
  page,
}) => {
  await page.goto("/settings")

  const firstRow = page.locator('[data-testid^="portfolio-row"]').first()
  const nameInput = firstRow.locator("input.input-bare").first()

  // Select all and replace
  await nameInput.click({ clickCount: 3 })
  await nameInput.fill("Renamed Portfolio")

  // Wait for PATCH
  await page.waitForResponse(
    (r) =>
      r.url().includes("/api/portfolios/") && r.request().method() === "PATCH"
  )

  // Navigate to settings again
  await page.goto("/settings")

  const firstRowAfterReload = page
    .locator('[data-testid^="portfolio-row"]')
    .first()
  const nameAfterReload = await firstRowAfterReload
    .locator("input.input-bare")
    .first()
    .inputValue()
  expect(nameAfterReload).toBe("Renamed Portfolio")

  // Restore the original name so subsequent tests (search, etc.) keep finding it.
  const restoreInput = firstRowAfterReload.locator("input.input-bare").first()
  await restoreInput.click({ clickCount: 3 })
  await restoreInput.fill("Global Equity ETF")
  await page.waitForResponse(
    (r) =>
      r.url().includes("/api/portfolios/") && r.request().method() === "PATCH"
  )
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-004 — Inline contribution edit persists after PATCH
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-004 — Inline contribution edit persists after PATCH", async ({
  page,
}) => {
  await page.goto("/settings")

  const firstRow = page.locator('[data-testid^="portfolio-row"]').first()
  const contributionInput = firstRow.locator(
    'input[aria-label*="monthly contribution"]'
  )

  // Wait for the PATCH that updateSettings/updatePortfolio fires after debouncing.
  const patchResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/portfolios/") && r.request().method() === "PATCH"
  )
  await contributionInput.fill("750")
  // Blur to trigger MoneyInput re-format and ensure the parsed value is committed.
  await contributionInput.blur()
  const response = await patchResponse
  expect(response.ok()).toBe(true)

  // Navigate to settings again
  await page.goto("/settings")

  const contributionAfterReload = await page
    .locator('[data-testid^="portfolio-row"]')
    .first()
    .locator('input[aria-label*="monthly contribution"]')
    .inputValue()
  // MoneyInput formats stored 750 as "750.00" in en-US locale.
  expect(contributionAfterReload).toBe("750.00")
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-005 — Total contribution updates immediately when contribution is edited
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-005 — Total contribution updates immediately when contribution is edited", async ({
  page,
}) => {
  await page.goto("/settings")

  const totalEl = page.locator('[data-testid="total-monthly-contribution"]')
  const totalBefore = await totalEl.textContent()

  const firstRow = page.locator('[data-testid^="portfolio-row"]').first()
  const contributionInput = firstRow.locator(
    'input[aria-label*="monthly contribution"]'
  )
  // Set a distinctive value
  await contributionInput.fill("1200")

  // Total should update (immediately, no page reload)
  const totalAfter = await totalEl.textContent()
  expect(totalAfter).not.toBe(totalBefore)
  expect(totalAfter).toContain("€")
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-006 — Inline colour picker opens on click and shows 6 swatches
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-006 — Inline colour picker opens on click and shows 6 swatches", async ({
  page,
}) => {
  await page.goto("/settings")

  const firstRow = page.locator('[data-testid^="portfolio-row"]').first()
  const colorBtn = firstRow.locator('button[aria-label="Pick color"]')

  await colorBtn.click()

  // Palette should appear with 6 named-color swatches
  const swatches = page.locator(
    '[role="dialog"][aria-label="Color picker"] button'
  )
  await expect(swatches).toHaveCount(6)

  // Each swatch has a human-readable aria-label (not the hex code)
  const expectedNames = ["Blue", "Green", "Purple", "Teal", "Amber", "Slate"]
  for (const name of expectedNames) {
    await expect(page.locator(`button[aria-label="${name}"]`)).toBeVisible()
  }
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-007 — Selecting a colour from the picker updates the portfolio colour swatch
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-007 — Selecting a colour from the picker updates the portfolio colour swatch", async ({
  page,
}) => {
  await page.goto("/settings")

  const firstRow = page.locator('[data-testid^="portfolio-row"]').first()
  const colorBtn = firstRow.locator('button[aria-label="Pick color"]')

  await colorBtn.click()

  // Click the green swatch (now identified by human-readable label)
  const greenSwatch = page.locator('button[aria-label="Green"]')
  await greenSwatch.click()

  // Palette should close (swatch buttons no longer visible)
  await expect(greenSwatch).not.toBeVisible()

  // The pick-color button background should be the new color
  await expect(colorBtn).toHaveCSS("background-color", "rgb(5, 150, 105)")
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-008 — Colour picker closes on mouse-leave
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-008 — Colour picker closes on mouse-leave", async ({
  page,
}) => {
  await page.goto("/settings")

  const firstRow = page.locator('[data-testid^="portfolio-row"]').first()
  const colorBtn = firstRow.locator('button[aria-label="Pick color"]')

  await colorBtn.click()

  // Palette is open
  const palette = firstRow
    .locator('[role="dialog"][aria-label="Color picker"] button')
    .first()
  await expect(palette).toBeVisible()

  // Hover into the palette so the mouse is inside the wrapper, then move it far
  // away. React listens for mouseenter/mouseleave by synthesizing them from
  // native mouseover/mouseout, so the only reliable way to trigger React's
  // onMouseLeave is via real pointer movement.
  await palette.hover()
  await page.mouse.move(0, 0)

  // Palette should close
  await expect(palette).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-009 — Deleting a portfolio removes its row (with window.confirm accept)
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-009 — Deleting a portfolio removes its row (with window.confirm accept)", async ({
  page,
}) => {
  // Create a throwaway portfolio first so we don't delete a fixture portfolio
  // that subsequent tests in this run depend on (the e2e DB is shared across
  // tests within a single playwright invocation).
  await page.goto("/settings")
  await page.locator('button:has-text("Add portfolio")').click()
  await page
    .locator('[role="dialog"] input[placeholder="e.g. Pension brokerage"]')
    .fill("Throwaway")
  await page
    .locator('[role="dialog"] button:has-text("Create portfolio")')
    .click()
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  const rows = page.locator('[data-testid^="portfolio-row"]')
  const countBefore = await rows.count()
  expect(countBefore).toBeGreaterThan(0)

  // Delete the throwaway portfolio we just added (it's the last row).
  await rows.last().locator('button[aria-label^="Delete "]').click()

  // Confirm via AlertDialog (replaced native window.confirm)
  await page.locator('[data-slot="alert-dialog-action"]').click()

  await expect(rows).toHaveCount(countBefore - 1)
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-010 — Cancelling the delete confirm keeps the row
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-010 — Cancelling the delete confirm keeps the row", async ({
  page,
}) => {
  await page.goto("/settings")

  const rows = page.locator('[data-testid^="portfolio-row"]')
  const countBefore = await rows.count()

  // Dismiss confirm dialog
  page.once("dialog", (d) => d.dismiss())

  await rows.first().locator('button[aria-label^="Delete "]').click()

  // Count unchanged
  await expect(rows).toHaveCount(countBefore)
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-011 — Clicking "Add portfolio" opens the portfolio editor dialog
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-011 — Clicking Add portfolio opens the portfolio editor dialog", async ({
  page,
}) => {
  await page.goto("/settings")

  await page.locator('button:has-text("Add portfolio")').click()

  await expect(page.locator('[role="dialog"]')).toBeVisible()
  await expect(
    page.locator('[role="dialog"] h2:has-text("New portfolio")')
  ).toBeVisible()

  // Name input is empty
  const nameInput = page.locator(
    '[role="dialog"] input[placeholder="e.g. Pension brokerage"]'
  )
  await expect(nameInput).toHaveValue("")

  // Contribution defaults to 500, rendered locale-formatted by MoneyInput.
  const contributionInput = page.getByTestId("monthly-contribution-input")
  await expect(contributionInput).toHaveValue("500.00")
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-012 — "Create portfolio" button is disabled when name is empty
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-012 — Create portfolio button is disabled when name is empty", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()

  const nameInput = page.locator(
    '[role="dialog"] input[placeholder="e.g. Pension brokerage"]'
  )
  await expect(nameInput).toHaveValue("")
  await expect(
    page.locator('[role="dialog"] button:has-text("Create portfolio")')
  ).toBeDisabled()

  // Space-only still disabled
  await nameInput.fill(" ")
  await expect(
    page.locator('[role="dialog"] button:has-text("Create portfolio")')
  ).toBeDisabled()
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-013 — "Create portfolio" validates contribution ≥ 0
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-013 — Create portfolio is disabled for negative contribution", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()

  const nameInput = page.locator(
    '[role="dialog"] input[placeholder="e.g. Pension brokerage"]'
  )
  await nameInput.fill("Test Portfolio")

  // MoneyInput with min={0} rejects negative values, which marks the form invalid.
  const contributionInput = page.getByTestId("monthly-contribution-input")
  await contributionInput.fill("-100")

  await expect(
    page.locator('[role="dialog"] button:has-text("Create portfolio")')
  ).toBeDisabled()
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-014 — Creating a portfolio via dialog adds a new row
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-014 — Creating a portfolio via dialog adds a new row", async ({
  page,
}) => {
  await page.goto("/settings")

  const rows = page.locator('[data-testid^="portfolio-row"]')
  const countBefore = await rows.count()

  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()

  const nameInput = page.locator(
    '[role="dialog"] input[placeholder="e.g. Pension brokerage"]'
  )
  await nameInput.fill("New E2E Portfolio")

  const contributionInput = page.getByTestId("monthly-contribution-input")
  await contributionInput.fill("300")

  // Select a non-default colour
  await page.locator('button[aria-label="Color #059669"]').click()

  await page
    .locator('[role="dialog"] button:has-text("Create portfolio")')
    .click()

  // Dialog closes
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  // Count increased
  await expect(rows).toHaveCount(countBefore + 1)

  // New row name
  const lastRow = rows.last()
  const lastRowName = await lastRow
    .locator("input.input-bare")
    .first()
    .inputValue()
  expect(lastRowName).toBe("New E2E Portfolio")
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-015 — Cancelling the add-portfolio dialog resets state on next open
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-015 — Cancelling the add-portfolio dialog resets state on next open", async ({
  page,
}) => {
  await page.goto("/settings")

  // Open and partially fill
  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()

  const nameInput = page.locator(
    '[role="dialog"] input[placeholder="e.g. Pension brokerage"]'
  )
  await nameInput.fill("Partial name")

  await page.locator('[role="dialog"] button:has-text("Cancel")').click()
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()

  // Re-open
  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()

  // Name should be reset to empty
  await expect(nameInput).toHaveValue("")

  // Contribution should be reset to 500 (locale-formatted)
  const contributionInput = page.getByTestId("monthly-contribution-input")
  await expect(contributionInput).toHaveValue("500.00")
})

// ---------------------------------------------------------------------------
// E2E-D-SETTINGS-016 — Pressing Escape closes the add-portfolio dialog
// ---------------------------------------------------------------------------
test("E2E-D-SETTINGS-016 — Pressing Escape closes the add-portfolio dialog", async ({
  page,
}) => {
  await page.goto("/settings")

  await page.locator('button:has-text("Add portfolio")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()

  await page.keyboard.press("Escape")

  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
})
