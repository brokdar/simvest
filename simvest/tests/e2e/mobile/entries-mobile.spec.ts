/**
 * Monthly Entries — Mobile E2E Tests
 *
 * On phones the 6-column editable table re-flows into stacked cards (same
 * <table> DOM, same data-testids, same inline-edit controller — only the
 * presentation forks via CSS at max-width: 640px). These specs cover the
 * mobile-specific behaviours: non-wrapping dates, reachable row actions, and
 * the suppressed keyboard-pop on a new draft.
 */
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

test.describe("Entries — mobile", () => {
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

  // E2E-M-ENTRIES-001 — Read-mode dates stay on a single line (no 3-line wrap).
  test("E2E-M-ENTRIES-001 — entry date does not wrap on mobile", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await page.waitForSelector('[data-testid="entries-table"]')

    const dateCell = page
      .locator(".entries-table tbody tr .td-date > div")
      .first()
    await expect(dateCell).toBeVisible()

    const whiteSpace = await dateCell.evaluate(
      (el) => window.getComputedStyle(el).whiteSpace
    )
    expect(whiteSpace).toBe("nowrap")

    // Single text line — height stays close to one line-height, not three.
    const box = await dateCell.boundingBox()
    expect(box?.height ?? 99).toBeLessThan(30)
  })

  // E2E-M-ENTRIES-002 — Edit-mode row actions (delete) are visible and within
  // the viewport — the core bug was that the Actions column was clipped and
  // unreachable on mobile.
  test("E2E-M-ENTRIES-002 — row delete action is reachable within the viewport in edit mode", async ({
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
    const rowTestId = await firstRow.getAttribute("data-testid")
    const idNum = rowTestId!.replace("entry-row-", "")

    const deleteBtn = page.locator(`[data-testid="row-delete-${idNum}"]`)
    await expect(deleteBtn).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    const box = await deleteBtn.boundingBox()
    expect(box).not.toBeNull()
    // Fully on-screen (was clipped off the right edge before the card layout).
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
    // Coarse-pointer touch target.
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
  })

  // E2E-M-ENTRIES-003 — Adding a new entry on mobile must NOT auto-focus the
  // first cell (which would pop the on-screen keyboard immediately).
  test("E2E-M-ENTRIES-003 — new draft does not auto-focus a cell input on mobile", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await page.waitForSelector('[data-testid="entries-table"]')

    await page.tap('[data-testid="btn-add-entry"]')

    const draftRow = page
      .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
      .first()
    await expect(draftRow).toBeVisible()

    // No input inside the grid holds focus — the keyboard stays down.
    const inputFocusedInGrid = await page.evaluate(() => {
      const active = document.activeElement
      const grid = document.querySelector('[data-testid="entries-table"]')
      return !!(
        active &&
        grid &&
        grid.contains(active) &&
        active.tagName === "INPUT"
      )
    })
    expect(inputFocusedInGrid).toBe(false)
  })
})
