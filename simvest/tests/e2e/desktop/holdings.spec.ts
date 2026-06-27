import * as fs from "node:fs/promises"
import { test, expect } from "../fixtures"

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
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

test("E2E-D-HOLD-001 — Export downloads a CSV of holdings with the expected header", async ({
  page,
}, testInfo) => {
  await page.goto("/holdings")
  await page.waitForSelector('[data-testid="holdings-subtitle"]')

  const downloadPromise = page.waitForEvent("download")
  await page.getByTestId("btn-export-holdings").click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe("simvest-holdings.csv")
  const savedPath = testInfo.outputPath("holdings.csv")
  await download.saveAs(savedPath)
  const raw = await fs.readFile(savedPath, "utf8")
  const lines = raw.split("\n")
  expect(lines[0]).toBe("name,type,isin,totalDividends,trailing12mIncome")
  // Seed has holdings across both portfolios → header + body rows.
  expect(lines.length).toBeGreaterThan(1)
})
