import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"

// P3 — "make every control tell the truth": the bell, the Planning verdict
// and trajectory, the goal editor and the goal's scope link.

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

const nextYear = new Date().getFullYear() + 1

async function createBehindGoal(page: Page, name: string) {
  const res = await page.request.post("/api/goals", {
    data: {
      name,
      kind: "portfolio_value",
      scope: "combined",
      target: 50_000_000,
      targetYear: nextYear + 2,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

test("E2E-D-TRUTH-001 — bell lists a behind goal and opens it on Planning", async ({
  page,
}) => {
  const id = await createBehindGoal(page, "TRUTH-001 Moonshot")
  await page.goto("/")
  await expect(page.getByTestId("notifications-badge")).toBeVisible()
  await page.getByTestId("notifications-trigger").click()
  const panel = page.getByTestId("notifications-panel")
  await expect(panel).toBeVisible()
  const item = page.getByTestId(`notification-goal-${id}`)
  await expect(item).toContainText("TRUTH-001 Moonshot")
  // T2 (P5): a behind goal leads with what closes the gap.
  await expect(item).toContainText(/\/mo more gets you there by/)
  await item.click()
  await expect(page).toHaveURL(/\/goals$/)
  await expect(page.getByTestId("planning-verdict")).toContainText(
    /\/mo more gets you there by/
  )
  // The linked goal is the one open in the workspace.
  await expect(page.getByTestId(`goal-tile-${id}`)).toHaveAttribute(
    "aria-pressed",
    "true"
  )
})

test("E2E-D-TRUTH-002 — bell lists an account whose latest value is older than the rest", async ({
  page,
}) => {
  const res = await page.request.post("/api/portfolios", {
    data: { name: "TRUTH-002 Quiet Broker" },
  })
  const { id } = (await res.json()) as { id: number }
  const entry = await page.request.post(`/api/portfolios/${id}/entries`, {
    data: { year: 2020, month: 6, day: 30, invested: 100, value: 1000 },
  })
  expect(entry.ok()).toBe(true)

  await page.goto("/")
  await page.getByTestId("notifications-trigger").click()
  const item = page.getByTestId(`notification-stale-${id}`)
  await expect(item).toContainText("TRUTH-002 Quiet Broker")
  await expect(item).toContainText("Jun ’20")
  await item.click()
  await expect(page).toHaveURL(/\/entries$/)
  await expect(
    page.locator('[data-testid="portfolio-switcher-trigger"] .pf-dd-name')
  ).toHaveText("TRUTH-002 Quiet Broker")
})

test("E2E-D-TRUTH-003 — Overview and Planning give the same verdict; the chart no longer claims 'Target reached'", async ({
  page,
}) => {
  const id = await createBehindGoal(page, "TRUTH-003 Moonshot")
  await page.goto("/")
  const overviewRow = page
    .getByTestId("goal-item")
    .filter({ hasText: "TRUTH-003 Moonshot" })
  await expect(overviewRow).toContainText("TRUTH-003 Moonshot")
  await expect(overviewRow.getByTestId("goal-status")).toContainText(
    /\/mo more gets you there by/
  )

  await page.goto(`/goals?goal=${id}`)
  await expect(page.getByTestId("planning-verdict")).toContainText(
    /\/mo more gets you there by/
  )
  await expect(page.getByTestId(`goal-verdict-chip-${id}`)).toContainText(
    /\/mo more$/
  )
  // Two distinct lines: what happens now, and what it would take.
  await expect(page.getByTestId("solver-line-current")).toBeAttached()
  await expect(page.getByTestId("solver-line-solved")).toBeAttached()
  await expect(page.getByTestId("solver-legend-solved")).toContainText(
    /Reachable if you add €[\d.,]+\/mo/
  )
  await expect(page.getByTestId("solver-legend-current")).toContainText(
    /At your current €[\d.,]+\/mo/
  )
  // €50M in three years is not reached at the current pace.
  await expect(page.getByTestId("solver-reached-label")).toHaveCount(0)
  await expect(page.getByTestId("solver-chart-svg")).not.toContainText(
    "Target reached"
  )
})

test("E2E-D-TRUTH-004 — Edit goal renames and re-scopes an existing goal", async ({
  page,
}) => {
  const id = await createBehindGoal(page, "TRUTH-004 Typo Gaol")
  await page.goto(`/goals?goal=${id}`)
  await page.getByTestId("workspace-edit").click()
  await expect(page.getByTestId("goal-editor-title")).toHaveText("Edit goal")
  const dialog = page.getByRole("dialog")
  await page.getByTestId("goal-editor-name").fill("TRUTH-004 Typo Goal")
  await dialog.getByText("Per portfolio").click()
  await page.getByTestId("goal-editor-portfolio-select").selectOption("1")
  await page.getByTestId("goal-editor-save").click()
  await expect(dialog).toBeHidden()

  await expect(page.getByTestId(`goal-tile-${id}`)).toContainText(
    "TRUTH-004 Typo Goal"
  )
  // Saved, not a pending modification.
  await expect(page.getByTestId("workspace-modified-chip")).toHaveCount(0)
  const res = await page.request.get("/api/goals")
  const goals = (await res.json()) as {
    id: number
    name: string
    scope: string
    portfolioId: number | null
  }[]
  const g = goals.find((x) => x.id === id)!
  expect(g.name).toBe("TRUTH-004 Typo Goal")
  expect(g.scope).toBe("portfolio")
  expect(g.portfolioId).toBe(1)

  // P6: the scope is a real link to that account.
  const link = page.getByTestId("planning-scope-link")
  await expect(link).toHaveText("Global Equity ETF")
  await link.click()
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.locator('[data-testid="portfolio-switcher-trigger"] .pf-dd-name')
  ).toHaveText("Global Equity ETF")
})
