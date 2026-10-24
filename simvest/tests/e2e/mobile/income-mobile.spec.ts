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

    // The in-page "Record dividend" button is hidden on phones (de-duped
    // against the topbar +); the topbar action opens the same editor.
    await page.locator('[data-testid="action-new-dividend"]').tap()
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

  // E2E-M-INC-003 — The Per-Holding + Recent-Payouts tables re-flow into
  // stacked cards (thead hidden, rows flex) and fit the viewport with no
  // column clipped off the right edge.
  test("E2E-M-INC-003 — income tables render as stacked cards within the viewport", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/income")
    await page.locator('[data-testid="income-per-holding-table"]').waitFor()

    const viewport = page.viewportSize()
    const vw = viewport?.width ?? 393

    for (const cls of [".per-holding-table", ".recent-payouts-table"]) {
      // The recent-payouts thead is display:none; the per-holding thead is
      // clip-hidden (1x1px, position:absolute) so its sort buttons stay
      // keyboard-operable. Either way it must not occupy visual layout.
      const theadHidden = await page.evaluate((sel) => {
        const thead = document.querySelector(`${sel} thead`)
        if (!thead) return ""
        const cs = window.getComputedStyle(thead)
        if (cs.display === "none") return "hidden"
        const r = thead.getBoundingClientRect()
        return cs.position === "absolute" && r.width <= 1 && r.height <= 1
          ? "hidden"
          : `visible (${cs.display}, ${r.width}x${r.height})`
      }, cls)
      expect(theadHidden).toBe("hidden")

      const rowDisplay = await page.evaluate((sel) => {
        const tr = document.querySelector(`${sel} tbody tr`)
        return tr ? window.getComputedStyle(tr).display : ""
      }, cls)
      expect(rowDisplay).toBe("flex")

      const box = await page.locator(cls).first().boundingBox()
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw + 1)
    }
  })

  // E2E-M-INC-004 — A payout's edit/delete actions are reachable and fully
  // on-screen in card mode — before the re-flow the Actions column was clipped
  // off the right edge, so payouts could not be edited or deleted on mobile.
  test("E2E-M-INC-004 — recent-payout row actions are reachable within the viewport", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/income")
    await page.locator('[data-testid="income-recent-table"]').waitFor()

    const firstRow = page.locator('[data-testid^="income-row-"]').first()
    const editBtn = firstRow.locator('button[aria-label="Edit income event"]')
    await expect(editBtn).toBeVisible()

    const viewport = page.viewportSize()
    const vw = viewport?.width ?? 393

    const editBox = await editBtn.boundingBox()
    expect(editBox).not.toBeNull()
    expect((editBox?.x ?? 0) + (editBox?.width ?? 0)).toBeLessThanOrEqual(
      vw + 1
    )
    // Coarse-pointer target, and full contrast (not the desktop quiet opacity).
    expect(editBox?.height ?? 0).toBeGreaterThanOrEqual(40)
    const actionsOpacity = await editBtn.evaluate(
      (el) => window.getComputedStyle(el.parentElement!).opacity
    )
    expect(Number(actionsOpacity)).toBe(1)

    const deleteBox = await firstRow
      .locator('button[aria-label="Delete income event"]')
      .boundingBox()
    expect(deleteBox).not.toBeNull()
    expect((deleteBox?.x ?? 0) + (deleteBox?.width ?? 0)).toBeLessThanOrEqual(
      vw + 1
    )
  })

  // E2E-M-INC-005 — The heatmap stays usable on mobile: its scroll track keeps
  // cells at a legible/tappable width (so it overflows its own scroller rather
  // than crushing to ~10px cells), and that scroll is contained — the document
  // itself does not gain a horizontal scrollbar.
  test("E2E-M-INC-005 — heatmap scrolls horizontally with tappable cells, no page overflow", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/income")
    await page.locator('[data-testid="income-heatmap"]').waitFor()

    // The track overflows its scroll container (min-width forces a scroller)
    // rather than collapsing the month cells.
    const overflows = await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="income-heatmap"] .heatmap-scroll'
      )
      return scroll ? scroll.scrollWidth > scroll.clientWidth + 1 : false
    })
    expect(overflows).toBe(true)

    // A month cell keeps a tappable width (min ~28px), not a crushed ~10px.
    const cell = page.locator('[data-testid^="income-heatmap-cell-"]').first()
    const cellBox = await cell.boundingBox()
    expect(cellBox?.width ?? 0).toBeGreaterThanOrEqual(28)

    // The page itself does not scroll horizontally — the overflow is contained.
    const pageOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(pageOverflow).toBe(false)
  })

  // E2E-M-INC-006 — Touch users can reach the monthly-payouts breakdown: on
  // desktop it's a hover tooltip, so on mobile tapping a month must both select
  // it AND surface the per-month detail card, clamped inside the viewport.
  test("E2E-M-INC-006 — tapping a payouts-chart month shows its breakdown on-screen", async ({
    page,
  }) => {
    await page.goto("/income")
    await page.locator('[data-testid="income-monthly-chart"]').waitFor()

    // The detail card only shows once a month is tapped (no hover on touch).
    const detail = page.locator('[data-testid="income-monthly-detail"]')
    await expect(detail).toBeHidden()

    await page.locator('[data-testid^="income-bar-hit-"]').first().tap()
    await expect(detail).toBeVisible()

    const viewport = page.viewportSize()
    const vw = viewport?.width ?? 393
    const box = await detail.boundingBox()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw + 1)
  })

  // E2E-M-INC-007 — Same for the calendar heatmap: the per-month detail popover
  // is hover-only on desktop, so tapping a cell must surface it on touch, and it
  // must sit within the viewport even though the cell lives in a scroll track.
  test("E2E-M-INC-007 — tapping a heatmap cell shows its detail popover on-screen", async ({
    page,
  }) => {
    await page.goto("/income")
    await page.locator('[data-testid="income-heatmap"]').waitFor()

    const popover = page.locator('[data-testid="income-heatmap-detail"]')
    await expect(popover).toBeHidden()

    // Tap a cell that actually has a payout (empty cells label "No payouts…").
    const cellId = await page
      .locator('[data-testid^="income-heatmap-cell-"]')
      .evaluateAll((els) => {
        const withData = els.find(
          (e) => !(e.getAttribute("aria-label") ?? "").startsWith("No payouts")
        )
        return withData?.getAttribute("data-testid") ?? null
      })
    if (!cellId) test.skip(true, "no heatmap cell with a payout seeded")

    await page.locator(`[data-testid="${cellId}"]`).tap()
    await expect(popover).toBeVisible()

    const viewport = page.viewportSize()
    const vw = viewport?.width ?? 393
    const box = await popover.boundingBox()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw + 1)
  })
  // E2E-M-LO-C-001 — Touch users can drill into a month: the pinned tooltip
  // carries a 44px action that selects the month (?month=), the payouts list
  // says what it shows, and "Show all months" clears it.
  const drillCases = [
    {
      id: "E2E-M-LO-C-001",
      title: "tapping a bar",
      chart: "income-monthly-chart",
      trigger: '[data-testid^="income-bar-hit-"]',
      detail: "income-monthly-detail",
    },
    {
      id: "E2E-M-LO-C-002",
      title: "tapping a heatmap cell",
      chart: "income-heatmap",
      trigger:
        '[data-testid^="income-heatmap-cell-"]:not([aria-label^="No payouts"])',
      detail: "income-heatmap-detail",
    },
  ]
  for (const c of drillCases) {
    test(`${c.id} — ${c.title} then the tooltip action shows that month's payouts, and clears`, async ({
      page,
    }) => {
      await page.goto("/income")
      await page.locator(`[data-testid="${c.chart}"]`).waitFor()

      await page.locator(c.trigger).last().tap()
      const tooltip = page.locator(`[data-testid="${c.detail}"]`)
      const action = page.locator(`[data-testid="${c.detail}-show-month"]`)
      await expect(action).toBeVisible()
      expect((await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
        44
      )
      // The tooltip body must not swallow taps meant for the chart; only the
      // action opts back in.
      expect(
        await tooltip.evaluate((el) => getComputedStyle(el).pointerEvents)
      ).toBe("none")
      expect(
        await action.evaluate((el) => getComputedStyle(el).pointerEvents)
      ).toBe("auto")

      await action.tap()
      await expect.poll(() => page.url()).toMatch(/month=\d{4}-\d{2}/)
      const month = new URL(page.url()).searchParams.get("month")!
      const header = page.locator('[data-testid="income-month-header"]')
      await expect(header).toBeVisible()
      await expect(header).toContainText("Showing")

      // Rows of the selected month carry the highlight, no other month does.
      await expect(
        page.locator(
          `[data-testid="income-recent-table"] tr[data-month="${month}"][data-selected="true"]`
        )
      ).not.toHaveCount(0)
      await expect(
        page.locator(
          `[data-testid="income-recent-table"] tr[data-selected="true"]:not([data-month="${month}"])`
        )
      ).toHaveCount(0)
      await expect(
        page.locator(
          `[data-testid="income-recent-table"] tr[data-month="${month}"]:not([data-selected="true"])`
        )
      ).toHaveCount(0)

      await page.locator('[data-testid="income-month-clear"]').tap()
      await expect(header).toBeHidden()
      await expect.poll(() => page.url()).not.toMatch(/month=/)
      await expect(
        page.locator('[data-testid="income-recent-table"] [data-selected]')
      ).toHaveCount(0)
    })
  }
})
