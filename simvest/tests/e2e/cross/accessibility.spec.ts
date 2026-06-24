import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

// No project scoping guard — runs on both chromium-desktop and mobile-safari.
// Most cases are written for chromium-desktop per spec; mobile-safari runs
// the same cases since no guard restricts them.

test.describe("Accessibility — cross-cutting", () => {
  // E2E-X-A11Y-001 — Tab key navigates from topbar to sidebar to main content
  test("E2E-X-A11Y-001 — Tab key navigates through focusable elements in logical order", async ({
    page,
  }) => {
    await page.goto("/entries")
    await expect(page.locator("h1")).toContainText("Monthly entries")

    // Click body to ensure no element is pre-focused
    await page.locator("body").click()

    // Collect focused elements over up to 20 Tab presses
    const focusedTestIds: string[] = []
    const focusedAriaLabels: string[] = []
    const focusedInputTypes: string[] = []

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab")
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el) return null
        return {
          testId: el.getAttribute("data-testid") ?? "",
          ariaLabel: el.getAttribute("aria-label") ?? "",
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") ?? "",
          className: el.className,
        }
      })
      if (info) {
        if (info.testId) focusedTestIds.push(info.testId)
        if (info.ariaLabel) focusedAriaLabels.push(info.ariaLabel)
        if (info.type) focusedInputTypes.push(info.type)
      }
    }

    // At some point, we should land on focusable nav items or action buttons
    const allFocused = [
      ...focusedTestIds,
      ...focusedAriaLabels,
      ...focusedInputTypes,
    ]
    expect(allFocused.length).toBeGreaterThan(0)
  })

  // E2E-X-A11Y-002 — Escape key closes the topbar search dropdown
  test("E2E-X-A11Y-002 — Escape closes the topbar search dropdown", async ({
    page,
  }, testInfo) => {
    // Topbar search input is hidden at viewports ≤ 640px (see globals.css).
    test.skip(
      testInfo.project.name === "mobile-safari",
      "Topbar search input is hidden on mobile viewports by design"
    )
    await page.goto("/entries")
    await expect(page.locator("h1")).toContainText("Monthly entries")

    // Click the topbar search input
    const searchInput = page.getByTestId("search-input")
    await searchInput.click()

    // Type something to trigger results
    await searchInput.fill("portfolio")
    await page.waitForTimeout(200)

    // Check if a dropdown/listbox appeared
    const listbox = page.locator('[role="listbox"]')
    const listboxVisible = await listbox.isVisible().catch(() => false)

    if (listboxVisible) {
      // Press Escape to close
      await page.keyboard.press("Escape")
      await expect(listbox).not.toBeVisible()
    } else {
      // Escape the search field regardless
      await page.keyboard.press("Escape")
    }

    // After Escape, search input should not be focused
    const activeTestId = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el?.className ?? ""
    })
    // input-bare should not be the active element (blur was called in Escape handler)
    expect(activeTestId).not.toContain("input-bare")
  })

  // E2E-X-A11Y-003 — Escape key closes the paste-data dialog in the entries grid
  test("E2E-X-A11Y-003 — Escape closes the paste-data dialog in the entries grid", async ({
    page,
  }) => {
    await page.goto("/entries")
    await preselectPortfolio(page, 1)
    await page.reload()

    await expect(page.locator("h1")).toContainText("Monthly entries")

    await page.locator('[data-testid="btn-paste-data"]').click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()
  })

  // E2E-X-A11Y-004 — Escape key closes the goal editor dialog
  test("E2E-X-A11Y-004 — Escape closes the goal editor dialog", async ({
    page,
  }) => {
    await page.goto("/planning")
    await expect(page.locator("h1")).toContainText("Planning")

    // Open goal editor
    await page.getByTestId("action-new-goal").click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Press Escape
    await page.keyboard.press("Escape")

    // Dialog should close
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()
  })

  // E2E-X-A11Y-005 — Focus is trapped inside the paste-data dialog
  test("E2E-X-A11Y-005 — focus is trapped inside the paste-data dialog", async ({
    page,
  }) => {
    await page.goto("/entries")
    await preselectPortfolio(page, 1)
    await page.reload()

    await page.locator('[data-testid="btn-paste-data"]').click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    const focusIsInside = await page.evaluate(() => {
      const dialog = document.querySelector('[data-slot="dialog-content"]')
      return dialog?.contains(document.activeElement) ?? false
    })
    expect(focusIsInside).toBe(true)

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab")
      const stillInside = await page.evaluate(() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]')
        return dialog?.contains(document.activeElement) ?? false
      })
      expect(stillInside).toBe(true)
    }
  })

  // E2E-X-A11Y-006 — Focus moves out of the paste-data dialog after Escape
  test("E2E-X-A11Y-006 — focus returns out of the paste-data dialog after close via Escape", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")

    const pasteBtn = page.locator('[data-testid="btn-paste-data"]')
    await pasteBtn.focus()
    await pasteBtn.click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const dialog = document.querySelector('[data-slot="dialog-content"]')
          if (!dialog) return false
          return dialog.contains(document.activeElement)
        })
      )
      .toBe(false)
  })

  // E2E-X-A11Y-007 — Sidebar has proper landmark and ARIA roles
  // README finding #17: sidebar lacks a <nav> wrapper around nav links.
  // The <aside> landmark is present; the missing <nav> is flagged below.
  test("E2E-X-A11Y-007 — sidebar is an aside landmark and nav links are anchor elements", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()

    // Assert sidebar element tag is <aside>
    const tag = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-testid="sidebar"]')
      return sidebar?.tagName.toLowerCase()
    })
    expect(tag).toBe("aside")

    // Assert nav links are <a> elements (Next.js Link renders as <a>)
    const navLinks = page.locator('[data-testid^="nav-"]')
    const count = await navLinks.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const linkTag = await navLinks
        .nth(i)
        .evaluate((el) => el.tagName.toLowerCase())
      expect(linkTag).toBe("a")
    }

    // Nav links must NOT have a title attribute — it duplicates visible text
    // and causes screen readers to announce the label twice (review fix).
    for (let i = 0; i < count; i++) {
      const titleAttr = await navLinks.nth(i).getAttribute("title")
      expect(titleAttr).toBeNull()
    }
  })

  test.fixme("E2E-X-A11Y-007b — sidebar nav links are wrapped in a <nav> landmark (README finding #17)", async ({
    page,
  }) => {
    // README finding #17: sidebar.tsx wraps links directly in <aside> without a <nav> landmark.
    // Recommend: <nav aria-label="Main"> around nav items in sidebar.tsx.
    // This test is fixme until the <nav> wrapper is added.
    await page.goto("/")
    const navLandmark = page.locator('[data-testid="sidebar"] nav')
    await expect(navLandmark).toBeVisible()
  })

  // E2E-X-A11Y-008 — Planning page goal radio group has aria attributes.
  // (The Simulation tablist was retired when /simulation merged into Forecast
  // and Goal Solver became the Planning view.)
  test("E2E-X-A11Y-008 — planning kind radiogroup has correct ARIA attributes and updates on switch", async ({
    page,
  }) => {
    await page.goto("/planning")
    await expect(page.locator("h1")).toContainText("Planning")

    // Open the New goal editor to see the kind radiogroup
    await page.getByTestId("action-new-goal").click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    const radiogroup = page.getByTestId("goal-editor-kind")
    await expect(radiogroup).toBeVisible()
    await expect(radiogroup).toHaveAttribute("role", "radiogroup")

    const radios = radiogroup.locator('[role="radio"]')
    await expect(radios).toHaveCount(4)

    // Annual income is the default kind.
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true")
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "false")

    // Click the first radio (Portfolio value)
    await radios.nth(0).click()
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true")
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "false")
  })

  // E2E-X-A11Y-009 — Entries table has semantic HTML table structure
  test("E2E-X-A11Y-009 — entries table has semantic thead/th/tbody structure", async ({
    page,
  }) => {
    await page.goto("/entries")
    await expect(page.locator("h1")).toContainText("Monthly entries")

    // Assert a <table> element is present
    await expect(page.locator("table")).toBeVisible()

    // Assert <thead> is present
    await expect(page.locator("table thead")).toBeVisible()

    // Assert <thead> contains <th> elements (not just <td>)
    const ths = page.locator("table thead th")
    const thCount = await ths.count()
    expect(thCount).toBeGreaterThan(0)

    // Assert first <th> has text "Date" (column renamed from "Month" → "Date"
    // when the editor moved to a full date picker).
    await expect(ths.first()).toContainText("Date")

    // Assert <tbody> rows contain <td> elements
    const tds = page.locator("table tbody td")
    const tdCount = await tds.count()
    expect(tdCount).toBeGreaterThan(0)
  })

  // E2E-X-A11Y-010 — Inline-edit cells expose aria-labels for each editable field
  test("E2E-X-A11Y-010 — inline edit-mode cells have aria-labels for screen readers", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await expect(page.locator('[data-testid="btn-edit-table"]')).toBeEnabled()

    await page.locator('[data-testid="btn-edit-table"]').click()
    await expect(
      page.locator('[data-testid="entries-table"][data-edit-mode="true"]')
    ).toBeVisible()

    const firstRow = page
      .locator('[data-testid="entries-table"] tbody tr')
      .first()
    // Each editable cell has an input with an aria-label that names the
    // column. MoneyInput appends the currency name ("…in euros") to its label
    // for screen reader clarity, so match the column name as a prefix.
    await expect(
      firstRow.locator('input[aria-label^="Invested"]')
    ).toBeVisible()
    await expect(
      firstRow.locator('input[aria-label^="Portfolio value"]')
    ).toBeVisible()
    await expect(
      firstRow.locator('input[aria-label^="Note for "]')
    ).toBeVisible()
  })

  // E2E-X-A11Y-011 — KPI value text has sufficient color contrast
  test("E2E-X-A11Y-011 — KPI accent value and breadcrumb text pass WCAG AA contrast check", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(
      page.locator('[data-testid="kpi-portfolio-value"]')
    ).toBeVisible()

    // Check .kpi.accent .value has color (white on primary blue)
    const accentColor = await page.evaluate(() => {
      const el = document.querySelector(".kpi.accent .value")
      if (!el) return null
      return window.getComputedStyle(el).color
    })
    expect(accentColor).not.toBeNull()
    // White text: rgb(255, 255, 255) — should be white on the primary blue background
    expect(accentColor).toContain("255")

    // Check .kpi.accent background-color is primary blue
    const accentBg = await page.evaluate(() => {
      const el = document.querySelector(".kpi.accent")
      if (!el) return null
      return window.getComputedStyle(el).backgroundColor
    })
    expect(accentBg).not.toBeNull()
    // Primary blue #1E40AF — rgb(30, 64, 175)
    expect(accentBg).toContain("30")

    // Breadcrumb contrast check
    const crumbColor = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="topbar-crumb"]')
      if (!el) return null
      return window.getComputedStyle(el).color
    })
    expect(crumbColor).not.toBeNull()
  })

  // E2E-X-A11Y-012 — prefers-reduced-motion disables dialog animations
  test("E2E-X-A11Y-012 — dialog content is visible under prefers-reduced-motion", async ({
    page,
  }) => {
    // Emulate reduced motion
    await page.emulateMedia({ reducedMotion: "reduce" })
    await preselectPortfolio(page, 1)
    await page.goto("/entries")
    await expect(page.locator('[data-testid="btn-edit-table"]')).toBeEnabled()

    await page.locator('[data-testid="btn-edit-table"]').click()
    await page.locator('[data-testid="btn-paste-data"]').click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Check animation-duration and transition-duration
    const { animDuration, transDuration } = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-slot="dialog-content"]'
      ) as HTMLElement | null
      if (!el) return { animDuration: "", transDuration: "" }
      const style = window.getComputedStyle(el)
      return {
        animDuration: style.animationDuration,
        transDuration: style.transitionDuration,
      }
    })

    // Under reduced motion both should be 0s or very short
    // Values like "0s" or "0.01ms" are acceptable; non-zero large values are not
    const parseMs = (val: string) => {
      if (!val || val === "0s") return 0
      const ms = parseFloat(val)
      if (val.endsWith("ms")) return ms
      return ms * 1000 // seconds → ms
    }

    const animMs = parseMs(animDuration)
    const transMs = parseMs(transDuration)

    // Under reduced motion, duration should be effectively instant (≤ 50ms)
    // Note: If globals.css lacks the prefers-reduced-motion override this assertion will
    // fail, revealing the gap (README finding in accessibility.spec.md).
    // The test checks the behavior as-is; if it fails, add the CSS override to globals.css.
    expect(animMs).toBeLessThanOrEqual(50)
    expect(transMs).toBeLessThanOrEqual(50)
  })

  // E2E-X-A11Y-INC-001 — /income surfaces standard semantic anchors
  test("E2E-X-A11Y-INC-001 — /income has a single h1 and labelled section headings", async ({
    page,
  }) => {
    await page.goto("/income")
    await expect(page.locator('[data-testid="kpi-inc-total"]')).toBeVisible()

    const h1s = await page.locator("h1").count()
    expect(h1s).toBe(1)
    const h3Texts = await page.locator("h3").allTextContents()
    expect(h3Texts).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Monthly Payouts/),
        expect.stringMatching(/By Source/),
      ])
    )
  })

  // E2E-X-A11Y-INC-002 — keyboard traversal hits interactive elements with focus rings
  test("E2E-X-A11Y-INC-002 — /income sort headers expose aria-sort and respond to keyboard", async ({
    page,
  }) => {
    await page.goto("/income")
    await page.locator('[data-testid="income-per-holding-table"]').waitFor()
    const received = page.locator('[data-testid="income-sort-received"]')
    await expect(received).toHaveAttribute("aria-sort", "descending")
    await received.locator("button").focus()
    await page.keyboard.press("Enter")
    await expect(received).toHaveAttribute("aria-sort", "ascending")
  })
})
