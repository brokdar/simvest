import fs from "node:fs"
import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

// P5 — language, explanation and tone: every term explained where it's used,
// every save / discard confirmed, nothing scolds.

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

test.afterEach(async ({ resetDb }) => {
  resetDb()
})

const thisYear = new Date().getFullYear()

async function createGoal(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post("/api/goals", { data })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

/** A bare portfolio with one old entry — stale next to the seeded ones. */
async function createQuietPortfolio(page: Page, name: string) {
  const res = await page.request.post("/api/portfolios", { data: { name } })
  const { id } = (await res.json()) as { id: number }
  const entry = await page.request.post(`/api/portfolios/${id}/entries`, {
    data: { year: 2020, month: 6, day: 30, invested: 100, value: 1000 },
  })
  expect(entry.ok()).toBe(true)
  return id
}

test("E2E-D-P5-C6-001 — the sidebar names the two planning routes for what they are", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByTestId("nav-projection")).toHaveText("Projection")
  await expect(page.getByTestId("nav-goals")).toHaveText("Goals")
  await page.getByTestId("nav-projection").click()
  await expect(page).toHaveURL(/\/projection$/)
  await expect(page.locator("h1.title")).toHaveText("Projection")
  await page.getByTestId("nav-goals").click()
  await expect(page).toHaveURL(/\/goals$/)
  await expect(page.locator("h1.title")).toHaveText("Goals")
  // C7: the tagline says something.
  await expect(page.locator(".sidebar .brand-sub")).toHaveText("Track & plan")
})

test("E2E-D-P5-T1-001 — the stale-account notice is informational and links into Monthly Entries", async ({
  page,
}) => {
  const id = await createQuietPortfolio(page, "P5-T1 Quiet Broker")
  await page.goto("/")
  const notice = page.getByTestId("combined-data-notice")
  await expect(notice).toContainText("could use a refresh")
  await expect(notice).toContainText("add this month’s")
  await expect(notice).not.toContainText("haven’t reported")
  // Info, not warning-orange; and it no longer leads the page.
  const colors = await notice.evaluate((el) => {
    const probe = document.createElement("span")
    probe.style.color = "var(--info-border)"
    document.body.appendChild(probe)
    const info = getComputedStyle(probe).color
    probe.style.color = "var(--warn-border)"
    const warn = getComputedStyle(probe).color
    probe.remove()
    return { border: getComputedStyle(el).borderTopColor, info, warn }
  })
  expect(colors.border).toBe(colors.info)
  expect(colors.border).not.toBe(colors.warn)
  const noticeTop = (await notice.boundingBox())!.y
  const kpiTop = (await page.getByTestId("kpi-portfolio-value").boundingBox())!
    .y
  expect(noticeTop).toBeGreaterThan(kpiTop)

  await page.getByTestId(`stale-link-${id}`).click()
  await expect(page).toHaveURL(/\/entries$/)
  await expect(
    page.locator('[data-testid="portfolio-switcher-trigger"] .pf-dd-name')
  ).toHaveText("P5-T1 Quiet Broker")
})

test("E2E-D-P5-T2-001 — a behind goal is warn, not red, and leads with the fix everywhere", async ({
  page,
}) => {
  const id = await createGoal(page, {
    name: "P5-T2 Moonshot",
    kind: "portfolio_value",
    scope: "combined",
    target: 50_000_000,
    targetYear: thisYear + 8,
  })
  await page.goto("/")
  const status = page
    .getByTestId("goal-item")
    .filter({ hasText: "P5-T2 Moonshot" })
    .getByTestId("goal-status")
  await expect(status).toHaveText(
    new RegExp(`^€[\\d.,]+/mo more gets you there by ${thisYear + 8}`)
  )
  await expect(status).toHaveClass(/\bwarn\b/)
  await expect(status).not.toContainText("40y")

  await page.goto(`/goals?goal=${id}`)
  const chip = page.getByTestId(`goal-verdict-chip-${id}`)
  await expect(chip).toHaveClass(/\bwarn\b/)
  await expect(chip).toContainText(/€[\d.,]+\/mo more/)
  await expect(page.getByTestId("planning-verdict")).toContainText(
    /^€[\d.,]+\/mo more gets you there by \d{4}/
  )
  await expect(page.getByTestId("kpi-time")).not.toContainText("40y")
})

