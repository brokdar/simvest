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

const fixture = (name: string) =>
  path.resolve(process.cwd(), "tests/e2e/fixtures", name)

async function openImport(
  page: import("@playwright/test").Page,
  portfolioId: number,
  broker: "trade_republic" | "bondora",
  file: string
) {
  await preselectPortfolio(page, portfolioId)
  await page.goto("/entries")
  await page.getByTestId("btn-import").click()
  await page.getByTestId("import-broker-selector").selectOption(broker)
  await page.getByTestId("import-file-input").setInputFiles(fixture(file))
  await page.getByTestId("import-show-preview").click()
}

// D2 — garbage never reaches "Import complete".
for (const [id, broker, file] of [
  ["001", "trade_republic", "garbage-random-bytes.csv"],
  ["002", "bondora", "garbage-random-bytes.csv"],
  ["003", "trade_republic", "image-renamed.csv"],
  ["004", "bondora", "image-renamed.csv"],
] as const) {
  test(`E2E-D-IMP-D2-${id} — ${file} via ${broker} is rejected at preview`, async ({
    page,
  }) => {
    await openImport(page, 1, broker, file)
    const err = page.getByTestId("import-error")
    await expect(err).toBeVisible()
    await expect(err).toContainText("binary file")
    // Still on the upload step: no preview, no Apply, no success screen.
    await expect(page.getByTestId("import-commit")).toHaveCount(0)
    await expect(page.getByTestId("import-summary")).toHaveCount(0)
    await expect(page.getByTestId("import-flow")).not.toContainText(
      "Import complete"
    )
  })
}

// D3 — the real case: stored €15.728,37 vs statement €15.740,93.
async function seedD3Portfolio(page: import("@playwright/test").Page) {
  const res = await page.request.post("/api/portfolios", {
    data: { name: "D3 Bondora" },
  })
  expect(res.status()).toBe(201)
  const { id } = (await res.json()) as { id: number }
  for (const e of [
    { year: 2026, month: 5, day: 31, invested: 100, value: 15728.37 },
    { year: 2026, month: 6, day: 30, invested: 100, value: 15843.44 },
  ]) {
    const r = await page.request.post(`/api/portfolios/${id}/entries`, {
      data: e,
    })
    expect(r.ok()).toBe(true)
  }
  return id
}

test("E2E-D-IMP-D3-001 — a month whose value differs defaults to Replace and reads as a correction", async ({
  page,
}) => {
  const id = await seedD3Portfolio(page)
  await openImport(page, id, "bondora", "bondora-d3-correction.csv")

  const may = page.getByTestId("import-month-2026-5")
  await expect(may).toHaveAttribute("data-status", "correction")
  await expect(may.getByTestId("import-month-status")).toHaveText("Correction")
  await expect(may).toContainText("was €15,728.37")
  await expect(
    page.getByTestId("import-month-action-2026-5-replace")
  ).toHaveAttribute("aria-pressed", "true")

  const jun = page.getByTestId("import-month-2026-6")
  await expect(jun).toHaveAttribute("data-status", "unchanged")
  await expect(
    page.getByTestId("import-month-action-2026-6-skip")
  ).toHaveAttribute("aria-pressed", "true")

  // A correction looks different from a harmless skip.
  const bg = (loc: typeof may) =>
    loc
      .locator("td")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await bg(may)).not.toBe(await bg(jun))

  await expect(page.getByTestId("import-stat-months")).toContainText(
    "4 new · 1 correction · 1 unchanged"
  )

  await page.getByTestId("import-commit").click()
  await expect(page.getByTestId("import-summary")).toBeVisible()
  const pf = (await (
    await page.request.get("/api/portfolios")
  ).json()) as Array<{
    id: number
    entries: Array<{ year: number; month: number; value: number | null }>
  }>
  const entries = pf.find((p) => p.id === id)!.entries
  expect(entries.find((e) => e.month === 5)?.value).toBe(15740.93)
  expect(entries).toHaveLength(6)
})

test("E2E-D-IMP-D2-010 — re-importing the same statement offers no enabled Apply", async ({
  page,
}) => {
  const id = await seedD3Portfolio(page)
  await openImport(page, id, "bondora", "bondora-d3-correction.csv")
  await page.getByTestId("import-commit").click()
  await page.getByTestId("import-summary-close").click()

  await page.getByTestId("btn-import").click()
  await page.getByTestId("import-broker-selector").selectOption("bondora")
  await page
    .getByTestId("import-file-input")
    .setInputFiles(fixture("bondora-d3-correction.csv"))
  await page.getByTestId("import-show-preview").click()
  await expect(page.getByTestId("import-stat-months")).toContainText(
    "6 unchanged"
  )
  await expect(page.getByTestId("import-commit")).toBeDisabled()
  await expect(page.getByTestId("import-nothing-to-write")).toBeVisible()
})

// D4 — a 2-column paste is a balance history.
test("E2E-D-IMP-D4-001 — 2-column paste maps to Portfolio value, and the column can be remapped", async ({
  page,
}) => {
  const res = await page.request.post("/api/portfolios", {
    data: { name: "D4 Paste" },
  })
  const { id } = (await res.json()) as { id: number }
  await preselectPortfolio(page, id)
  await page.goto("/entries")
  await page.getByTestId("btn-paste-data").click()
  await page.getByTestId("paste-textarea").fill("2024-01\t1520\n2024-02\t1645")

  const role = page.getByTestId("paste-column-role-1")
  await expect(role).toHaveValue("value")
  await page.getByTestId("paste-continue").click()
  const row1 = page.getByTestId("paste-row-1")
  await expect(row1.locator("td").nth(2)).toHaveText("€1,520.00")
  await expect(row1.locator("td").nth(1)).toHaveText("€0.00")

  // Remap to Invested and the preview follows.
  await page.getByTestId("paste-back").click()
  await role.selectOption("invested")
  await page.getByTestId("paste-continue").click()
  await expect(row1.locator("td").nth(1)).toHaveText("€1,520.00")
  await expect(row1.locator("td").nth(2)).toHaveText("—")

  await page.getByTestId("paste-back").click()
  await role.selectOption("value")
  await page.getByTestId("paste-continue").click()
  await page.getByTestId("paste-apply").click()
  await expect(page.getByTestId("paste-summary")).toBeVisible()
  const pf = (await (
    await page.request.get("/api/portfolios")
  ).json()) as Array<{
    id: number
    entries: Array<{ month: number; invested: number; value: number | null }>
  }>
  const entries = pf.find((p) => p.id === id)!.entries
  expect(entries.map((e) => e.value)).toEqual([1520, 1645])
  expect(entries.map((e) => e.invested)).toEqual([0, 0])
})
