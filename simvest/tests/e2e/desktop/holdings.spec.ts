import * as fs from "node:fs/promises"
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

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

test.describe("Holdings — every portfolio, scoped by the switcher (N16/W4)", () => {
  test.afterEach(async ({ resetDb }) => {
    resetDb()
  })

  test("E2E-D-HOLD-002 — a portfolio with no holdings still gets a group with an add action", async ({
    page,
  }) => {
    const res = await page.request.post("/api/portfolios", {
      data: { name: "HOLD-002 Empty Broker", color: "#7C3AED" },
    })
    expect(res.status()).toBe(201)
    const { id } = (await res.json()) as { id: number }

    await page.goto("/holdings")
    // Both seeded portfolios plus the empty one.
    await expect(page.locator('[data-testid^="holdings-group-"]')).toHaveCount(
      3
    )
    const group = page.getByTestId(`holdings-group-${id}`)
    await expect(group).toContainText("HOLD-002 Empty Broker")
    await expect(page.getByTestId(`holdings-empty-${id}`)).toContainText(
      "No holdings in HOLD-002 Empty Broker yet"
    )

    // The empty-state action opens the editor pre-pointed at that portfolio.
    await page.getByTestId(`holdings-empty-add-${id}`).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.locator("select").first()).toHaveValue(String(id))
  })

  test("E2E-D-HOLD-003 — the header portfolio switcher scopes /holdings", async ({
    page,
  }) => {
    await preselectPortfolio(page, 2)
    await page.goto("/holdings")
    await expect(page.getByTestId("portfolio-switcher-trigger")).toBeVisible()
    await expect(page.locator('[data-testid^="holdings-group-"]')).toHaveCount(
      1
    )
    await expect(page.getByTestId("holdings-group-2")).toBeVisible()
    await expect(page.getByTestId("holdings-subtitle")).toContainText(
      "3 holdings"
    )

    await page.getByTestId("portfolio-switcher-trigger").click()
    await page.getByTestId("pf-opt-0").click()
    await expect(page.locator('[data-testid^="holdings-group-"]')).toHaveCount(
      2
    )
    await expect(page.getByTestId("holdings-subtitle")).toContainText(
      "7 holdings"
    )
  })
})