test("E2E-D-P5-C4-C5-001 — the gap names its source and links to fix it; the portfolio target shows its division", async ({
  page,
}) => {
  // Portfolio 2 ("Dividend Income") with its contribution set to €0.
  await page.request.patch("/api/portfolios/2", {
    data: { targetMonthlyContribution: 0 },
  })
  const id = await createGoal(page, {
    name: "P5-C4 Dividends",
    kind: "dividend_monthly",
    scope: "portfolio",
    portfolioId: 2,
    target: 2000,
    targetYear: thisYear + 6,
  })
  await page.goto(`/goals?goal=${id}`)
  const req = page.getByTestId("kpi-required-monthly")
  await expect(req).toContainText(
    /€[\d.,]+\/mo more than the €0\/mo you put into Dividend Income today/
  )
  const link = page.getByTestId("kpi-required-monthly-link")
  await expect(link).toHaveText("Set a monthly contribution →")
  await expect(page.getByTestId("kpi-portfolio-target")).toContainText(
    /= €[\d.,]+\/yr in dividends ÷ [\d.,]+% assumed yield/
  )
  // C2: the withdrawal rate plays no part in a dividend goal.
  await expect(page.getByTestId("global-assumptions-echo")).not.toContainText(
    /withdrawal|SWR/i
  )
  await link.click()
  await expect(page).toHaveURL(/\/settings#contribution-2$/)
  await expect(page.getByTestId("settings-contribution-2")).toBeVisible()
})

test("E2E-D-P5-C2-001 — an income goal explains the safe withdrawal rate in words", async ({
  page,
}) => {
  const id = await createGoal(page, {
    name: "P5-C2 Income",
    kind: "annual_income",
    scope: "combined",
    target: 30000,
    targetYear: thisYear + 15,
  })
  await page.goto(`/goals?goal=${id}`)
  await expect(page.getByTestId("planning-swr-explainer")).toContainText(
    "The share of the pot you’d take out each year"
  )
  await expect(page.getByTestId("kpi-portfolio-target")).toContainText(
    /÷ [\d.,]+% safe withdrawal rate/
  )
  await expect(page.locator(".view")).not.toContainText(/\bSWR\b/)
})

test("E2E-D-P5-C9-C10-T3-001 — Income says 'tax', names cadences honestly, and folds daily interest", async ({
  page,
}) => {
  // 25 days of interest in one month for portfolio 1.
  const month = `${thisYear - 1}-03`
  for (let d = 1; d <= 25; d++) {
    const r = await page.request.post("/api/income-events", {
      data: {
        kind: "interest",
        portfolioId: 1,
        paidDate: `${month}-${String(d).padStart(2, "0")}`,
        amount: 2.51,
        tax: 0,
      },
    })
    expect(r.ok()).toBe(true)
  }
  await page.goto("/income")
  const basis = page.getByTestId("income-basis-toggle")
  await expect(basis).toContainText("After tax")
  await expect(basis).toContainText("Before tax")
  await expect(page.getByTestId("income-basis-hint")).toContainText("tax")
  await expect(page.getByTestId("kpi-inc-total")).toContainText("after tax")

  // C10: no "Irregular" anywhere; the interest row reads Daily.
  await expect(page.locator('[data-testid^="income-cadence-"]')).not.toHaveText(
    ["Irregular"]
  )
  await expect(page.getByTestId("income-cadence-interest")).toHaveText("Daily")

  // T3: the 25 payouts are one row until opened.
  await page.getByTestId("income-recent-toggle").click()
  const run = page.getByTestId(`income-run-1-${month}`)
  await expect(run).toContainText("Global Equity ETF interest")
  await expect(run).toContainText(/2[5-9] payouts/)
  const toggle = page.getByTestId(`income-run-toggle-1-${month}`)
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
})

test("E2E-D-P5-INC-ARIA-001 — per-holding filter buttons expose aria-pressed", async ({
  page,
}) => {
  await page.goto("/income")
  const btn = page
    .getByTestId("income-per-holding-table")
    .getByRole("button", { name: /^Filter income by / })
    .first()
  await expect(btn).toHaveAttribute("aria-pressed", "false")
  await btn.click()
  await expect(page).toHaveURL(/holding=/)
  await expect(btn).toHaveAttribute("aria-pressed", "true")
})

test("E2E-D-P5-C1-001 — Projection slider readouts are whole years and euros", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/projection")
  await expect(page.getByTestId("chart-slider-horizon-value")).toHaveText(
    /^\d+ years?$/
  )
  await expect(page.getByTestId("chart-slider-saving-value")).toHaveText(
    /^€[\d.,]+$/
  )
  await expect(page.getByTestId("chart-slider-saving-value")).not.toHaveText(
    /,\d$|\.\d$/
  )
})

