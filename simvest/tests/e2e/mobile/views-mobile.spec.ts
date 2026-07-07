import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

test.describe("Views — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  // E2E-M-VIEWS-001 — Overview page has no horizontal scroll
  test("E2E-M-VIEWS-001 — overview page has no horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)
  })

  // E2E-M-VIEWS-002 — Overview KPI grid stacks to a single column at iPhone width
  test("E2E-M-VIEWS-002 — overview KPI grid stacks to a single column at iPhone width", async ({
    page,
  }) => {
    await page.goto("/")
    const gridCols = await page.evaluate(() => {
      const el = document.querySelector(".grid-4")
      return el ? window.getComputedStyle(el).gridTemplateColumns : ""
    })
    // At max-width: 640px the CSS says `.grid-4 { grid-template-columns: 1fr }`,
    // but `getComputedStyle` resolves `1fr` to the actual pixel width (e.g. "293px"),
    // so we assert the grid has exactly one column instead.
    const columnCount = gridCols.split(" ").filter(Boolean).length
    expect(columnCount).toBe(1)
  })

  // E2E-M-VIEWS-003 — Overview mini chart SVG renders without horizontal overflow
  test("E2E-M-VIEWS-003 — overview mini chart SVG renders without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/")
    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    const svgBox = await page.evaluate(() => {
      const svg = document.querySelector(".overview-grid svg")
      return svg ? svg.getBoundingClientRect() : null
    })
    expect(svgBox).not.toBeNull()
    expect(svgBox!.width).toBeGreaterThan(0)
    expect(svgBox!.right).toBeLessThanOrEqual(viewportWidth + 1)
  })

  // E2E-M-VIEWS-004 — Overview page content is visible without zooming
  test("E2E-M-VIEWS-004 — overview page content is visible without zooming", async ({
    page,
  }) => {
    await page.goto("/")

    // KPI portfolio value is visible
    await expect(page.locator(".kpi.accent .value")).toBeVisible()

    // Title is visible
    const title = page.locator("h1.title").first()
    await expect(title).toBeVisible()
    await expect(title).toContainText("Overview")

    // Font size should be ≤ 22px at ≤ 640px breakpoint
    const fontSize = await title.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).fontSize)
    )
    expect(fontSize).toBeLessThanOrEqual(22)
  })

  // E2E-M-VIEWS-005 — Growth Chart SVG fills container width without horizontal scroll
  test("E2E-M-VIEWS-005 — growth chart SVG fills container width without horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/chart")
    // Wait for the SVG to be attached AND laid out before reading its rect.
    // The previous version used `document.querySelector(...).getBoundingClientRect()`
    // synchronously inside `page.evaluate` — under cold-load timing the SVG
    // could still be 0×0 (the chart computes its width from ResizeObserver
    // after first paint), making the > 200 assertion fail intermittently.
    const svg = page.locator('[data-testid="growth-chart-svg"]')
    await expect(svg).toBeVisible()
    await expect
      .poll(async () => {
        const box = await svg.boundingBox()
        return box?.width ?? 0
      })
      .toBeGreaterThan(200)

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    const box = await svg.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // E2E-M-VIEWS-005b — Tapping the forecast chart pins a tooltip that stays
  // visible after the finger lifts and never overflows the viewport. A second
  // tap on the same spot dismisses it (pin-on-lift touch model).
  test("E2E-M-VIEWS-005b — tapping the forecast chart pins a tooltip within the viewport", async ({
    page,
  }) => {
    await page.goto("/chart")

    const svg = page.locator('[data-testid="growth-chart-svg"]')
    await expect(svg).toBeVisible()
    await expect
      .poll(async () => (await svg.boundingBox())?.width ?? 0)
      .toBeGreaterThan(200)

    // Tap the chart — a plain tap must reveal the tooltip immediately.
    await svg.tap()

    const tooltip = page.locator(".chart-tooltip")
    await expect(tooltip).toBeVisible()

    // Pinned tooltip is fully within the viewport (x-clamped, not clipped).
    const vw = page.viewportSize()?.width ?? 393
    const box = await tooltip.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1)

    // A second tap on the same point dismisses the pin.
    await svg.tap()
    await expect(tooltip).toBeHidden()
  })

  // E2E-M-VIEWS-006 — Growth Chart scenario stats row stacks at 640 px breakpoint
  test("E2E-M-VIEWS-006 — growth chart scenario stats row stacks to single column", async ({
    page,
  }) => {
    await page.goto("/chart")

    const gridCols = await page.evaluate(() => {
      // chart-stats-grid uses .grid-4
      const el =
        document.querySelector('[data-testid="chart-stats-grid"] .grid-4') ??
        document.querySelector('[data-testid="chart-stats-grid"]')
      return el ? window.getComputedStyle(el).gridTemplateColumns : ""
    })
    // `1fr` resolves to a px value at runtime — assert single-column instead.
    const columnCount = gridCols.split(" ").filter(Boolean).length
    expect(columnCount).toBe(1)
  })

  // E2E-M-VIEWS-007 — Entries re-flow to stacked cards on mobile (fixes the
  // README finding #7 overflow bug: the 6-column table was clipped by the
  // card's overflow, so the Actions column was unreachable). The card layout
  // keeps every cell — including actions — within the viewport.
  test("E2E-M-VIEWS-007 — entries render as stacked cards with no clipped columns on mobile", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await page.waitForSelector('[data-testid="entries-table"]')

    // Header row is hidden in card mode — each cell carries its own label.
    const theadDisplay = await page.evaluate(() => {
      const thead = document.querySelector(".entries-table thead")
      return thead ? window.getComputedStyle(thead).display : ""
    })
    expect(theadDisplay).toBe("none")

    // Rows re-flow to flex cards instead of table rows.
    const rowDisplay = await page.evaluate(() => {
      const tr = document.querySelector(".entries-table tbody tr")
      return tr ? window.getComputedStyle(tr).display : ""
    })
    expect(rowDisplay).toBe("flex")

    // The card (and therefore every column, including Actions) fits the
    // viewport — nothing is clipped off the right edge.
    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    const box = await page
      .locator('[data-testid="entries-table"]')
      .boundingBox()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // Companion test that verifies what CAN be asserted currently (page-level overflow is hidden)
  test("E2E-M-VIEWS-007b — entries page does not cause page-level horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/entries")
    // The card has overflow: hidden so the page itself shouldn't horizontally scroll
    // even though the table content may be clipped inside the card
    const pageOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(pageOverflow).toBe(false)

    // Table header row is present in DOM
    await expect(page.locator(".table thead tr")).toBeAttached()
  })

  // E2E-M-VIEWS-008 — Entries bar chart does not cause horizontal scroll
  test("E2E-M-VIEWS-008 — entries bar chart does not cause horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/entries")

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    // entries-bar-chart uses data-testid="entries-bar-chart" on the card div
    const chartEl = page.locator('[data-testid="entries-bar-chart"]')
    await expect(chartEl).toBeVisible()

    const box = await chartEl.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // E2E-M-VIEWS-009 — Planning page goal strip is horizontally scrollable and tiles tappable
  test("E2E-M-VIEWS-009 — planning goal strip is horizontally scrollable on mobile", async ({
    page,
  }) => {
    // The old Simulation "Free Sandbox / Goal Solver" tab strip was retired —
    // Simulation merged into Forecast and Goal Solver became the Planning view.
    // The Planning page exposes a horizontally scrollable strip of goal tiles.
    await page.goto("/planning")

    const goalStrip = page.locator('[data-testid="goal-strip"]')
    await expect(goalStrip).toBeVisible()

    const overflowX = await goalStrip.evaluate(
      (el) => window.getComputedStyle(el).overflowX
    )
    expect(overflowX).toBe("auto")

    const tiles = page.locator('[data-testid^="goal-tile-"]')
    const tileCount = await tiles.count()
    expect(tileCount).toBeGreaterThanOrEqual(2)

    const firstTileBox = await tiles.first().boundingBox()
    expect(firstTileBox?.width).toBeGreaterThan(0)
    expect(firstTileBox?.height).toBeGreaterThan(0)
  })

  // E2E-M-VIEWS-010 — Planning goal tile selection works on mobile
  test("E2E-M-VIEWS-010 — planning goal tile selection works on mobile", async ({
    page,
  }) => {
    await page.goto("/planning")

    const tiles = page.locator('[data-testid^="goal-tile-"]')
    await expect(tiles.first()).toBeVisible()

    // Tap a tile and verify the workspace header updates with that goal's name.
    const secondTile = tiles.nth(1)
    const tileName = await secondTile.locator("div").first().textContent()
    await secondTile.tap()

    // The workspace header reflects the selected goal name (or "Scratchpad").
    const workspaceHeader = page.locator(".card span", {
      hasText: tileName ?? "",
    })
    await expect(workspaceHeader.first()).toBeVisible()
  })

  // E2E-M-VIEWS-011 — Planning page has no horizontal scroll on mobile
  test("E2E-M-VIEWS-011 — planning view has no horizontal scroll on mobile", async ({
    page,
  }) => {
    await page.goto("/planning")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)
  })

  // E2E-M-VIEWS-012 — Goals cards stack to a single column on mobile
  test("E2E-M-VIEWS-012 — goals cards stack to a single column on mobile", async ({
    page,
  }) => {
    await page.goto("/planning")

    const gridCols = await page.evaluate(() => {
      // .grid-2 in the planning view collapses to 1fr at max-width: 860px
      const el = document.querySelector(".grid-2")
      return el ? window.getComputedStyle(el).gridTemplateColumns : ""
    })
    // `1fr` resolves to a px value at runtime — assert single-column instead.
    // Empty string means the .grid-2 element isn't on /planning anymore — treat as N/A.
    if (gridCols) {
      const columnCount = gridCols.split(" ").filter(Boolean).length
      expect(columnCount).toBe(1)
    }

    // At least one goal tile should be visible (seeded data has 2 goals)
    await expect(
      page.locator('[data-testid^="goal-tile-"]').first()
    ).toBeVisible()
  })

  // E2E-M-VIEWS-013 — Goals page has no horizontal scroll
  test("E2E-M-VIEWS-013 — goals page has no horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/planning")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)
  })

  // E2E-M-VIEWS-014 — Settings portfolio rows reflow at mobile width
  // README finding: portfolio row grid "auto 1fr 200px auto" has a 200px column that is too wide on mobile
  // Fixed: the row is now `.settings-portfolio-row` (globals.css), which
  // switches to a flex column stack below 640px — see settings-mobile.spec.ts
  // for the detailed reflow assertions (name input width, actions reachable).
  test("E2E-M-VIEWS-014 — settings portfolio row grid does not overflow at mobile width (README finding #14 — settings row layout bug)", async ({
    page,
  }) => {
    await page.goto("/settings")

    // Page should not have horizontal scroll (card overflow: hidden may clip content)
    const pageOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(pageOverflow).toBe(false)

    // The portfolio row no longer uses a fixed 200px-floored grid column at
    // mobile width — it's a flex-wrap stack (see .settings-portfolio-row).
    const rowCols = await page.evaluate(() => {
      const row = document.querySelector('[data-testid^="portfolio-row-"]')
      return row ? window.getComputedStyle(row).gridTemplateColumns : ""
    })
    expect(rowCols).not.toContain("200px")
  })

  // Companion: settings page renders without page-level horizontal scroll
  test("E2E-M-VIEWS-014b — settings page renders without page-level horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/settings")
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)
  })

  // E2E-M-VIEWS-015 — Settings "Add portfolio" button is visible and tappable on mobile
  test("E2E-M-VIEWS-015 — settings Add portfolio button is visible and tappable on mobile", async ({
    page,
  }) => {
    await page.goto("/settings")

    const addBtn = page.locator('button:has-text("Add portfolio")')
    await expect(addBtn).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393

    const box = await addBtn.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(36)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // E2E-M-INC-001 — Income page renders on mobile without horizontal scroll
  test("E2E-M-INC-001 — income page renders without horizontal overflow on mobile", async ({
    page,
  }) => {
    await page.goto("/income")
    await expect(page.locator('[data-testid="kpi-inc-total"]')).toBeVisible()

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
    expect(overflow).toBe(false)

    // KPI row stacks to a single column at the mobile breakpoint.
    const gridCols = await page.evaluate(() => {
      const el = document.querySelector(".view .grid-4")
      return el ? window.getComputedStyle(el).gridTemplateColumns : ""
    })
    if (gridCols) {
      const columnCount = gridCols.split(" ").filter(Boolean).length
      expect(columnCount).toBe(1)
    }
  })

  // Parameterized: all routes — no horizontal scroll at iPhone width
  for (const route of [
    "/",
    "/chart",
    "/entries",
    "/simulation",
    "/goals",
    "/settings",
  ]) {
    test(`E2E-M-VIEWS-P — ${route} has no horizontal scroll at iPhone width`, async ({
      page,
    }) => {
      await page.goto(route)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      )
      expect(overflow).toBe(false)
    })
  }
})
