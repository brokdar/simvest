/**
 * Holdings — Mobile E2E Tests
 *
 * On phones the 6-column table (Name, ISIN, Type, Dividends received,
 * Income (12 mo), Actions) re-flows into stacked cards — same <table> DOM,
 * same data-testids, only the presentation forks via CSS at
 * max-width: 640px (mirroring the entries grid's mobile layout). These
 * specs cover the mobile-specific behaviours: no clipped columns, reachable
 * row actions, and a tappable Income link.
 */
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

test.describe("Holdings — mobile", () => {
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

  // E2E-M-HOLD-001 — Holdings render as stacked cards with no clipped
  // columns on mobile. The old 6-column table's fixed widths (ISIN 160 +
  // Type 100 + Dividends 180 + Income 170 + Actions 80 = 690px) alone
  // exceeded a ~390px viewport, clipping the Income link and Edit/Delete
  // buttons off-screen.
  test("E2E-M-HOLD-001 — holdings render as stacked cards with no clipped columns on mobile", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/holdings")
    await page.waitForSelector('[data-testid="holdings-subtitle"]')

    const theadDisplay = await page.evaluate(() => {
      const thead = document.querySelector(".holdings-table thead")
      return thead ? window.getComputedStyle(thead).display : ""
    })
    expect(theadDisplay).toBe("none")

    const rowDisplay = await page.evaluate(() => {
      const tr = document.querySelector(".holdings-table tbody tr")
      return tr ? window.getComputedStyle(tr).display : ""
    })
    expect(rowDisplay).toBe("flex")

    // The card (and therefore every column, including Actions) fits the
    // viewport — nothing clipped off the right edge.
    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    const box = await page.locator(".holdings-table").first().boundingBox()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // E2E-M-HOLD-002 — Edit/Delete row actions are visible and fully within
  // the viewport in card mode — the core bug was the fixed-width Actions
  // column being clipped and unreachable at iPhone width.
  test("E2E-M-HOLD-002 — row edit/delete actions are reachable within the viewport", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/holdings")
    await page.waitForSelector('[data-testid="holdings-subtitle"]')

    const firstRow = page.locator('[data-testid^="holding-row-"]').first()
    const editBtn = firstRow.locator('button[aria-label^="Edit "]')
    await expect(editBtn).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    const editBox = await editBtn.boundingBox()
    expect(editBox).not.toBeNull()
    expect((editBox?.x ?? 0) + (editBox?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
    // Coarse-pointer touch target, and no longer dimmed to opacity: 0.7.
    expect(editBox?.height ?? 0).toBeGreaterThanOrEqual(40)
    const editOpacity = await editBtn.evaluate(
      (el) => window.getComputedStyle(el.parentElement!).opacity
    )
    expect(Number(editOpacity)).toBe(1)

    const deleteBtn = firstRow.locator('button[aria-label^="Delete "]')
    const deleteBox = await deleteBtn.boundingBox()
    expect(deleteBox).not.toBeNull()
    expect((deleteBox?.x ?? 0) + (deleteBox?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // E2E-M-HOLD-003 — The Income (12 mo) link stays a tappable, fully
  // on-screen target on mobile — it was one of the columns clipped off the
  // right edge by the old fixed-width table.
  test("E2E-M-HOLD-003 — income link is a tappable target within the viewport", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/holdings")
    await page.waitForSelector('[data-testid="holdings-subtitle"]')

    const incomeLink = page
      .locator('[data-testid^="holding-income-link-"]')
      .first()
    await expect(incomeLink).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    const box = await incomeLink.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
  })
})