test("E2E-D-P5-C11-C13-001 — every Settings slider says what it changes; €0 contribution reads as a choice", async ({
  page,
}) => {
  await page.request.patch("/api/portfolios/2", {
    data: { targetMonthlyContribution: 0 },
  })
  await page.goto("/settings")
  for (const id of [
    "settings-inflation",
    "settings-conservative-return",
    "settings-optimistic-return",
    "settings-default-swr",
  ]) {
    await expect(page.getByTestId(`${id}-hint`)).not.toBeEmpty()
  }
  await expect(page.getByTestId("settings-contribution-2")).toHaveValue(
    /^0[,.]00$/
  )
  await expect(
    page.getByTestId("settings-contribution-caption-2")
  ).toContainText("Nothing going in each month")
  await expect(
    page.getByTestId("settings-contribution-caption-1")
  ).toContainText("Monthly contribution")
})

test("E2E-D-P5-C8-001 — the add-portfolio dialog explains money paid in before tracking", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.getByRole("button", { name: "Add portfolio" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByText("I already had money in here").click()
  await expect(dialog).toContainText("counts as invested")
  await expect(dialog).not.toContainText("Anchors gain")
  await expect(dialog.getByText("Already paid in")).toBeVisible()
  await expect(dialog.getByTestId("starting-value-hint")).toHaveText(
    "Your own money in, not what it was worth."
  )
})

test("E2E-D-P5-C12-001 — About & data shows the DB and downloads a valid backup", async ({
  page,
}) => {
  await page.goto("/settings")
  const card = page.getByTestId("about-data-card")
  await expect(card.getByTestId("about-version")).toHaveText(/^\d+\.\d+\.\d+/)
  await expect(card.getByTestId("about-db-path")).toContainText(".db")
  await expect(card.getByTestId("about-counts")).toContainText("2 portfolios")
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card.getByTestId("about-backup-download").click(),
  ])
  expect(download.suggestedFilename()).toMatch(
    /^simvest-backup-\d{4}-\d{2}-\d{2}\.db$/
  )
  const file = await download.path()
  const head = fs.readFileSync(file!).subarray(0, 15).toString()
  expect(head).toBe("SQLite format 3")
})

test("E2E-D-P5-D6-001 — settings changes, entry saves and discards each confirm", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.getByTestId("default-entry-day-first").click()
  await expect(page.getByTestId("toast")).toHaveText("Changes saved")

  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.waitForSelector('[data-testid="entries-table"]')
  const firstRow = page
    .locator('[data-testid="entries-table"] tbody tr')
    .first()
  const idNum = (await firstRow.getAttribute("data-testid"))!.replace(
    "entry-row-",
    ""
  )
  // Discard first…
  await page.getByTestId("btn-edit-table").click()
  await page.getByTestId(`cell-value-${idNum}`).fill("77777")
  await page.getByTestId(`cell-value-${idNum}`).blur()
  await page.getByTestId("entries-grid-cancel").click()
  await page.getByTestId("entries-grid-confirm-discard").click()
  await expect(
    page.getByTestId("toast").filter({ hasText: "Discarded" })
  ).toHaveText("Discarded 1 change — nothing was saved")
  // …then save.
  await page.getByTestId("btn-edit-table").click()
  await page.getByTestId(`cell-value-${idNum}`).fill("88888")
  await page.getByTestId(`cell-value-${idNum}`).blur()
  await page.getByTestId("entries-grid-save").click()
  await expect(
    page.getByTestId("toast").filter({ hasText: /^Saved \d/ })
  ).toHaveText("Saved 1 change to Global Equity ETF")
})
