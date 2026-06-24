import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

// EDIT-005/011 create entries and portfolios. Reset to keep the seeded
// fixture stable for other mobile/desktop tests in the run.
test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test.describe("Editors — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  // ── Entries grid (inline editor) ─────────────────────────────────────────────
  // Entries no longer use a dialog editor — the table itself becomes editable.
  // These tests target the new inline grid on iOS.

  // E2E-M-EDIT-001 — Entries grid renders within the iPhone viewport with horizontal scroll if needed
  test("E2E-M-EDIT-001 — entries grid renders within the iPhone viewport", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await page.waitForSelector('[data-testid="entries-table"]')

    const table = page.locator('[data-testid="entries-table"]')
    await expect(table).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    const box = await table.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.x).toBeGreaterThanOrEqual(-1)
    // The card itself fits in the viewport (horizontal scroll inside, if any,
    // is handled by the card's overflow rules).
    expect(box!.width).toBeLessThanOrEqual(viewportWidth + 1)
  })

  // E2E-M-EDIT-003 — Inline-editable cells are tappable and accept input on mobile
  test("E2E-M-EDIT-003 — entries grid inline cells are interactable on mobile", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await page.waitForSelector('[data-testid="entries-table"]')

    await page.tap('[data-testid="btn-edit-table"]')
    await expect(
      page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
    ).toBeVisible()

    const firstRow = page
      .locator('[data-testid="entries-table"] tbody tr')
      .first()
    const noteInput = firstRow.locator('input[aria-label^="Note for "]')
    await noteInput.tap()
    await expect(noteInput).toBeFocused()

    await page.keyboard.type("mobile test note")
    await expect(noteInput).toHaveValue("mobile test note")
  })

  // E2E-M-EDIT-005 — Save all from the inline grid commits a draft on mobile
  test("E2E-M-EDIT-005 — Save all from the inline grid commits a draft on mobile", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await page.waitForSelector('[data-testid="entries-table"]')

    const initialRowCount = await page.locator(".table tbody tr").count()

    await page.tap('[data-testid="btn-edit-table"]')
    await page.tap('[data-testid="btn-add-row"]')
    const draftRow = page
      .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
      .first()
    await expect(draftRow).toBeVisible()

    const valueInput = draftRow.locator('[data-testid^="cell-value-draft-"]')
    await valueInput.tap()
    await valueInput.fill("99999")
    await valueInput.blur()

    const saveBtn = page.locator('[data-testid="entries-grid-save"]')
    await saveBtn.scrollIntoViewIfNeeded()
    await saveBtn.click()

    await expect(
      page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
    ).not.toBeAttached()

    const finalRowCount = await page.locator(".table tbody tr").count()
    expect(finalRowCount).toBeGreaterThan(initialRowCount)
  })

  // ── Goal Editor ───────────────────────────────────────────────────────────────

  // E2E-M-EDIT-006 — Goal editor dialog fits within iPhone viewport
  test("E2E-M-EDIT-006 — goal editor dialog fits within iPhone viewport", async ({
    page,
  }) => {
    await page.goto("/planning")

    const actionBtn = page.getByTestId("action-new-goal")
    await expect(actionBtn).toBeVisible()
    await actionBtn.tap()

    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    const viewportHeight = viewport?.height ?? 852

    const box = await dialog.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewportHeight + 1
    )
  })

  // E2E-M-EDIT-007 — Goal editor name input is focusable and accepts keyboard input on mobile
  test("E2E-M-EDIT-007 — goal editor name input is focusable and accepts keyboard input on mobile", async ({
    page,
  }) => {
    await page.goto("/planning")
    await page.getByTestId("action-new-goal").tap()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    const nameInput = page.locator('input[placeholder="e.g. Coast FI"]')
    await nameInput.tap()
    await expect(nameInput).toBeFocused()

    await page.keyboard.type("Retirement 2042")
    await expect(nameInput).toHaveValue("Retirement 2042")
  })

  // E2E-M-EDIT-008 — Goal editor save/cancel buttons remain visible after keyboard rise
  // Same iOS keyboard push issue as E2E-M-EDIT-004
  test.fixme("E2E-M-EDIT-008 — goal editor footer stays above virtual keyboard (README finding #4 — iOS keyboard push)", async ({
    page,
  }) => {
    await page.goto("/planning")
    await page.getByTestId("action-new-goal").tap()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    await page.tap('input[placeholder="e.g. Coast FI"]')
    await page.waitForTimeout(500)

    const footerBottom = await page.evaluate(() => {
      const footer = document.querySelector('[data-slot="dialog-footer"]')
      return footer ? footer.getBoundingClientRect().bottom : -1
    })
    const visualViewportHeight = await page.evaluate(
      () => window.visualViewport?.height ?? window.innerHeight
    )
    expect(footerBottom).toBeLessThanOrEqual(visualViewportHeight)
  })

  // E2E-M-EDIT-009 — Goal editor color swatches are tappable on mobile
  // README finding: color swatches are 28×28px — below WCAG 2.5.5 44×44px
  test("E2E-M-EDIT-009 — goal editor color swatches are tappable on mobile", async ({
    page,
  }) => {
    await page.goto("/planning")
    await page.getByTestId("action-new-goal").tap()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    const swatches = page.locator('button[aria-label^="Color"]')
    await expect(swatches.first()).toBeVisible()

    const swatchCount = await swatches.count()
    expect(swatchCount).toBeGreaterThanOrEqual(2)

    // Document that swatches are nominally 28×28px (below WCAG minimum) — finding.
    // Allow a small tolerance for sub-pixel rounding on high-DPI mobile viewports.
    const firstSwatchBox = await swatches.first().boundingBox()
    expect(firstSwatchBox?.width ?? 0).toBeGreaterThanOrEqual(27)
    expect(firstSwatchBox?.height ?? 0).toBeGreaterThanOrEqual(27)

    // Tap the second swatch (different from default)
    await swatches.nth(1).tap()

    // The second swatch should now be selected (border changes)
    // We verify via aria-label that it's one of the colors in the list
    const secondColor = await swatches.nth(1).getAttribute("aria-label")
    expect(secondColor).toBeTruthy()
  })

  // ── Portfolio Editor ──────────────────────────────────────────────────────────

  // E2E-M-EDIT-010 — Portfolio editor dialog fits within iPhone viewport
  test("E2E-M-EDIT-010 — portfolio editor dialog fits within iPhone viewport", async ({
    page,
  }) => {
    await page.goto("/settings")

    await page.tap('button:has-text("Add portfolio")')
    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    const viewportHeight = viewport?.height ?? 852

    const box = await dialog.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewportHeight + 1
    )
  })

  // E2E-M-EDIT-011 — Portfolio editor can create a portfolio on mobile
  test("E2E-M-EDIT-011 — portfolio editor can create a portfolio on mobile", async ({
    page,
  }) => {
    await page.goto("/settings")

    await page.tap('button:has-text("Add portfolio")')
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    const nameInput = page.locator(
      'input[placeholder="e.g. Pension brokerage"]'
    )
    await nameInput.tap()
    await nameInput.fill("Test Mobile Portfolio")
    await nameInput.blur()

    // Create — `click()` is the resilient option on touch-emulated mobile-safari
    // when the target is inside a scroll container.
    const createBtn = page.locator(
      '.btn.btn-primary:has-text("Create portfolio")'
    )
    await createBtn.scrollIntoViewIfNeeded()
    await createBtn.click()

    // Dialog should close
    await expect(page.locator('[data-slot="dialog-content"]')).toBeHidden()

    // New portfolio should appear in the settings page. The name lives in an
    // editable text input — match by its current value (not by text content).
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const inputs = document.querySelectorAll("input.input-bare")
          return Array.from(inputs).some(
            (i) => (i as HTMLInputElement).value === "Test Mobile Portfolio"
          )
        })
      )
      .toBe(true)
  })

  // E2E-M-EDIT-012 — Closing the paste-data dialog with the X button closes it cleanly
  test("E2E-M-EDIT-012 — closing the paste-data dialog with X closes the dialog", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await page.waitForSelector('[data-testid="entries-table"]')

    await page.tap('[data-testid="btn-paste-data"]')

    const dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog).toBeVisible()

    const closeBtn = page.locator('[data-slot="dialog-close"]')
    await closeBtn.tap()

    await expect(dialog).toBeHidden()

    const focusInsideClosedDialog = await page.evaluate(() => {
      const d = document.querySelector('[data-slot="dialog-content"]')
      return d ? d.contains(document.activeElement) : false
    })
    expect(focusInsideClosedDialog).toBe(false)
  })
})
