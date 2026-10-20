import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

// P7 — meaning: each key screen opens with one sentence, milestones are
// acknowledged (and can be put away), the Projection can show the real
// history at its own scale, and empty screens say what to do.

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
})

// Clear localStorage once per test (sessionStorage survives the reload in
// P7-002, so a dismissal is still there to be checked).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!window.sessionStorage.getItem("p7-cleared")) {
        window.localStorage.clear()
        window.sessionStorage.setItem("p7-cleared", "1")
      }
    } catch {
      /* about:blank — ignore */
    }
  })
})

test.beforeEach(async ({ resetDb }) => {
  resetDb()
})

test.afterEach(async ({ resetDb }) => {
  resetDb()
})

/** The calendar month `back` months before today. */
function monthsAgo(back: number) {
  const d = new Date()
  const idx = d.getFullYear() * 12 + d.getMonth() - back
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

async function createPortfolio(page: Page, name: string) {
  const res = await page.request.post("/api/portfolios", { data: { name } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

async function addEntry(
  page: Page,
  id: number,
  at: { year: number; month: number },
  value: number,
  invested = 0
) {
  const res = await page.request.post(`/api/portfolios/${id}/entries`, {
    data: { ...at, day: 28, invested, value },
  })
  expect(res.ok()).toBe(true)
}

/** A portfolio-scoped value goal that crossed 25% last month. */
async function seedQuarterMilestone(page: Page) {
  const pid = await createPortfolio(page, "P7 Milestone PF")
  await addEntry(page, pid, monthsAgo(2), 4_000)
  await addEntry(page, pid, monthsAgo(1), 6_000)
  const res = await page.request.post("/api/goals", {
    data: {
      name: "P7 Twenty k",
      color: "#1E40AF",
      kind: "portfolio_value",
      scope: "portfolio",
      portfolioId: pid,
      target: 20_000,
      targetYear: new Date().getFullYear() + 5,
    },
  })
  expect(res.status()).toBe(201)
  const gid = ((await res.json()) as { id: number }).id
  return { pid, gid, milestoneId: `goal-${gid}-q25` }
}

test("E2E-D-P7-001 — Overview, Goals and Income each open with one plain sentence", async ({
  page,
}) => {
  await page.goto("/")
  const overview = page.getByTestId("overview-headline")
  await expect(overview).toBeVisible()
  await expect(overview).toHaveText(/^(Up €|The market |Flat )/)
  await expect(overview).toHaveText(/[A-Z][a-z]{2} ’\d\d/)
  await expect(overview).not.toHaveText(/NaN|undefined|null/)

  await page.goto("/goals")
  const goals = page.getByTestId("goals-headline")
  await expect(goals).toBeVisible()
  // The seeded goals are income goals for 2032 and 2040.
  await expect(goals).toHaveText(/\/yr of income/)
  await expect(goals).toHaveText(/2032|2040/)
  await expect(goals).not.toHaveText(/NaN|undefined|null/)

  await page.goto("/income")
  const income = page.getByTestId("income-headline")
  await expect(income).toBeVisible()
  await expect(income).toHaveText(/€[\d.]+/)
  await expect(income).not.toHaveText(/NaN|undefined|null/)
})

test("E2E-D-P7-002 — a milestone shows on the Overview and in the bell, and dismissing it sticks", async ({
  page,
}) => {
  const { milestoneId } = await seedQuarterMilestone(page)
  await page.goto("/")

  const card = page.getByTestId("milestones-card")
  const item = card.getByTestId(`milestone-${milestoneId}`)
  await expect(item).toBeVisible()
  await expect(item).toContainText("A quarter of the way to “P7 Twenty k”")

  await page.getByTestId("notifications-trigger").click()
  const panel = page.getByTestId("notifications-panel")
  await expect(
    panel.getByTestId(`notification-milestone-${milestoneId}`)
  ).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByTestId(`dismiss-milestone-${milestoneId}`).click()
  await expect(item).toHaveCount(0)

  // Remembered in this browser: still gone after a reload, and in the bell.
  await page.reload()
  await expect(page.getByTestId("overview-headline")).toBeVisible()
  await expect(page.getByTestId(`milestone-${milestoneId}`)).toHaveCount(0)
  await page.getByTestId("notifications-trigger").click()
  await expect(
    page.getByTestId(`notification-milestone-${milestoneId}`)
  ).toHaveCount(0)
})

test("E2E-D-P7-003 — a milestone link leads to the goal it belongs to", async ({
  page,
}) => {
  const { gid, milestoneId } = await seedQuarterMilestone(page)
  await page.goto("/")
  await page.getByTestId("notifications-trigger").click()
  await page.getByTestId(`notification-milestone-${milestoneId}`).click()
  await expect(page).toHaveURL(/\/goals$/)
  await expect(page.getByTestId(`goal-tile-${gid}`)).toBeVisible()
})

/** The largest € figure on the growth chart's y-axis, in euros. */
async function yAxisTop(page: Page): Promise<number> {
  const labels = await page
    .getByTestId("growth-chart-svg")
    .locator("text")
    .allTextContents()
  const values = labels
    .map((t) => t.trim())
    .filter((t) => /^€[\d.,]+[kM]?$/.test(t))
    .map((t) => {
      const n = parseFloat(
        t.replace("€", "").replace(/\./g, "").replace(",", ".")
      )
      return t.endsWith("M") ? n * 1e6 : t.endsWith("k") ? n * 1e3 : n
    })
  return Math.max(...values)
}

test("E2E-D-P7-004 — L8: “Your history” rescales the Projection to the real record", async ({
  page,
}) => {
  await page.goto("/projection")
  await expect(page.getByTestId("growth-chart-svg")).toBeVisible()
  const withPlan = await yAxisTop(page)

  await page.getByTestId("chart-range-history").click()
  await expect(page.getByTestId("chart-range-note")).toContainText(
    "Just what actually happened"
  )
  const historyOnly = await yAxisTop(page)
  expect(historyOnly).toBeLessThan(withPlan)
  // No projection, so no NOW divider and no projection legend.
  await expect(page.getByTestId("growth-chart-svg")).not.toContainText("NOW")
  await expect(
    page.getByTestId("chart-legend").getByText("Optimistic")
  ).toHaveCount(0)

  await page.getByTestId("chart-range-plan").click()
  await expect(page.getByTestId("growth-chart-svg")).toContainText("NOW")
})

test("E2E-D-P7-005 — an empty portfolio gets real empty states that say what to do", async ({
  page,
}) => {
  const id = await createPortfolio(page, "P7 Empty PF")
  await preselectPortfolio(page, id)

  await page.goto("/")
  await expect(page.getByTestId("overview-empty")).toContainText(
    "Nothing logged for P7 Empty PF yet"
  )
  await expect(page.getByTestId("derived-stats")).toHaveCount(0)
  await expect(page.getByTestId("overview-empty-cta")).toHaveAttribute(
    "href",
    "/entries?new=entry"
  )

  await page.goto("/projection")
  await expect(page.getByTestId("projection-empty")).toBeVisible()
  await expect(page.getByTestId("projection-empty-cta")).toBeVisible()

  await page.goto("/entries")
  await expect(page.getByTestId("entries-empty")).toBeVisible()
  await page.getByTestId("entries-empty-paste").click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")

  await page.goto("/income?kind=interest")
  await expect(page.getByTestId("income-empty-state")).toContainText(
    "No interest recorded yet"
  )
  await page.getByTestId("income-empty-interest").click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

test("E2E-D-P7-006 — catch-up names an account several months behind and jumps to the first gap", async ({
  page,
}) => {
  const id = await createPortfolio(page, "P7 Behind PF")
  const last = monthsAgo(5)
  await addEntry(page, id, last, 1_000)
  await preselectPortfolio(page, 0)
  await page.goto("/entries")

  const gap = page.getByTestId("catchup-gap")
  await expect(gap).toContainText("P7 Behind PF")
  await expect(page.getByTestId(`catchup-last-${id}`)).toContainText(
    "5 months behind"
  )
  await page.getByTestId("catchup-gap-start").click()
  await expect(gap).toContainText("Filling in")
})
