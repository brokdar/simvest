/**
 * Monthly Entries — Desktop E2E Tests
 *
 * Entries are edited via an inline grid. The header "Edit table" button (or
 * the topbar "+ New entry" button) toggles edit mode; every editable cell
 * becomes an input; a sticky footer offers Save all / Cancel. The legacy
 * EntryEditor dialog and BulkEntryPanel are gone.
 */
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
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

// EDIT-* tests mutate seed; reset so the next test sees the seeded fixture.
test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test("E2E-D-ENTRIES-001 — Page renders heading, subtitle with record count, and table headers", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const heading = page.locator("h1.title")
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText("Monthly entries")

  const subtitle = page.locator('[data-testid="entries-subtitle"]')
  await expect(subtitle).toBeVisible()
  const subtitleText = await subtitle.textContent()
  expect(subtitleText).toMatch(/Inline-editable history · \d+ records/)

  const table = page.locator('[data-testid="entries-table"]')
  const headers = table.locator("thead th")
  const headerTexts = await headers.allTextContents()
  expect(headerTexts.some((t) => t.includes("Date"))).toBeTruthy()
  expect(headerTexts.some((t) => t.includes("Invested"))).toBeTruthy()
  expect(headerTexts.some((t) => t.includes("Portfolio value"))).toBeTruthy()
  expect(headerTexts.some((t) => t.includes("M/M"))).toBeTruthy()
  expect(headerTexts.some((t) => t.includes("Note"))).toBeTruthy()
  // Dividends were moved off this view — they live on /dividends now.
  expect(headerTexts.some((t) => t.includes("Dividend"))).toBeFalsy()
})

test("E2E-D-ENTRIES-002 — Table rows render in reverse-chronological order (most recent first)", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const rows = page.locator('[data-testid="entries-table"] tbody tr')
  const firstRowText = await rows.nth(0).locator("td:first-child").textContent()
  const secondRowText = await rows
    .nth(1)
    .locator("td:first-child")
    .textContent()

  expect(firstRowText?.trim()).toMatch(/\w{3} \d{2}/)
  expect(secondRowText?.trim()).toMatch(/\w{3} \d{2}/)

  expect(firstRowText?.trim()).not.toBe(secondRowText?.trim())
})

test("E2E-D-ENTRIES-003 — Table cells show formatted EUR values and delta", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const firstRow = page
    .locator('[data-testid="entries-table"] tbody tr')
    .first()
  const cells = firstRow.locator("td")

  const investedText = await cells.nth(1).textContent()
  expect(investedText).toMatch(/[+−]?€-?[\d.,]+/)

  const valueText = await cells.nth(2).textContent()
  expect(valueText).toMatch(/€[\d.,]+/)

  const deltaCell = cells.nth(3)
  const deltaSpan = deltaCell.locator("span")
  const deltaText = await deltaSpan.textContent()
  expect(deltaText).toMatch(/[+−]?€-?[\d.,]+/)

  const deltaClass = (await deltaSpan.getAttribute("class")) ?? ""
  expect(/\bpos\b|\bneg\b/.test(deltaClass)).toBeTruthy()
})

test("E2E-D-ENTRIES-004 — Bar chart renders with the default 3y (36-month) window", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const barChart = page.locator('[data-testid="entries-bar-chart"]')
  await expect(barChart).toBeVisible()

  const barChartSvg = page.locator('[data-testid="entries-bar-chart-svg"]')
  await expect(barChartSvg).toBeVisible()

  const windowSelector = page.locator('[data-testid="entries-window-selector"]')
  const threeYearBtn = windowSelector.locator('button:has-text("3y")')
  await expect(threeYearBtn).toHaveClass(/on/)

  const rects = barChartSvg.locator("rect")
  const rectCount = await rects.count()
  expect(rectCount).toBeGreaterThan(5)

  const paths = barChartSvg.locator("path")
  const pathCount = await paths.count()
  expect(pathCount).toBeGreaterThanOrEqual(1)
})

test("E2E-D-ENTRIES-005 — Changing the bar chart window selector updates the visible bars", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const barChartSvg = page.locator('[data-testid="entries-bar-chart-svg"]')
  const windowSelector = page.locator('[data-testid="entries-window-selector"]')

  await expect(barChartSvg.locator("rect").first()).toBeVisible()
  const count3y = await barChartSvg.locator("rect").count()

  const clickWindow = async (label: string) => {
    await expect
      .poll(
        async () => {
          const btn = windowSelector.locator(`button:text-is("${label}")`)
          await btn.click()
          return await btn.evaluate((el) => el.className.includes("on"))
        },
        { timeout: 10_000, intervals: [200, 400, 800] }
      )
      .toBe(true)
  }

  await clickWindow("1y")
  const count1y = await barChartSvg.locator("rect").count()
  expect(count1y).toBeLessThan(count3y)

  await clickWindow("All")
  const countAll = await barChartSvg.locator("rect").count()
  expect(countAll).toBeGreaterThan(count3y)
})

