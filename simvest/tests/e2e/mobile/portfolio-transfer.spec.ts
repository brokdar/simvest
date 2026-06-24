import * as fs from "node:fs/promises"
import { test, expect } from "../fixtures"

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
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

/**
 * Mobile-only sanity for the *import* path. The download-event side of the
 * round-trip is exercised exhaustively on desktop (E2E-D-XFER-001/002) —
 * Playwright's `waitForEvent("download")` on mobile-safari does not always
 * fire for anchor-triggered JSON downloads, and the round-trip semantics
 * being verified here (does the dialog upload+preview+commit work under
 * touch input?) don't depend on the desktop download path. We fetch the
 * payload via `page.request` against the export route the desktop test
 * already validates, then drive the import dialog from there.
 */
test("E2E-M-XFER-001 — Import dialog round-trips on mobile", async ({
  page,
}, testInfo) => {
  // Fetch the pre-seeded portfolio 1 directly so we have a known-good
  // payload to upload through the dialog.
  const res = await page.request.get("/api/portfolios/1/export")
  expect(res.status()).toBe(200)
  const payload = await res.text()
  const filePath = testInfo.outputPath("portfolio-1.json")
  await fs.writeFile(filePath, payload, "utf8")

  await page.goto("/settings")
  await expect(page.locator("h1.title:has-text('Settings')")).toBeVisible()

  await page.getByTestId("settings-import-portfolio").click()
  await expect(page.getByTestId("portfolio-transfer-dialog")).toBeVisible()

  await page
    .getByTestId("portfolio-transfer-file-input")
    .setInputFiles(filePath)
  await expect(page.getByTestId("portfolio-transfer-counts")).toBeVisible()

  await page.getByTestId("portfolio-transfer-commit").click()
  await expect(page.getByTestId("portfolio-transfer-summary")).toBeVisible()
  await page.getByTestId("portfolio-transfer-summary-close").click()

  const rows = page.locator('[data-testid^="portfolio-row-"]')
  await expect(rows).toHaveCount(3)
})

test("E2E-M-XFER-002 — Non-Simvest JSON shows the inline error", async ({
  page,
}, testInfo) => {
  await page.goto("/settings")
  await page.getByTestId("settings-import-portfolio").click()

  const badPath = testInfo.outputPath("bogus.json")
  await fs.writeFile(badPath, JSON.stringify({ nope: true }), "utf8")
  await page.getByTestId("portfolio-transfer-file-input").setInputFiles(badPath)

  await expect(page.getByTestId("portfolio-transfer-error")).toBeVisible()
})
