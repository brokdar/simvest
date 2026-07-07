import { test, expect } from "../fixtures"

test.describe("Shell — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  // E2E-M-SHELL-001 — Sidebar rail is removed and replaced by a hamburger at
  // iPhone width (the permanent 64px rail used to eat ~16% of a 390px screen).
  test("E2E-M-SHELL-001 — sidebar rail is removed, hamburger present at iPhone width", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("sidebar")).toBeHidden()

    const toggle = page.getByTestId("nav-toggle")
    await expect(toggle).toBeVisible()

    // Single-column layout: the topbar (and main content) starts at the left
    // edge with no rail offset.
    const topbarX = await page
      .getByTestId("topbar")
      .evaluate((el) => el.getBoundingClientRect().x)
    expect(topbarX).toBeLessThanOrEqual(1)
  })

  // E2E-M-SHELL-002 — Inside the drawer the brand name and section labels are
  // shown in full (the collapsed icon-rail styling does not apply there).
  test("E2E-M-SHELL-002 — drawer shows brand name and section labels", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("nav-toggle").tap()
    const drawer = page.getByTestId("mobile-drawer")
    await expect(drawer).toBeVisible()

    await expect(drawer.locator(".brand-name")).toBeVisible()
    await expect(drawer.locator(".brand-sub")).toBeVisible()

    const sections = drawer.locator(".nav-section")
    const count = await sections.count()
    expect(count).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < count; i++) {
      await expect(sections.nth(i)).toBeVisible()
    }
  })

  // E2E-M-SHELL-003 — Brand mark icon is visible inside the drawer
  test("E2E-M-SHELL-003 — brand mark icon is visible in the drawer", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("nav-toggle").tap()
    const drawer = page.getByTestId("mobile-drawer")
    await expect(drawer).toBeVisible()

    const brandMark = drawer.locator(".brand-mark")
    await expect(brandMark).toBeVisible()
    const box = await brandMark.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(31)
    expect(box?.width).toBeLessThanOrEqual(33)
    expect(box?.height).toBeGreaterThanOrEqual(31)
    expect(box?.height).toBeLessThanOrEqual(33)
  })

  // E2E-M-SHELL-004 — Drawer nav items show both icon and label text
  test("E2E-M-SHELL-004 — drawer nav items show icon and label", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("nav-toggle").tap()
    const drawer = page.getByTestId("mobile-drawer")
    await expect(drawer).toBeVisible()

    const navItems = drawer.locator(".nav-item")
    const count = await navItems.count()
    expect(count).toBeGreaterThanOrEqual(6)

    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i)
      // Label text is rendered (font-size is not collapsed to 0 like the rail).
      const fontSize = await item.evaluate(
        (el) => window.getComputedStyle(el).fontSize
      )
      expect(parseFloat(fontSize)).toBeGreaterThan(0)
      await expect(item).not.toHaveText("")

      // The .ico inside each nav item should be visible
      const ico = item.locator(".ico")
      await expect(ico).toBeVisible()
    }
  })

  // E2E-M-SHELL-005 — Drawer nav items are >=44×44px touch targets
  test("E2E-M-SHELL-005 — drawer nav items are at least 44px tall", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("nav-toggle").tap()
    const drawer = page.getByTestId("mobile-drawer")
    await expect(drawer).toBeVisible()

    const navItems = drawer.locator(".nav-item")
    const count = await navItems.count()
    expect(count).toBeGreaterThanOrEqual(6)

    for (let i = 0; i < count; i++) {
      const box = await navItems.nth(i).boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
  })

  // E2E-M-SHELL-007 — Topbar search input is hidden at 393 px
  test("E2E-M-SHELL-007 — topbar search input is hidden at 393 px", async ({
    page,
  }) => {
    await page.goto("/")
    // Search input is hidden at max-width: 640px
    await expect(page.locator(".topbar-right .input-bare")).toBeHidden()
    // Search icon adjacent to the input is also hidden
    const searchIcon = page.locator(".topbar-right .input-bare + svg")
    if ((await searchIcon.count()) > 0) {
      await expect(searchIcon).toBeHidden()
    }
  })

  // E2E-M-SHELL-008 — Notifications button is visible and reachable in the topbar
  test("E2E-M-SHELL-008 — notifications button is visible and reachable in the topbar", async ({
    page,
  }) => {
    await page.goto("/")
    const notifBtn = page.locator('button[aria-label="Notifications"]')
    await expect(notifBtn).toBeVisible()
    const box = await notifBtn.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(36)
    expect(box?.height).toBeGreaterThanOrEqual(36)
  })

  // E2E-M-SHELL-009 — The page <h1> is the single visible title; the topbar
  // breadcrumb is hidden at iPhone width (it duplicated the H1).
  test("E2E-M-SHELL-009 — page title is the H1 and breadcrumb is hidden at iPhone width", async ({
    page,
  }) => {
    await page.goto("/entries")

    const h1 = page.locator("h1.title")
    await expect(h1).toBeVisible()
    await expect(h1).toContainText("Monthly entries")

    const box = await h1.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    const viewport = page.viewportSize()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (viewport?.width ?? 393) + 1
    )

    // Breadcrumb is hidden on phone widths.
    await expect(page.getByTestId("topbar-crumb")).toBeHidden()
  })

  // E2E-M-SHELL-010 — Action button ("New entry") is visible on /entries at iPhone width
  test("E2E-M-SHELL-010 — action button (New entry) is visible on /entries at iPhone width", async ({
    page,
  }) => {
    await page.goto("/entries")
    const actionBtn = page.getByTestId("action-new-entry")
    await expect(actionBtn).toBeVisible()

    const box = await actionBtn.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(36)
    expect(box?.width).toBeGreaterThan(0)

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })

  // E2E-M-SHELL-011 — Sidebar collapses to the 64 px icon rail at the 980 px
  // breakpoint (the 641–980px range is unchanged by the phone drawer work).
  test("E2E-M-SHELL-011 — sidebar transitions to 64 px exactly at the 980 px breakpoint", async ({
    page,
  }) => {
    // Start above the breakpoint
    await page.setViewportSize({ width: 981, height: 900 })
    await page.goto("/")

    // Full sidebar at 981px
    await expect(page.locator(".brand-name")).toBeVisible()
    const widthAbove = await page.evaluate(
      () =>
        document.querySelector(".sidebar")?.getBoundingClientRect().width ?? -1
    )
    expect(widthAbove).toBeGreaterThanOrEqual(245)
    expect(widthAbove).toBeLessThanOrEqual(250)

    // Drop to exactly 980px
    await page.setViewportSize({ width: 980, height: 900 })

    // Icon strip at 980px
    await expect(page.locator(".brand-name")).toBeHidden()
    const widthAt = await page.evaluate(
      () =>
        document.querySelector(".sidebar")?.getBoundingClientRect().width ?? -1
    )
    expect(widthAt).toBeGreaterThanOrEqual(63)
    expect(widthAt).toBeLessThanOrEqual(65)
  })

  // E2E-M-SHELL-012 — Portfolio switcher flex-shrinks (no fixed 180px floor)
  // and stays within the viewport so the bell + action remain reachable.
  test("E2E-M-SHELL-012 — portfolio switcher flex-shrinks and fits within the viewport", async ({
    page,
  }) => {
    await page.goto("/entries")
    const trigger = page.locator(".pf-dd-trigger")
    await expect(trigger).toBeVisible()

    const box = await trigger.boundingBox()
    expect(box?.width).toBeGreaterThan(0)

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    // Trigger right edge must be within viewport, and it must not span the
    // whole width (it now shares the row with the hamburger, bell and action).
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
    expect(box?.width).toBeLessThan(viewportWidth)
  })
})
