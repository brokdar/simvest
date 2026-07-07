import { test, expect } from "../fixtures"
import type { Page } from "@playwright/test"

test.describe("Navigation — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  // Open the hamburger drawer and return its locator. Below 640px the sidebar
  // rail is removed and the nav lives behind the hamburger; every navigation
  // test drives it through the drawer.
  async function openDrawer(page: Page) {
    await page.getByTestId("nav-toggle").tap()
    const drawer = page.getByTestId("mobile-drawer")
    await expect(drawer).toBeVisible()
    return drawer
  }

  // E2E-M-NAV-001 — Tapping the Overview item navigates to "/" and shows active state
  test("E2E-M-NAV-001 — tapping Overview navigates to / and shows active state", async ({
    page,
  }) => {
    await page.goto("/chart")
    await page.evaluate(() => localStorage.clear())

    const drawer = await openDrawer(page)
    await drawer.getByTestId("nav-overview").tap()
    await page.waitForURL("**/")

    expect(page.url()).toMatch(/\/$/)
    // Active state is reflected on the (route-reactive) sidebar copy; the
    // drawer has closed on navigation, so scope to the sidebar to stay
    // unambiguous.
    const sidebar = page.getByTestId("sidebar")
    await expect(sidebar.getByTestId("nav-overview")).toHaveClass(/active/)
    await expect(sidebar.getByTestId("nav-chart")).not.toHaveClass(/active/)
    // The page <h1> is the single visible title now (the breadcrumb is hidden).
    await expect(page.locator("h1.title")).toContainText("Overview")
  })

  // E2E-M-NAV-002 — Tapping the Forecast item navigates to /chart
  test("E2E-M-NAV-002 — tapping Forecast navigates to /chart", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())

    const drawer = await openDrawer(page)
    await drawer.getByTestId("nav-chart").tap()
    await page.waitForURL("**/chart")

    expect(page.url()).toContain("/chart")
    await expect(
      page.getByTestId("sidebar").getByTestId("nav-chart")
    ).toHaveClass(/active/)
    await expect(page.locator("h1.title")).toContainText("Forecast")
  })

  // E2E-M-NAV-003 — Tapping the Monthly Entries item navigates to /entries
  test("E2E-M-NAV-003 — tapping Monthly Entries navigates to /entries", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())

    const drawer = await openDrawer(page)
    await drawer.getByTestId("nav-entries").tap()
    await page.waitForURL("**/entries")

    expect(page.url()).toContain("/entries")
    await expect(
      page.getByTestId("sidebar").getByTestId("nav-entries")
    ).toHaveClass(/active/)
    await expect(page.locator("h1.title")).toContainText("Monthly entries")
  })

  // E2E-M-NAV-004 — /simulation legacy redirects to /planning
  test("E2E-M-NAV-004 — /simulation redirects to /planning", async ({
    page,
  }) => {
    // The Simulation and Goals tabs were merged into a single Planning route
    // (next.config.mjs has 301 redirects for /simulation and /goals → /planning).
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
    await expect(
      page.getByTestId("sidebar").getByTestId("nav-planning")
    ).toHaveClass(/active/)
    await expect(page.locator("h1.title")).toContainText("Planning")
  })

  // E2E-M-NAV-005 — Tapping the Planning item navigates to /planning
  test("E2E-M-NAV-005 — tapping Planning navigates to /planning", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())

    const drawer = await openDrawer(page)
    await drawer.getByTestId("nav-planning").tap()
    await page.waitForURL("**/planning")

    expect(page.url()).toContain("/planning")
    await expect(
      page.getByTestId("sidebar").getByTestId("nav-planning")
    ).toHaveClass(/active/)
    await expect(page.locator("h1.title")).toContainText("Planning")
  })

  // E2E-M-NAV-006 — Tapping the Settings item navigates to /settings
  test("E2E-M-NAV-006 — tapping Settings navigates to /settings", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())

    const drawer = await openDrawer(page)
    await drawer.getByTestId("nav-settings").tap()
    await page.waitForURL("**/settings")

    expect(page.url()).toContain("/settings")
    await expect(
      page.getByTestId("sidebar").getByTestId("nav-settings")
    ).toHaveClass(/active/)
    await expect(page.locator("h1.title")).toContainText("Settings")
  })

  // E2E-M-NAV-007 — Active state is visually distinct (accent background) in the drawer
  test("E2E-M-NAV-007 — active state has accent background on mobile", async ({
    page,
  }) => {
    await page.goto("/chart")

    const drawer = await openDrawer(page)
    const activeItem = drawer.getByTestId("nav-chart")
    await expect(activeItem).toHaveClass(/active/)

    const activeBg = await activeItem.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    )
    // Active background is var(--primary-50) = #EEF2FB ≈ rgb(238, 242, 251)
    expect(activeBg).not.toBe("rgba(0, 0, 0, 0)")
    expect(activeBg).not.toBe("transparent")

    // Non-active item should have a different (transparent/white) background
    const inactiveBg = await drawer
      .getByTestId("nav-overview")
      .evaluate((el) => window.getComputedStyle(el).backgroundColor)
    expect(activeBg).not.toBe(inactiveBg)
  })

  // E2E-M-NAV-008 — Nav links do not carry redundant title tooltips
  // (title duplicates visible text and is announced twice by screen readers)
  test("E2E-M-NAV-008 — nav links have no redundant title attribute", async ({
    page,
  }) => {
    await page.goto("/")
    const drawer = await openDrawer(page)

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
      const title = await drawer.getByTestId(testId).getAttribute("title")
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

    await expect(
      page.getByTestId("sidebar").getByTestId("nav-planning")
    ).toHaveClass(/active/)
  })

  // E2E-M-NAV-012 — Sequential navigation through all routes does not shift the layout
  test("E2E-M-NAV-012 — sequential navigation through all routes does not cause layout shift", async ({
    page,
  }) => {
    await page.goto("/")

    const routes: Array<[string, string, string]> = [
      ["nav-chart", "**/chart", "Forecast"],
      ["nav-entries", "**/entries", "Monthly entries"],
      ["nav-holdings", "**/holdings", "Holdings"],
      ["nav-income", "**/income", "Income"],
      ["nav-planning", "**/planning", "Planning"],
      ["nav-settings", "**/settings", "Settings"],
      ["nav-overview", "**/", "Overview"],
    ]

    const topbar = page.getByTestId("topbar")
    const viewportWidth = page.viewportSize()?.width ?? 393

    for (const [testId, urlPattern, title] of routes) {
      const drawer = await openDrawer(page)
      await drawer.getByTestId(testId).tap()
      await page.waitForURL(urlPattern)

      // Single-column layout: no rail, so the topbar spans the full viewport
      // width and starts at the left edge on every route.
      const box = await topbar.boundingBox()
      expect(box?.x ?? 99).toBeLessThanOrEqual(1)
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(viewportWidth - 1)

      // The sidebar rail must not reappear.
      await expect(page.getByTestId("sidebar")).toBeHidden()
      await expect(page.locator("h1.title")).toContainText(title)
    }
  })

  // E2E-M-NAV-013 — Escape closes the drawer and returns focus to the hamburger
  test("E2E-M-NAV-013 — Escape closes the drawer and restores focus to the hamburger", async ({
    page,
  }) => {
    await page.goto("/")
    const toggle = page.getByTestId("nav-toggle")
    await toggle.tap()

    const drawer = page.getByTestId("mobile-drawer")
    await expect(drawer).toBeVisible()

    // Focus moved into the drawer (Radix focus trap).
    const focusInside = await drawer.evaluate((el) =>
      el.contains(document.activeElement)
    )
    expect(focusInside).toBe(true)

    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
    // Focus returns to the trigger.
    await expect(toggle).toBeFocused()
  })

  // E2E-M-NAV-014 — Tapping the backdrop closes the drawer
  test("E2E-M-NAV-014 — tapping the backdrop closes the drawer", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("nav-toggle").tap()

    const drawer = page.getByTestId("mobile-drawer")
    await expect(drawer).toBeVisible()

    // The overlay spans the viewport behind the ~280px panel; tap it to the
    // right of the panel so the tap lands on the backdrop, not the nav.
    const overlay = page.locator(".drawer-overlay")
    const viewportWidth = page.viewportSize()?.width ?? 393
    await overlay.tap({ position: { x: viewportWidth - 20, y: 300 } })

    await expect(drawer).toBeHidden()
  })

  // E2E-M-NAV-015 — Hamburger exposes correct ARIA (label, expanded, controls)
  test("E2E-M-NAV-015 — hamburger exposes aria-label / aria-expanded / aria-controls", async ({
    page,
  }) => {
    await page.goto("/")
    const toggle = page.getByTestId("nav-toggle")

    await expect(toggle).toHaveAttribute("aria-label", "Open navigation menu")
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    // Radix omits aria-controls while the dialog is closed (nothing in the
    // DOM to reference yet) — it only appears once open.

    await toggle.tap()
    const drawer = page.getByTestId("mobile-drawer")
    await expect(drawer).toBeVisible()
    await expect(toggle).toHaveAttribute("aria-expanded", "true")

    // aria-controls references the drawer content element.
    await expect(toggle).toHaveAttribute("aria-controls", /.+/)
    const drawerId = await drawer.getAttribute("id")
    const controls = await toggle.getAttribute("aria-controls")
    expect(controls).toBe(drawerId)
  })

  // E2E-M-NAV-016 — Hamburger is a >=44px touch target
  test("E2E-M-NAV-016 — hamburger is at least 44×44px", async ({ page }) => {
    await page.goto("/")
    const toggle = page.getByTestId("nav-toggle")
    await expect(toggle).toBeVisible()
    const box = await toggle.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  })
})
