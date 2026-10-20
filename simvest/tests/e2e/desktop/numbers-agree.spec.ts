import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"
import { preselectPortfolio, setRange } from "../helpers"

// P4 — "make the numbers and their labels agree".

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

type Settings = {
  horizonYears: number
  conservativeReturn: number
  optimisticReturn: number
}

async function getSettings(page: Page): Promise<Settings> {
  const res = await page.request.get("/api/settings")
  return (await res.json()) as Settings
}

/** Delete every income event paid in the current or previous month, so the
 * record now ends two months ago — a batch "not imported yet". */
async function dropRecentPayouts(page: Page) {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const cutoff = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`
  const list = (await (
    await page.request.get("/api/income-events")
  ).json()) as {
    id: number
    paidDate: string
  }[]
  for (const e of list.filter((x) => x.paidDate >= cutoff)) {
    const r = await page.request.delete(`/api/income-events/${e.id}`)
    expect(r.ok()).toBeTruthy()
  }
}

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

test("E2E-D-P4-W9-001 — Forecast sliders preview without saving; Reset restores", async ({
  page,
}) => {
  const before = await getSettings(page)
  await page.goto("/projection")
  const status = page.getByTestId("assumptions-status")
  await expect(status).toHaveText("Matches your plan")
  await expect(page.getByTestId("assumptions-apply")).toBeDisabled()

  const slider = page.getByTestId("chart-slider-horizon")
  await setRange(slider, 30)
  await expect(page.getByTestId("chart-slider-horizon-value")).toContainText(
    "30"
  )
  await expect(status).toHaveText("Preview — not saved")
  await expect(page.getByTestId("stat-horizon")).toContainText("30 years")
  await expect(page.getByTestId("assumptions-apply-hint")).toContainText(
    "the horizon"
  )

  // Wait past the 400 ms settings debounce — nothing may have been written.
  await page.waitForLoadState("networkidle")
  expect(await getSettings(page)).toMatchObject({
    horizonYears: before.horizonYears,
  })

  await page.getByTestId("assumptions-reset").click()
  await expect(status).toHaveText("Matches your plan")
  await expect(page.getByTestId("stat-horizon")).toContainText(
    `${before.horizonYears} years`
  )

  // A reload drops an un-applied preview entirely.
  await slider.fill("35")
  await page.reload()
  await expect(page.getByTestId("stat-horizon")).toContainText(
    `${before.horizonYears} years`
  )
  expect((await getSettings(page)).horizonYears).toBe(before.horizonYears)
})

test("E2E-D-P4-W9-002 — Apply to my plan writes the previewed values and says so", async ({
  page,
}) => {
  await page.goto("/projection")
  await expect(page.getByTestId("assumptions-status")).toHaveText(
    "Matches your plan"
  )
  await setRange(page.getByTestId("chart-slider-optimistic"), 12)
  await expect(page.getByTestId("stat-optimistic")).toContainText("12")
  await setRange(page.getByTestId("chart-slider-horizon"), 25)
  await expect(page.getByTestId("stat-horizon")).toContainText("25 years")
  const save = page.waitForResponse(
    (r) => r.url().endsWith("/api/settings") && r.request().method() === "PATCH"
  )
  await page.getByTestId("assumptions-apply").click()
  await save
  await expect(page.getByTestId("assumptions-status")).toHaveText(
    "Saved to your plan"
  )
  await expect
    .poll(async () => getSettings(page))
    .toMatchObject({
      horizonYears: 25,
      optimisticReturn: 12,
    })
})

test("E2E-D-P4-N7-001 — Overview's passive income equals Income's last 12 months and includes interest", async ({
  page,
}) => {
  await page.goto("/income")
  const incomeLast12 = (
    await page.locator('[data-testid="kpi-inc-last12"] .value').textContent()
  )?.trim()
  expect(incomeLast12).toMatch(/€[\d.,]+/)

  await page.goto("/")
  const card = page.getByTestId("kpi-dividends")
  await expect(card.locator(".label")).toHaveText(/passive income/i)
  await expect(card.locator(".value")).toHaveText(incomeLast12!)
  await expect(page.getByTestId("kpi-dividends-sub")).toContainText("interest")
})

test("E2E-D-P4-N4-001 — un-entered months don't count as zero: windows end at the last payout", async ({
  page,
}) => {
  await dropRecentPayouts(page)
  await page.goto("/income")
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const short = last.toLocaleString("en-US", { month: "short" })
  await expect(page.getByTestId("kpi-inc-last12-window")).toContainText(
    `12 months to ${short}`
  )
  await expect(page.getByTestId("kpi-inc-last12-window")).toContainText(
    "nothing recorded for the 2 months since"
  )

  // N5: the current month is "not recorded yet", not a €0 month.
  const cell = page.getByTestId(`income-heatmap-cell-${monthKey(now)}`)
  await expect(cell).toHaveAttribute("data-status", "unrecorded")
  await expect(cell).toHaveAttribute("aria-label", /Nothing recorded yet/)
  await cell.hover()
  const detail = page.getByTestId("income-heatmap-detail")
  await expect(detail).toContainText("Nothing recorded yet")
  await expect(detail).not.toContainText("0 payouts")
})

test("E2E-D-P4-N11-001 — heatmap has one shared scale with a legend", async ({
  page,
}) => {
  await page.goto("/income")
  await expect(page.getByTestId("income-heatmap-legend")).toBeVisible()
  await expect(page.getByTestId("income-heatmap-legend-max")).toContainText(
    "/ month"
  )
  // Next month (if in this calendar year) is future, not "no payouts".
  const now = new Date()
  if (now.getMonth() < 11) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    await expect(
      page.getByTestId(`income-heatmap-cell-${monthKey(next)}`)
    ).toHaveAttribute("data-status", "future")
  }
})

test("E2E-D-P4-N10-N12-001 — concentration says what it measures; trend column says its window", async ({
  page,
}) => {
  await page.goto("/income")
  const conc = page.getByTestId("kpi-inc-concentration")
  await expect(conc.locator(".label")).toHaveText(/top 3 sources/i)
  await expect(page.getByTestId("kpi-inc-concentration-verdict")).toContainText(
    "of your income"
  )
  await expect(page.getByTestId("income-trend-header")).toContainText(
    /24 mo to/i
  )
})

test("E2E-D-P4-N14-001 — a single-source donut renders a full ring", async ({
  page,
}) => {
  await page.goto("/income?kind=interest")
  const slice = page.getByTestId("income-donut-slice-interest")
  await expect(slice).toBeVisible()
  const d = (await slice.getAttribute("d")) ?? ""
  expect(d.match(/A /g)?.length).toBe(4)
  const box = await slice.boundingBox()
  expect(box!.width).toBeGreaterThan(150)
})

test("E2E-D-P4-N8-N13-001 — Entries says 'Added this month' and flags a multi-month Δ", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  const portfolios = (await (
    await page.request.get("/api/portfolios")
  ).json()) as {
    id: number
    entries: { id: number }[]
  }[]
  const entries = portfolios.find((p) => p.id === 1)!.entries
  // Remove the second-to-last row: the last row now spans two months.
  const gone = entries.at(-2)!
  expect((await page.request.delete(`/api/entries/${gone.id}`)).ok()).toBe(true)
  const lastId = entries.at(-1)!.id

  await page.goto("/entries")
  await expect(
    page.locator('[data-testid="entries-table"] thead th').nth(1)
  ).toHaveText("Added this month")
  const row = page.getByTestId(`entry-row-${lastId}`)
  await expect(row.getByTestId("delta-gap")).toContainText("over 2 mo")
})

test("E2E-D-P4-N1-N2-001 — Forecast names the track record and milestones measure from today", async ({
  page,
}) => {
  await page.goto("/projection")
  await expect(page.getByTestId("scenario-card-base")).toContainText(
    "Your track record"
  )
  await expect(page.getByTestId("scenario-card-base-badge")).toContainText(
    /If your last .* repeat exactly|Assumed 7%/
  )
  // Cards are ordered by rate, low → high, left to right.
  const cards = await Promise.all(
    ["conservative", "base", "optimistic"].map(async (k) => {
      const card = page.getByTestId(`scenario-card-${k}`)
      const text = (await card.textContent()) ?? ""
      const pct = parseFloat(
        text
          .match(/(-?[\d.,]+)%\/yr/)![1]
          .replace(".", "")
          .replace(",", ".")
      )
      return { pct, x: (await card.boundingBox())!.x }
    })
  )
  const byX = [...cards].sort((a, b) => a.x - b.x).map((c) => c.pct)
  expect(byX).toEqual([...byX].sort((a, b) => a - b))

  const rows = page.getByTestId("milestone-row")
  const texts = await rows.allTextContents()
  for (const t of texts) expect(t).not.toMatch(/in ~0,0y/)
  await expect(page.getByTestId("milestones-summary")).toBeVisible()
})

test("E2E-D-P4-N3-001 — Planning names the return's source and the override persists", async ({
  page,
}) => {
  await page.goto("/goals")
  const source = page.getByTestId("planning-return-source")
  await expect(source).toContainText(/return, .*\/yr over \d+ entries|assumed/)
  const field = page.getByTestId("planning-slider-return")
  await field.fill("3")
  await field.press("Enter")
  await expect(source).toContainText("Your override")
  await expect(page.getByTestId("planning-return-reset")).toBeVisible()
})

test("E2E-D-P4-N17-001 — switching Yearly income → Monthly dividends converts the amount", async ({
  page,
}) => {
  await page.goto("/goals")
  await page.getByTestId("action-new-goal").click()
  const target = page.getByTestId("goal-editor-target")
  await target.fill("30000")
  await target.blur()
  const radios = page.getByTestId("goal-editor-kind").locator('[role="radio"]')
  await radios.nth(3).click()
  await expect(page.getByTestId("goal-editor-kind-note")).toContainText(
    "Converted"
  )
  await expect(target).toHaveValue(/2[.,]?500/)
  await radios.nth(0).click()
  await expect(page.getByTestId("goal-editor-kind-note")).toContainText("reset")
})

test("E2E-D-P4-N9-001 — Settings shows the stored starting contribution, apart from the plan sum", async ({
  page,
}) => {
  await page.goto("/settings")
  const row = page.getByTestId("settings-default-contribution-row")
  await expect(row).toContainText("Starting contribution for new portfolios")
  await expect(page.getByTestId("settings-default-contribution")).toHaveValue(
    /1[.,]?250/
  )
  await expect(page.getByTestId("settings-return-record")).toBeVisible()
  await page.goto("/")
  await expect(page.getByTestId("overview-subtitle")).toContainText(
    /\/month across 2 accounts/
  )
})

test("E2E-D-P4-N15-001 — a portfolio card's header counts the interest it shows", async ({
  page,
}) => {
  await page.goto("/holdings")
  const interestRow = page.locator('[data-testid^="portfolio-interest-row-"]')
  await expect(interestRow.first()).toBeVisible()
  const pid = (await interestRow.first().getAttribute("data-testid"))!.replace(
    "portfolio-interest-row-",
    ""
  )
  await expect(page.getByTestId(`holdings-summary-${pid}`)).toContainText(
    "interest (12 mo)"
  )
  await expect(page.getByTestId(`holdings-count-${pid}`)).toContainText(
    "+ interest"
  )
})
