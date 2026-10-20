import { test, expect } from "../fixtures"
import type { Page } from "@playwright/test"

// No project scoping guard — runs on both chromium-desktop and mobile-safari.
// The theme lives in localStorage only (no DB writes), so no resetDb needed.

const isDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains("dark"))

const bodyBg = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test.describe("Theme — Light / Dark / System", () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage once per test, not on every navigation: these tests
    // reload on purpose to prove the preference survives.
    await page.addInitScript(() => {
      try {
        if (!window.sessionStorage.getItem("e2e-cleared")) {
          window.localStorage.clear()
          window.sessionStorage.setItem("e2e-cleared", "1")
        }
      } catch {
        /* about:blank — ignore */
      }
    })
  })

  test("E2E-X-THEME-001 — choosing Dark sets the theme on <html> and survives a reload", async ({
    page,
  }) => {
    await page.goto("/settings")
    const control = page.getByTestId("theme-control")
    await expect(control).toBeVisible()
    expect(await isDark(page)).toBe(false)
    const lightBg = await bodyBg(page)

    await control.getByRole("radio", { name: "Dark" }).click()
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
    await expect(control.getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(
      await page.evaluate(() => document.documentElement.style.colorScheme)
    ).toBe("dark")
    const darkBg = await bodyBg(page)
    expect(darkBg).not.toBe(lightBg)

    await page.reload()
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
    await expect(
      page.getByTestId("theme-control").getByRole("radio", { name: "Dark" })
    ).toHaveAttribute("aria-checked", "true")
    expect(await bodyBg(page)).toBe(darkBg)

    // …and it holds on another route too.
    await page.goto("/")
    expect(await isDark(page)).toBe(true)

    // Back to Light undoes it.
    await page.goto("/settings")
    await page
      .getByTestId("theme-control")
      .getByRole("radio", { name: "Light" })
      .click()
    await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/)
    await page.reload()
    expect(await isDark(page)).toBe(false)
  })

  test("E2E-X-THEME-002 — a stored Dark theme is applied before any app JS runs (no flash)", async ({
    page,
  }) => {
    await page.goto("/settings")
    await page
      .getByTestId("theme-control")
      .getByRole("radio", { name: "Dark" })
      .click()
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)

    // Block every Next.js chunk: React never hydrates, so only the inline
    // <head> script can have set the class. If it relied on a client effect,
    // the first paint would be light.
    await page.route("**/_next/static/**/*.js", (route) => route.abort())
    await page.goto("/", { waitUntil: "domcontentloaded" })
    expect(await isDark(page)).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.style.colorScheme)
    ).toBe("dark")
  })

  test("E2E-X-THEME-003 — System follows the device and switches live", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await page.goto("/settings")
    // Default preference is Light, so a dark OS alone doesn't flip it.
    expect(await isDark(page)).toBe(false)

    await page
      .getByTestId("theme-control")
      .getByRole("radio", { name: "System" })
      .click()
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
    await expect(page.getByTestId("appearance-row")).toContainText(
      "currently using the dark theme"
    )

    await page.emulateMedia({ colorScheme: "light" })
    await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/)

    await page.reload()
    expect(await isDark(page)).toBe(false)
    // Wait for hydration (SSR renders the default, Light, as checked).
    await expect(
      page.getByTestId("theme-control").getByRole("radio", { name: "System" })
    ).toHaveAttribute("aria-checked", "true")
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
  })
})
