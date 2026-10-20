import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"
import { navClick, setRange } from "../helpers"

// The six everyday errands, walked end to end and counted.
// Every click the page receives is counted at the capture phase, so the number
// is what a person would actually do. Runs against the per-worker e2e DB only.
// The counts are written to test-results/errands-clicks.json (not committed).

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
})

test.beforeEach(async ({ page, resetDb }) => {
  resetDb()
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      /* ignore */
    }
    document.addEventListener(
      "click",
      () => {
        const n = Number(sessionStorage.getItem("p10-clicks") ?? 0) + 1
        sessionStorage.setItem("p10-clicks", String(n))
      },
      true
    )
  })
})

test.afterEach(async ({ resetDb }) => {
  resetDb()
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS: Record<string, number> = {}
const OUT = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "test-results",
  "errands-clicks.json"
)

function record(name: string, clicks: number) {
  RESULTS[name] = clicks
  let all: Record<string, number> = {}
  try {
    all = JSON.parse(fs.readFileSync(OUT, "utf8")) as Record<string, number>
  } catch {
    /* first write */
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify({ ...all, ...RESULTS }, null, 2) + "\n")
}

const resetClicks = (page: Page) =>
  page.evaluate(() => sessionStorage.setItem("p10-clicks", "0"))
const clickCount = (page: Page) =>
  page.evaluate(() => Number(sessionStorage.getItem("p10-clicks") ?? 0))

async function makeFourAccounts(page: Page) {
  for (const name of ["P10 Broker C", "P10 Broker D"]) {
    const res = await page.request.post("/api/portfolios", {
      data: { name, targetMonthlyContribution: 100 },
    })
    expect(res.ok()).toBe(true)
  }
  const all = (await (await page.request.get("/api/portfolios")).json()) as {
    id: number
    name: string
  }[]
  expect(all).toHaveLength(4)
  return all
}

async function startOnOverview(page: Page) {
  await page.goto("/")
  await expect(page.getByTestId("kpi-portfolio-value")).toBeVisible()
  await resetClicks(page)
}

test("E2E-D-P10-ERRAND-1 — log this month's balances for all four accounts", async ({
  page,
}) => {
  const all = await makeFourAccounts(page)
  await startOnOverview(page)

  await navClick(page, "nav-entries", "**/entries")
  await expect(page.getByTestId("catchup-panel")).toBeVisible()
  for (const [i, p] of all.entries()) {
    await page.getByTestId(`catchup-value-${p.id}`).click()
    await page.keyboard.type(String(10_000 + i * 1_000))
  }
  await expect(page.getByTestId("catchup-save")).toHaveText(/Save 4 accounts/)
  const batch = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/entries/batch") && r.request().method() === "POST"
  )
  await page.getByTestId("catchup-save").click()
  expect((await batch).status()).toBe(200)

  const clicks = await clickCount(page)
  record("1 monthly ritual (4 accounts)", clicks)
  expect(clicks).toBeLessThan(8)
})

test("E2E-D-P10-ERRAND-2 — which holding pays me the most?", async ({
  page,
}) => {
  await startOnOverview(page)
  await navClick(page, "nav-holdings", "**/holdings")
  await page
    .getByTestId("holdings-order-bar")
    .getByRole("radio", { name: "Top earners" })
    .click()
  const table = page.getByTestId("holdings-earners")
  await expect(table).toBeVisible()
  const incomes = await table
    .locator('tbody tr[data-testid^="earner-row-"] td.td-holding-income')
    .evaluateAll((tds) =>
      tds.map((td) => {
        const t = (td.textContent ?? "").replace(/[^\d,.-]/g, "")
        if (!t) return 0
        // de-DE style or en-US style: the last separator is the decimal one
        const lastSep = Math.max(t.lastIndexOf(","), t.lastIndexOf("."))
        const intPart = t.slice(0, lastSep).replace(/[.,]/g, "")
        return Number(`${intPart}.${t.slice(lastSep + 1)}`)
      })
    )
  expect(incomes.length).toBeGreaterThan(2)
  expect(incomes[0]).toBeGreaterThanOrEqual(Math.max(...incomes))

  const clicks = await clickCount(page)
  record("2 which holding pays most", clicks)
  expect(clicks).toBeLessThanOrEqual(3)
})