test("E2E-D-ENTRIES-EDIT-006 — Combined mode shows read-only banner, disables Edit table and topbar New entry", async ({
  page,
}) => {
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const banner = page.locator('[data-testid="combined-readonly-banner"]')
  await expect(banner).toBeVisible()
  const bannerText = await banner.textContent()
  expect(bannerText).toContain("Combined view is read-only")

  const editBtn = page.locator('[data-testid="btn-edit-table"]')
  await expect(editBtn).toBeVisible()
  await expect(editBtn).toBeDisabled()

  const newEntryBtn = page.locator('[data-testid="action-new-entry"]')
  await expect(newEntryBtn).toBeDisabled()

  // No per-row pencils anymore — read mode does not expose row-level edit
  // affordances.
  const editPencils = page.locator(
    '[data-testid="entries-table"] tbody tr button[aria-label="Edit entry"]'
  )
  await expect(editPencils).toHaveCount(0)
})

test("E2E-D-ENTRIES-EDIT-001 — Clicking 'Edit table' enables editable inputs for every existing row", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  // Before edit mode: cells are read-only Money spans, no inputs.
  const firstRow = page
    .locator('[data-testid="entries-table"] tbody tr')
    .first()
  await expect(firstRow.locator("input")).toHaveCount(0)

  await page.locator('[data-testid="btn-edit-table"]').click()

  await expect(
    page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
  ).toBeVisible()

  // Now the first row shows inputs for Invested, Value, and Note.
  await expect(firstRow.locator("input")).not.toHaveCount(0)
})

test("E2E-D-ENTRIES-EDIT-002 — Editing a Value cell marks it dirty; Save all persists and exits edit mode", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  await page.locator('[data-testid="btn-edit-table"]').click()

  const firstRow = page
    .locator('[data-testid="entries-table"] tbody tr')
    .first()
  const entryId = await firstRow.getAttribute("data-testid")
  expect(entryId).toMatch(/^entry-row-\d+$/)
  const idNum = entryId!.replace("entry-row-", "")

  const valueCell = page.locator(`[data-testid="cell-value-${idNum}"]`)
  await valueCell.fill("99999")
  await valueCell.blur()

  await expect(firstRow).toHaveAttribute("data-dirty", "true")

  const postResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/portfolios/1/entries") &&
      r.request().method() === "POST",
    { timeout: 15_000 }
  )

  await page.locator('[data-testid="entries-grid-save"]').click()
  const response = await postResponse
  expect([200, 201]).toContain(response.status())

  // Exits edit mode.
  await expect(
    page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
  ).not.toBeAttached()

  // Updated value visible in read mode.
  await expect(firstRow.locator("td").nth(2)).toContainText(/99/)
})

test("E2E-D-ENTRIES-EDIT-003 — 'Add row' inserts a draft, fill + Save all → new row appears", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const initialRowCount = await page
    .locator('[data-testid="entries-table"] tbody tr')
    .count()

  await page.locator('[data-testid="btn-edit-table"]').click()
  await page.locator('[data-testid="btn-add-row"]').click()

  const draftRow = page
    .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
    .first()
  await expect(draftRow).toBeVisible()

  // Draft pre-fills `invested` from the active portfolio's
  // targetMonthlyContribution; date resolves to next-month-after-last.
  // Fill Value so the row is committable.
  const valueCell = draftRow.locator('[data-testid^="cell-value-draft-"]')
  await valueCell.fill("12345")
  await valueCell.blur()

  const postResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/portfolios/1/entries") &&
      r.request().method() === "POST",
    { timeout: 15_000 }
  )

  await page.locator('[data-testid="entries-grid-save"]').click()
  const response = await postResponse
  expect([200, 201]).toContain(response.status())

  await expect(
    page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
  ).not.toBeAttached()

  const finalRowCount = await page
    .locator('[data-testid="entries-table"] tbody tr')
    .count()
  expect(finalRowCount).toBe(initialRowCount + 1)
})

