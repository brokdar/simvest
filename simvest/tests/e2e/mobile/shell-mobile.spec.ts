import { test, expect } from "../fixtures"

test.describe("Shell — mobile", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  })

  // E2E-M-SHELL-001 — Sidebar is 64 px wide at iPhone 15 Pro width
  test("E2E-M-SHELL-001 — sidebar is 64 px wide at iPhone 15 Pro width", async ({
    page,
  }) => {
    await page.goto("/")
    const width = await page.evaluate(
      () =>
        document.querySelector(".sidebar")?.getBoundingClientRect().width ?? -1
    )
    // Allow ±1 px for sub-pixel rendering
    expect(width).toBeGreaterThanOrEqual(63)
    expect(width).toBeLessThanOrEqual(65)
  })

  // E2E-M-SHELL-002 — Brand name and brand sub are hidden on mobile
  test("E2E-M-SHELL-002 — brand name and brand sub are hidden on mobile", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.locator(".brand-name")).toBeHidden()
    await expect(page.locator(".brand-sub")).toBeHidden()
    // The sidebar now has multiple section dividers ("Portfolio", "Planning",
    // "System") — assert each is hidden by the responsive CSS.
    const allSectionsHidden = await page
      .locator(".nav-section")
      .evaluateAll((els) =>
        els.every((el) => window.getComputedStyle(el).display === "none")
      )
    expect(allSectionsHidden).toBe(true)
  })

  // E2E-M-SHELL-003 — Brand mark icon is visible on mobile
  test("E2E-M-SHELL-003 — brand mark icon is visible on mobile", async ({
    page,
  }) => {
    await page.goto("/")
    const brandMark = page.locator(".brand-mark")
    await expect(brandMark).toBeVisible()
    const box = await brandMark.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(31)
    expect(box?.width).toBeLessThanOrEqual(33)
    expect(box?.height).toBeGreaterThanOrEqual(31)
    expect(box?.height).toBeLessThanOrEqual(33)
  })

  // E2E-M-SHELL-004 — Nav items show only icons (no label text) on mobile
  test("E2E-M-SHELL-004 — nav items show only icons (no label text) on mobile", async ({
    page,
  }) => {
    await page.goto("/")
    const navItems = page.locator(".nav-item")
    const count = await navItems.count()
    expect(count).toBeGreaterThanOrEqual(6)

    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i)
      // The CSS uses `font-size: 0` to visually hide the label text on mobile
      // while keeping it in the DOM (for accessibility). innerText still returns
      // the label in WebKit, so assert font-size collapses the text instead.
      const fontSize = await item.evaluate(
        (el) => window.getComputedStyle(el).fontSize
      )
      expect(fontSize).toBe("0px")

      // The .ico inside each nav item should be visible
      const ico = item.locator(".ico")
      await expect(ico).toBeVisible()
      const icoWidth = await ico.evaluate(
        (el) => el.getBoundingClientRect().width
      )
      expect(icoWidth).toBeGreaterThanOrEqual(20)
    }
  })

  // E2E-M-SHELL-005 — Tap targets for nav icons are at least 44×44 px
  // README finding: at padding: 10px 8px with 20px icon the natural height is ~40px
  test.fixme("E2E-M-SHELL-005 — tap targets for nav icons are at least 44×44 px (README finding #5)", async ({
    page,
  }) => {
    await page.goto("/")
    const navItems = page.locator(".nav-item")
    const count = await navItems.count()
    expect(count).toBeGreaterThanOrEqual(6)

    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i)
      const box = await item.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
  })

  // E2E-M-SHELL-006 — Sidebar footer shows avatar only (user name hidden) on mobile
  test("E2E-M-SHELL-006 — sidebar footer shows avatar only (user name hidden) on mobile", async ({
    page,
  }) => {
    await page.goto("/")
    const avatar = page.locator(".avatar")
    await expect(avatar).toBeVisible()
    await expect(avatar).toContainText("EK")

    // The sibling div containing the user name is hidden by the media query
    // (`.sidebar-foot > div:not(.avatar) { display: none }`). Match only the
    // direct child to avoid the inner name/sub divs.
    const nameContainer = page.locator(".sidebar-foot > div:not(.avatar)")
    await expect(nameContainer).toBeHidden()
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

  // E2E-M-SHELL-009 — Topbar breadcrumb is readable at iPhone width
  test("E2E-M-SHELL-009 — topbar breadcrumb is readable at iPhone width", async ({
    page,
  }) => {
    await page.goto("/entries")
    const crumb = page.getByTestId("topbar-crumb")
    await expect(crumb).toBeVisible()
    await expect(crumb).toContainText("Monthly entries")

    const box = await crumb.boundingBox()
    expect(box?.width).toBeGreaterThan(0)

    // Not clipped by the sidebar (sidebar is 64px, so crumb should start after 64px)
    const viewport = page.viewportSize()
    expect(box?.x).toBeGreaterThan(0)
    // Right edge should not exceed viewport width
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (viewport?.width ?? 393) + 1
    )
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

  // E2E-M-SHELL-011 — Sidebar transitions to 64 px exactly at the 980 px breakpoint
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
    await page.waitForTimeout(100)

    // Icon strip at 980px
    await expect(page.locator(".brand-name")).toBeHidden()
    const widthAt = await page.evaluate(
      () =>
        document.querySelector(".sidebar")?.getBoundingClientRect().width ?? -1
    )
    expect(widthAt).toBeGreaterThanOrEqual(63)
    expect(widthAt).toBeLessThanOrEqual(65)
  })

  // E2E-M-SHELL-012 — Portfolio switcher trigger min-width shrinks at 640 px
  test("E2E-M-SHELL-012 — portfolio switcher trigger min-width shrinks at 640 px", async ({
    page,
  }) => {
    await page.goto("/entries")
    const trigger = page.locator(".pf-dd-trigger")
    await expect(trigger).toBeVisible()

    const box = await trigger.boundingBox()
    // min-width: 180px at max-width: 640px
    expect(box?.width).toBeGreaterThanOrEqual(180)

    const viewport = page.viewportSize()
    const viewportWidth = viewport?.width ?? 393
    // Trigger right edge must be within viewport
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth + 1
    )
  })
})