test("E2E-D-P10-ERRAND-3 — am I on track?", async ({ page }) => {
  await startOnOverview(page)
  // The Overview already carries the goal verdicts…
  const strip = page.getByTestId("goal-progress-chip").first()
  const onOverview = await strip.isVisible().catch(() => false)
  // …and one click away the Goals page opens with a sentence.
  await navClick(page, "nav-goals", "**/goals")
  await expect(page.getByTestId("goals-headline")).toContainText(/\S+/)
  await expect(page.getByTestId("goals-headline")).toContainText(
    /reach|need|on track|pace|ahead|behind/i
  )
  const clicks = await clickCount(page)
  record("3 am I on track (Goals headline)", clicks)
  record("3b goal verdicts already on Overview (0 clicks)", onOverview ? 0 : -1)
  expect(clicks).toBeLessThanOrEqual(2)
})

test("E2E-D-P10-ERRAND-4 — dividends last year vs this year", async ({
  page,
}) => {
  await startOnOverview(page)
  await navClick(page, "nav-income", "**/income")
  await expect(page.getByTestId("income-headline")).toContainText(/\S+/)
  const clicks = await clickCount(page)
  record("4 dividends last year vs this year", clicks)
  expect(clicks).toBeLessThanOrEqual(2)
})

test("E2E-D-P10-ERRAND-5 — what happens if I save 200 more per month?", async ({
  page,
}) => {
  await startOnOverview(page)
  await navClick(page, "nav-projection", "**/projection")
  await page.waitForSelector('[data-testid="growth-chart-svg"]')
  // Combined shows the sum read-only; the slider lives on a single account.
  await page.getByTestId("portfolio-switcher-trigger").click()
  await page.getByTestId("pf-opt-1").click()
  const card = page.getByTestId("scenario-assumptions")
  await expect(card.locator('input[type="range"]')).toHaveCount(4)
  const base = page.getByTestId("stat-base")
  const before = await base.textContent()
  const slider = card.locator('input[type="range"]').nth(1)
  await setRange(slider, Number(await slider.inputValue()) + 200)
  await expect(base).not.toHaveText(before ?? "")
  await expect(page.getByTestId("assumptions-status")).toContainText("Preview")
  // A slider drag is one pointer gesture; the helper drives the keyboard, so
  // count it as the one click it would be. The preview needs no Apply.
  const clicks = (await clickCount(page)) + 1
  record("5 save 200 more per month (preview)", clicks)
  expect(clicks).toBeLessThanOrEqual(5)
})

test("E2E-D-P10-ERRAND-6 — my last entry is months old, help me catch up", async ({
  page,
}) => {
  // Four accounts that are months behind (the two seeded ones, plus two that
  // stopped in 2020) and one that is current, so the others read as stale.
  const stale = [1, 2]
  const now = new Date()
  for (const name of ["P10 Quiet C", "P10 Quiet D", "P10 Current"]) {
    const res = await page.request.post("/api/portfolios", { data: { name } })
    const { id } = (await res.json()) as { id: number }
    const current = name === "P10 Current"
    await page.request.post(`/api/portfolios/${id}/entries`, {
      data: current
        ? {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: 1,
            invested: 100,
            value: 1000,
          }
        : { year: 2020, month: 6, day: 30, invested: 100, value: 1000 },
    })
    if (!current) stale.push(id)
  }
  await startOnOverview(page)
  const link = page.getByTestId("stale-catchup-link")
  await expect(link).toBeVisible()
  await link.click()
  await page.waitForURL("**/entries**")
  await expect(page.getByTestId("catchup-panel")).toBeVisible()
  for (const [i, id] of stale.entries()) {
    await page.getByTestId(`catchup-value-${id}`).click()
    await page.keyboard.type(String(20_000 + i * 1_000))
  }
  await expect(page.getByTestId("catchup-save")).toHaveText(/Save 4 accounts/)
  const batch = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/entries/batch") && r.request().method() === "POST"
  )
  await page.getByTestId("catchup-save").click()
  expect((await batch).status()).toBe(200)
  const clicks = await clickCount(page)
  record("6 catch up (stale notice to saved, current month)", clicks)
  expect(clicks).toBeLessThan(8)
})