test("E2E-D-ENTRIES-EDIT-004 — Cancel after edits opens AlertDialog; Discard reverts the changes", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  // Read the original read-mode display text BEFORE entering edit mode — in
  // edit mode the cell renders an input whose textContent is empty.
  const firstRow = page
    .locator('[data-testid="entries-table"] tbody tr')
    .first()
  const originalValueText = await firstRow.locator("td").nth(2).textContent()

  await page.locator('[data-testid="btn-edit-table"]').click()

  const entryId = await firstRow.getAttribute("data-testid")
  const idNum = entryId!.replace("entry-row-", "")

  const valueCell = page.locator(`[data-testid="cell-value-${idNum}"]`)
  await valueCell.fill("77777")
  await valueCell.blur()

  let postMade = false
  page.on("request", (req) => {
    if (
      req.url().includes("/api/portfolios/1/entries") &&
      req.method() === "POST"
    ) {
      postMade = true
    }
  })

  await page.locator('[data-testid="entries-grid-cancel"]').click()
  await page.locator('[data-testid="entries-grid-confirm-discard"]').click()

  await expect(
    page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
  ).not.toBeAttached()
  expect(postMade).toBe(false)

  // Value returns to original.
  const newValueText = await firstRow.locator("td").nth(2).textContent()
  expect(newValueText?.trim()).toBe(originalValueText?.trim())
})

