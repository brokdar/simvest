import { test, expect } from "../fixtures"
import { navClick } from "../helpers"

// P5 on phones: the renamed routes, the About & data card, the confirmations.

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      /* ignore */
    }
  })
})

test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test("E2E-M-P5-C6-001 — the drawer offers Projection and Goals", async ({
  page,
}) => {
  await page.goto("/")
  await navClick(page, "nav-projection", "**/projection")
  await expect(page.locator("h1.title")).toHaveText("Projection")
  await navClick(page, "nav-goals", "**/goals")
  await expect(page.locator("h1.title")).toHaveText("Goals")
})

test("E2E-M-P5-C12-001 — About & data fits the phone and its path wraps", async ({
  page,
}) => {
  await page.goto("/settings")
  const card = page.getByTestId("about-data-card")
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByTestId("about-db-path")).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  expect(overflow).toBe(false)
  const box = await card.getByTestId("about-backup-download").boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(36)
})

test("E2E-M-P5-D6-001 — a settings change confirms with a toast on a phone", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.getByTestId("default-entry-day-first").tap()
  const toast = page.getByTestId("toast")
  await expect(toast).toHaveText("Changes saved")
  const box = await toast.boundingBox()
  const vw = page.viewportSize()!.width
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
})
