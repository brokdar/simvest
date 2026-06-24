import * as path from "path"
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

const CSV_PATH = path.resolve(
  process.cwd(),
  "tests/e2e/fixtures/trade-republic-sample.csv"
)

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

test("E2E-D-IMP-001 — Import button is disabled when combined portfolio is selected", async ({
  page,
}) => {
  await page.goto("/entries")
  // Default selection on a fresh tab is Combined.
  const btn = page.getByTestId("btn-import")
  await expect(btn).toBeVisible()
  await expect(btn).toBeDisabled()
})

test("E2E-D-IMP-002 — Click Import opens the modal at upload step", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.getByTestId("btn-import").click()
  await expect(page.getByTestId("import-flow")).toBeVisible()
  await expect(page.getByTestId("import-broker-selector")).toBeVisible()
})

test("E2E-D-IMP-003 — Upload sample CSV → preview step shows month/income/holdings tables", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.getByTestId("btn-import").click()
  await page.getByTestId("import-file-input").setInputFiles(CSV_PATH)
  await page.getByTestId("import-show-preview").click()
  await expect(page.getByTestId("import-months-table")).toBeVisible()
  await expect(page.getByTestId("import-income-table")).toBeVisible()
  await expect(page.getByTestId("import-holdings-table")).toBeVisible()
})

test("E2E-D-IMP-005 — Commit with defaults shows summary with counts", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.getByTestId("btn-import").click()
  await page.getByTestId("import-file-input").setInputFiles(CSV_PATH)
  await page.getByTestId("import-show-preview").click()
  await page.getByTestId("import-commit").click()
  await expect(page.getByTestId("import-summary")).toBeVisible()
  await page.getByTestId("import-summary-close").click()
})