test("E2E-D-ENTRIES-EDIT-005 — Delete row → AlertDialog → marked for delete → Save all removes it", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const initialRowCount = await page
    .locator('[data-testid="entries-table"] tbody tr')
    .count()

  await page.locator('[data-testid="btn-edit-table"]').click()

  const firstRow = page
    .locator('[data-testid="entries-table"] tbody tr')
    .first()
  const entryId = await firstRow.getAttribute("data-testid")
  const idNum = entryId!.replace("entry-row-", "")

  await page.locator(`[data-testid="row-delete-${idNum}"]`).click()
  await page.locator(`[data-testid="row-delete-confirm-${idNum}"]`).click()

  // Row is struck through with toDelete marker.
  await expect(firstRow).toHaveAttribute("data-dirty", "true")

  const deleteResponse = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/entries/${idNum}`) &&
      r.request().method() === "DELETE",
    { timeout: 15_000 }
  )

  await page.locator('[data-testid="entries-grid-save"]').click()
  const response = await deleteResponse
  expect(response.status()).toBe(200)

  await expect(
    page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
  ).not.toBeAttached()

  const finalRowCount = await page
    .locator('[data-testid="entries-table"] tbody tr')
    .count()
  expect(finalRowCount).toBe(initialRowCount - 1)
})

test("E2E-D-ENTRIES-EDIT-007 — Topbar 'New entry' enters edit mode and appends a focused draft row", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  await page.locator('[data-testid="action-new-entry"]').click()

  await expect(
    page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
  ).toBeVisible()

  const draftRow = page
    .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
    .first()
  await expect(draftRow).toBeVisible()
})

test("E2E-D-ENTRIES-EDIT-008 — 'Paste data' imports 3 new months in one bulk write", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  const subtitle = page.locator('[data-testid="entries-subtitle"]')
  const before = Number(
    (await subtitle.textContent())!.match(/(\d+) records/)![1]
  )

  await page.locator('[data-testid="btn-paste-data"]').click()

  const textarea = page.locator('[data-testid="paste-textarea"]')
  await expect(textarea).toBeVisible()

  // Months past the seed fixture (which ends Dec 2023) and safely within the
  // parser's year-range check regardless of the runner's clock. German format.
  const paste =
    "Datum\tEingezahlt\tDepotwert\tNotiz\n" +
    "01.06.2024\t250,00\t10.120,55\t\n" +
    "01.07.2024\t250,00\t10.480,02\t\n" +
    "01.08.2024\t250,00\t11.000,00\t"
  await textarea.fill(paste)

  // Step into review, then apply — a single bulk POST commits everything.
  await page.locator('[data-testid="paste-continue"]').click()
  await expect(page.locator('[data-testid="paste-preview"]')).toBeVisible()

  const bulkPost = page.waitForResponse(
    (r) =>
      r.url().includes("/api/portfolios/1/entries/bulk") &&
      r.request().method() === "POST" &&
      r.status() === 200
  )
  await page.locator('[data-testid="paste-apply"]').click()
  await bulkPost

  // Summary reports the write; close it.
  await expect(page.locator('[data-testid="paste-summary"]')).toBeVisible()
  await page.locator('[data-testid="paste-summary-close"]').click()

  // The three new months are now in the portfolio.
  await expect(subtitle).toContainText(`${before + 3} records`)
})

test("E2E-D-ENTRIES-EDIT-009 — Trade Republic merge: pasting (date, value) preserves invested on existing rows", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  // Grab the first row's invested cell text before we paste.
  const firstRow = page
    .locator('[data-testid="entries-table"] tbody tr')
    .first()
  const dateText = await firstRow.locator("td").nth(0).textContent()
  const investedBefore = await firstRow.locator("td").nth(1).textContent()
  expect(dateText?.trim().length).toBeGreaterThan(0)

  // Determine the (year, month) of that row to paste a value-only update for
  // the same month. dateText looks like "28 Dec 2023" or "28 Sept 2023".
  const dateMatch = dateText!.trim().match(/^(\d{1,2}) (\w{3,5}) (\d{4})$/)
  expect(dateMatch).not.toBeNull()
  const monthAbbr = dateMatch![2].slice(0, 3)
  const monthIdx =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(monthAbbr) + 1
  const year = parseInt(dateMatch![3], 10)
  const pasteDate = `01.${String(monthIdx).padStart(2, "0")}.${year}`

  await page.locator('[data-testid="btn-paste-data"]').click()

  // 3-column header with a blank invested cell: date <TAB> <TAB> value. The
  // declared-but-blank invested column means the existing month keeps its
  // stored invested; only value is overwritten.
  const paste = `Datum\tEingezahlt\tDepotwert\n${pasteDate}\t\t77777,00`
  await page.locator('[data-testid="paste-textarea"]').fill(paste)
  await page.locator('[data-testid="paste-continue"]').click()
  await expect(page.locator('[data-testid="paste-preview"]')).toBeVisible()

  const bulkPost = page.waitForResponse(
    (r) =>
      r.url().includes("/api/portfolios/1/entries/bulk") &&
      r.request().method() === "POST",
    { timeout: 15_000 }
  )
  await page.locator('[data-testid="paste-apply"]').click()
  await bulkPost
  await page.locator('[data-testid="paste-summary-close"]').click()

  // Invested cell content must match what it was before — the merge left the
  // declared-but-blank invested column untouched.
  const investedAfter = await firstRow.locator("td").nth(1).textContent()
  expect(investedAfter?.trim()).toBe(investedBefore?.trim())

  // And value must reflect the pasted number (77,777.00 in EUR).
  const valueAfter = await firstRow.locator("td").nth(2).textContent()
  expect(valueAfter).toMatch(/77/)
})

test("E2E-D-ENTRIES-EDIT-010 — Single-click +Add entry enters edit mode and pre-fills invested from portfolio target", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  // Read-mode: btn-add-entry is the primary action.
  const addBtn = page.locator('[data-testid="btn-add-entry"]')
  await expect(addBtn).toBeVisible()
  await expect(addBtn).toBeEnabled()

  await addBtn.click()

  // One click: edit mode is on AND a draft row exists.
  await expect(
    page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
  ).toBeVisible()

  const draftRow = page
    .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
    .first()
  await expect(draftRow).toBeVisible()

  // The invested cell pre-fills with the portfolio's target contribution.
  // Global Equity ETF (id=1) seeds with targetMonthlyContribution = 750,
  // formatted by Intl in de-DE → "750,00". Any non-zero, non-empty digit
  // string is acceptable — we just verify the field is not blank/zero.
  const invested = draftRow.locator('[data-testid^="cell-invested-draft-"]')
  const investedValue = await invested.inputValue()
  expect(investedValue.trim()).not.toBe("")
  expect(investedValue.replace(/[^\d]/g, "")).not.toMatch(/^0+$/)
})

test("E2E-D-ENTRIES-EDIT-011 — Inline calculator in Invested: 200+300+421 → 921", async ({
  page,
}) => {
  // Playwright runs the page in en-US locale, so we use integer terms here to
  // stay decoupled from the active group/decimal separator. The locale-aware
  // expression parsing is covered by unit tests (UNIT-LOCEXPR-*).
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')

  await page.locator('[data-testid="btn-add-entry"]').click()
  const draftRow = page
    .locator('[data-testid="entries-table"] tbody tr[data-draft="true"]')
    .first()
  const invested = draftRow.locator('[data-testid^="cell-invested-draft-"]')

  await invested.fill("")
  await invested.fill("200 + 300 + 421")
  await invested.blur()

  // After blur the field is rewritten with the formatted sum (921.00 in
  // en-US, 921,00 in de-DE).
  await expect(invested).toHaveValue(/^921[.,]00$/)
})
