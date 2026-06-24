import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

// INC-M-001 creates a holding + dividend; reset to keep the fixture stable.
test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test.describe("Income — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  // E2E-M-INC-001 — The inline "create holding from dividend" flow works on
  // iPhone: switching to the inline New sub-form stays in ONE dialog (no
  // modal-on-modal), the dialog fits the viewport, and the dividend records.
  test("E2E-M-INC-001 — create a holding inline from the dividend form on mobile", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/income")

    await page.locator('[data-testid="btn-add-dividend"]').tap()
    const dialog = page.locator('[data-testid="dividend-editor-dialog"]')
    await expect(dialog).toBeVisible()

    // Switch to the inline "New holding" sub-form — same dialog, no second
    // modal to stack on a small screen.
    await page.locator('[data-testid="dividend-holding-mode-new"]').tap()
    await expect(
      page.locator('[data-testid="dividend-new-holding-name"]')
    ).toBeVisible()

    // The single dialog (now showing the inline fields) fits the iPhone.
    const viewport = page.viewportSize()
    const vw = viewport?.width ?? 393
    const vh = viewport?.height ?? 852
    const box = await dialog.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw + 1)
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(vh + 1)

    const name = `Mobile Holding ${Date.now()}`
    await page.locator('[data-testid="dividend-new-holding-name"]').tap()
    await page.locator('[data-testid="dividend-new-holding-name"]').fill(name)

    // Submit is disabled until the new holding is valid; a successful submit
    // proves the holding was created + linked in one save.
    await page.locator('[data-testid="income-event-amount"]').fill("150")
    await page.locator('[data-testid="dividend-editor-submit"]').tap()
    await expect(dialog).toBeHidden()

    await expect(page.getByText(name).first()).toBeVisible()
  })

  // E2E-M-INC-002 — Mobile has no hover, so the cross-highlight is driven by
  // tapping a holding: that writes ?holding= and the monthly chart marks the
  // source (mirrors the desktop hover path). Tapping again clears it.
  test("E2E-M-INC-002 — tapping a holding cross-highlights the monthly chart", async ({
    page,
  }) => {
    await page.goto("/income")
    await page.locator('[data-testid="income-per-holding-table"]').waitFor()
    const chart = page.locator('[data-testid="income-monthly-chart"]')

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

    const nameButton = page
      .locator(`[data-testid="income-holding-row-${targetId}"] button`)
      .first()
    await nameButton.tap()
    await expect
      .poll(() => page.url())
      .toMatch(new RegExp(`holding=${targetId}`))
    await expect(chart).toHaveAttribute("data-highlighted-source", targetId)

    // Tap again toggles the filter off.
    await nameButton.tap()
    await expect(chart).not.toHaveAttribute("data-highlighted-source", /.+/)
  })
})
