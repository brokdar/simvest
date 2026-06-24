import { test, expect } from "../fixtures"

test.describe("Navigation — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  // E2E-M-NAV-001 — Tapping the Overview icon navigates to "/" and shows active state
  test("E2E-M-NAV-001 — tapping Overview icon navigates to / and shows active state", async ({
    page,
  }) => {
    await page.goto("/chart")
    await page.evaluate(() => localStorage.clear())

    await page.tap('[data-testid="nav-overview"]')
    await page.waitForURL("**/")

    expect(page.url()).toMatch(/\/$/)
    await expect(page.getByTestId("nav-overview")).toHaveClass(/active/)
    await expect(page.getByTestId("nav-chart")).not.toHaveClass(/active/)
    await expect(page.getByTestId("topbar-crumb")).toContainText("Overview")
  })

  // E2E-M-NAV-002 — Tapping the Growth Chart icon navigates to /chart
  test("E2E-M-NAV-002 — tapping Growth Chart icon navigates to /chart", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())

    await page.tap('[data-testid="nav-chart"]')
    await page.waitForURL("**/chart")

    expect(page.url()).toContain("/chart")
    await expect(page.getByTestId("nav-chart")).toHaveClass(/active/)
    // /chart's crumb is "Forecast" (renamed from "Growth chart").
    await expect(page.getByTestId("topbar-crumb")).toContainText("Forecast")
  })

  // E2E-M-NAV-003 — Tapping the Monthly Entries icon navigates to /entries
  test("E2E-M-NAV-003 — tapping Monthly Entries icon navigates to /entries", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())

    await page.tap('[data-testid="nav-entries"]')
    await page.waitForURL("**/entries")

    expect(page.url()).toContain("/entries")
    await expect(page.getByTestId("nav-entries")).toHaveClass(/active/)
    await expect(page.getByTestId("topbar-crumb")).toContainText(
      "Monthly entries"
    )
  })

  // E2E-M-NAV-004 — /simulation legacy redirects to /planning
  test("E2E-M-NAV-004 — /simulation redirects to /planning", async ({
    page,
  }) => {
    // The Simulation and Goals tabs were merged into a single Planning route
    // (next.config.mjs has 301 redirects for /simulation and /goals → /planning).
    // Clear localStorage via init script (instead of `goto("/")` + `evaluate`)
    // so we don't issue two back-to-back navigations — the second one races
    // with Next.js dev-mode Fast Refresh, which can re-navigate to "/" and
    // interrupt the test's goto("/simulation").
    await page.addInitScript(() => {
      try {
        window.localStorage.clear()
      } catch {
        /* about:blank — ignore */
      }
    })

    await page.goto("/simulation")
    await page.waitForURL("**/planning")

    expect(page.url()).toContain("/planning")
    await expect(page.getByTestId("nav-planning")).toHaveClass(/active/)
    await expect(page.getByTestId("topbar-crumb")).toContainText("Planning")
  })

  // E2E-M-NAV-005 — Tapping the Planning icon navigates to /planning
  test("E2E-M-NAV-005 — tapping Planning icon navigates to /planning", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())

    await page.tap('[data-testid="nav-planning"]')
    await page.waitForURL("**/planning")

    expect(page.url()).toContain("/planning")
    await expect(page.getByTestId("nav-planning")).toHaveClass(/active/)
    await expect(page.getByTestId("topbar-crumb")).toContainText("Planning")
  })

  // E2E-M-NAV-006 — Tapping the Settings icon navigates to /settings
  test("E2E-M-NAV-006 — tapping Settings icon navigates to /settings", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())

    await page.tap('[data-testid="nav-settings"]')
    await page.waitForURL("**/settings")

    expect(page.url()).toContain("/settings")
    await expect(page.getByTestId("nav-settings")).toHaveClass(/active/)
    await expect(page.getByTestId("topbar-crumb")).toContainText("Settings")
  })

  // E2E-M-NAV-007 — Active state is visually distinct (accent background) on mobile
  test("E2E-M-NAV-007 — active state has accent background on mobile", async ({
    page,
  }) => {
    await page.goto("/chart")

    const activeItem = page.getByTestId("nav-chart")
    await expect(activeItem).toHaveClass(/active/)

    const activeBg = await activeItem.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    )
    // Active background is var(--primary-50) = #EEF2FB ≈ rgb(238, 242, 251)
    expect(activeBg).not.toBe("rgba(0, 0, 0, 0)")
    expect(activeBg).not.toBe("transparent")

    // Non-active item should have a different (transparent/white) background
    const inactiveItem = page.getByTestId("nav-overview")
    const inactiveBg = await inactiveItem.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    )
    expect(activeBg).not.toBe(inactiveBg)
  })

  // E2E-M-NAV-008 — Nav links do not carry redundant title tooltips
  // (title duplicates visible text and is announced twice by screen readers)
  test("E2E-M-NAV-008 — nav links have no redundant title attribute", async ({
    page,
  }) => {
    await page.goto("/")

    const testIds = [
      "nav-overview",
      "nav-holdings",
      "nav-entries",
      "nav-income",
      "nav-chart",
      "nav-planning",
      "nav-settings",
    ]

    for (const testId of testIds) {
      const link = page.getByTestId(testId)
      const title = await link.getAttribute("title")
      expect(title).toBeNull()
    }
  })

  // E2E-M-NAV-009 — Portfolio switcher popover opens and stays within viewport
  test("E2E-M-NAV-009 — portfolio switcher popover opens and stays within viewport", async ({
    page,
  }) => {
    await page.goto("/")

    const trigger = page.locator(".pf-dd-trigger")
    await expect(trigger).toBeVisible()
    await page.tap(".pf-dd-trigger")

    // Wait for Radix Popover content to appear
    const popover = page.locator("[data-radix-popper-content-wrapper]")
    await expect(popover).toBeVisible()

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    const viewportHeight = viewport?.height ?? 852

    const box = await popover.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
    expect(box?.y).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewportHeight + 1
    )
  })

  // E2E-M-NAV-010 — Portfolio switcher can switch portfolio via tap
  test("E2E-M-NAV-010 — portfolio switcher can switch portfolio via tap", async ({
    page,
  }) => {
    await page.goto("/")

    // Get the current trigger label
    const trigger = page.locator(".pf-dd-trigger")
    const initialName = await trigger.locator(".pf-dd-name").innerText()

    await page.tap(".pf-dd-trigger")

    // Wait for options
    const opts = page.locator(".pf-dd-opt")
    await expect(opts.first()).toBeVisible()

    // Tap the first non-active option
    const optCount = await opts.count()
    let tapped = false
    for (let i = 0; i < optCount; i++) {
      const opt = opts.nth(i)
      const hasOn = await opt.evaluate((el) => el.classList.contains("on"))
      if (!hasOn) {
        await opt.tap()
        tapped = true
        break
      }
    }
    expect(tapped).toBe(true)

    // Popover should close
    const popover = page.locator("[data-radix-popper-content-wrapper]")
    await expect(popover).toBeHidden()

    // Trigger name should have changed
    const newName = await trigger.locator(".pf-dd-name").innerText()
    expect(newName).not.toBe(initialName)
  })

  // E2E-M-NAV-011 — Deep-link to /simulation redirects + activates nav-planning
  test("E2E-M-NAV-011 — deep-link to /simulation redirects and activates nav-planning", async ({
    page,
  }) => {
    await page.goto("/simulation")
    await page.waitForURL("**/planning")

    await expect(page.getByTestId("nav-planning")).toHaveClass(/active/)
  })

  // E2E-M-NAV-012 — Sequential navigation through all routes does not cause layout shift
  test("E2E-M-NAV-012 — sequential navigation through all routes does not cause layout shift", async ({
    page,
  }) => {
    await page.goto("/")

    const routes: Array<[string, string]> = [
      ["nav-chart", "**/chart"],
      ["nav-entries", "**/entries"],
      ["nav-holdings", "**/holdings"],
      ["nav-income", "**/income"],
      ["nav-planning", "**/planning"],
      ["nav-settings", "**/settings"],
      ["nav-overview", "**/"],
    ]

    const sidebar = page.locator('[data-testid="sidebar"]')

    for (const [testId, urlPattern] of routes) {
      await page.tap(`[data-testid="${testId}"]`)
      await page.waitForURL(urlPattern)

      // Sidebar width must remain 64px throughout all navigations. Use the
      // Locator-based evaluate so Playwright auto-waits for the element to be
      // attached — `document.querySelector(".sidebar")` could return null
      // briefly under heavy parallel load and produce -1.
      const sidebarWidth = await sidebar.evaluate(
        (el) => el.getBoundingClientRect().width
      )
      expect(sidebarWidth).toBeGreaterThanOrEqual(63)
      expect(sidebarWidth).toBeLessThanOrEqual(65)

      // Brand name must remain hidden
      await expect(page.locator(".brand-name")).toBeHidden()
    }
  })
})
