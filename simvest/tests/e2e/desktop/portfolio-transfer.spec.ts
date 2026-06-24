import * as fs from "node:fs/promises"
import { test, expect } from "../fixtures"

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
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

test("E2E-D-XFER-001 — Export from a portfolio row downloads a Simvest JSON file", async ({
  page,
}, testInfo) => {
  await page.goto("/settings")
  await expect(page.locator("h1.title:has-text('Settings')")).toBeVisible()

  // Pre-seeded portfolio 1 is "Global Equity ETF" — exports to a
  // sanitized filename.
  const downloadPromise = page.waitForEvent("download")
  await page.getByTestId("portfolio-export-1").click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(
    /^simvest-portfolio-global-equity-etf-\d{4}-\d{2}-\d{2}\.json$/
  )

  // Persist the download so the next test step can re-upload it.
  const savedPath = testInfo.outputPath("exported.json")
  await download.saveAs(savedPath)
  const stat = await fs.stat(savedPath)
  expect(stat.size).toBeGreaterThan(50)

  // Sanity: the file parses and carries the discriminator we expect.
  const raw = await fs.readFile(savedPath, "utf8")
  const parsed = JSON.parse(raw) as { kind: string; version: number }
  expect(parsed.kind).toBe("simvest.portfolio")
  expect(parsed.version).toBe(1)
})

test("E2E-D-XFER-002 — Import dialog flows upload → preview → summary and activates the new portfolio", async ({
  page,
}, testInfo) => {
  await page.goto("/settings")

  // ── 1. Export the existing portfolio to a temp file ─────────────
  const downloadPromise = page.waitForEvent("download")
  await page.getByTestId("portfolio-export-1").click()
  const download = await downloadPromise
  const filePath = testInfo.outputPath("portfolio-1.json")
  await download.saveAs(filePath)

  // ── 2. Open the Import dialog ───────────────────────────────────
  await page.getByTestId("settings-import-portfolio").click()
  await expect(page.getByTestId("portfolio-transfer-dialog")).toBeVisible()

  // ── 3. Upload the file → preview step appears ───────────────────
  await page
    .getByTestId("portfolio-transfer-file-input")
    .setInputFiles(filePath)
  await expect(page.getByTestId("portfolio-transfer-counts")).toBeVisible()
  // The fixture's portfolio 1 has 60 entries.
  await expect(page.getByTestId("portfolio-transfer-count-entries")).toHaveText(
    "60"
  )
  await expect(
    page.getByTestId("portfolio-transfer-collision-hint")
  ).toBeVisible()

  // ── 4. Confirm → summary appears ────────────────────────────────
  await page.getByTestId("portfolio-transfer-commit").click()
  await expect(page.getByTestId("portfolio-transfer-summary")).toBeVisible()
  await expect(
    page.getByTestId("portfolio-transfer-summary-entries")
  ).toHaveText("60")

  // ── 5. Close → switcher now contains the imported portfolio ─────
  await page.getByTestId("portfolio-transfer-summary-close").click()
  await expect(page.getByTestId("portfolio-transfer-dialog")).toBeHidden()

  const rows = page.locator('[data-testid^="portfolio-row-"]')
  await expect(rows).toHaveCount(3)
})

test("E2E-D-XFER-003 — Upload of a non-Simvest JSON is rejected with an inline error", async ({
  page,
}, testInfo) => {
  await page.goto("/settings")
  await page.getByTestId("settings-import-portfolio").click()

  const badPath = testInfo.outputPath("not-a-simvest-export.json")
  await fs.writeFile(badPath, JSON.stringify({ foo: "bar" }), "utf8")

  await page.getByTestId("portfolio-transfer-file-input").setInputFiles(badPath)
  await expect(page.getByTestId("portfolio-transfer-error")).toBeVisible()
  await expect(page.getByTestId("portfolio-transfer-error")).toContainText(
    /Not a Simvest portfolio export/
  )
})

test("E2E-D-XFER-004 — Import dialog file input is keyboard-focusable", async ({
  page,
}) => {
  await page.goto("/settings")
  // Open via direct click — Tab-walking to the Import button itself is
  // covered by the broader navigation suite; this test asserts the
  // a11y-critical claim that the *file input inside the dropzone* is in
  // the tab order (regression guard for the previous `display: none`
  // implementation that took it out).
  await page.getByTestId("settings-import-portfolio").click()
  await expect(page.getByTestId("portfolio-transfer-dialog")).toBeVisible()

  const fileInput = page.getByTestId("portfolio-transfer-file-input")
  await fileInput.focus()
  await expect(fileInput).toBeFocused()
  // Sanity: the input is visually-hidden-but-focusable, not display:none.
  // (Playwright considers an `sr-only`-positioned input "not visible" in
  // the strict sense — but `focus()` succeeds, which is what matters for
  // keyboard a11y.)
})
