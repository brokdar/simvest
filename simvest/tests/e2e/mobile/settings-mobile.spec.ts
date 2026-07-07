/**
 * Settings — Mobile E2E Tests
 *
 * The portfolio row was two independent inline-style grids — a 4-column
 * "auto 1fr minmax(90px, 200px) auto" row for name/contribution/delete and a
 * 5-column "auto 1fr auto auto auto" row for the starting-balance summary +
 * Export/Edit underneath — neither reachable from a media query. At ~390px
 * the name input's 1fr track collapsed to ~2 visible characters. The
 * Default-day and Number-format preference rows had the same problem: a
 * fixed `"1fr auto"` grid with a non-wrapping control that clipped off the
 * card's right edge. All three now live in classes (`.settings-portfolio-row`,
 * `.settings-pref-row`) that collapse below 640px — see the comments above
 * them in globals.css.
 */
import { test, expect } from "../fixtures"

test.describe("Settings — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.clear()
      } catch {
        // about:blank or restricted origin — ignore
      }
    })
  })

  // E2E-M-SET-001 — Portfolio row reflows instead of collapsing the name
  // input to a sliver. The old fixed grid squeezed the 1fr name track down
  // to ~2 visible characters at iPhone width.
  test("E2E-M-SET-001 — portfolio name input stays usably wide on mobile", async ({
    page,
  }) => {
    await page.goto("/settings")
    const firstRow = page.locator('[data-testid^="portfolio-row-"]').first()
    await expect(firstRow).toBeVisible()

    const nameInput = firstRow.locator("input.input-bare")
    await expect(nameInput).toBeVisible()

    const box = await nameInput.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(150)
  })

  // E2E-M-SET-002 — No horizontal page overflow on /settings at iPhone
  // width (covers the portfolio rows and the two preference rows).
  test("E2E-M-SET-002 — settings page has no horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/settings")
    await page.locator('[data-testid^="portfolio-row-"]').first().waitFor()

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)
  })

  // E2E-M-SET-003 — The default-entry-day control (description + segmented
  // First/Last/Custom picker) stays fully on-screen — it used to clip off
  // the card's right edge under a non-wrapping "1fr auto" grid.
  test("E2E-M-SET-003 — default-entry-day control is fully on-screen", async ({
    page,
  }) => {
    await page.goto("/settings")
    const row = page.locator('[data-testid="default-entry-day-row"]')
    await expect(row).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    const rowBox = await row.boundingBox()
    expect(rowBox).not.toBeNull()
    expect((rowBox?.x ?? 0) + (rowBox?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )

    const group = page.locator('[aria-label="Default entry day"]')
    const groupBox = await group.boundingBox()
    expect(groupBox).not.toBeNull()
    expect((groupBox?.x ?? 0) + (groupBox?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // E2E-M-SET-004 — Number-format row (description + Select) stays fully
  // on-screen and the select is no longer squeezed by a fixed minWidth: 180
  // column fighting the description text for space.
  test("E2E-M-SET-004 — number-format row is fully on-screen", async ({
    page,
  }) => {
    await page.goto("/settings")
    const row = page.locator('[data-testid="number-format-row"]')
    await expect(row).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    const select = page.locator('[data-testid="number-format-select"]')
    const box = await select.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // E2E-M-SET-005 — Portfolio row actions (Export/Edit/Delete) are all
  // reachable within the viewport at once, grouped into a single line.
  test("E2E-M-SET-005 — portfolio row actions are reachable within the viewport", async ({
    page,
  }) => {
    await page.goto("/settings")
    const firstRow = page.locator('[data-testid^="portfolio-row-"]').first()
    await expect(firstRow).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    for (const selector of [
      '[data-testid^="portfolio-export-"]',
      '[data-testid^="portfolio-edit-"]',
      'button[aria-label^="Delete "]',
    ]) {
      const btn = firstRow.locator(selector).first()
      await expect(btn).toBeVisible()
      const box = await btn.boundingBox()
      expect(box).not.toBeNull()
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        viewportWidth + 1
      )
    }
  })
})
