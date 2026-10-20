import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"

// P7 on a phone: the opening sentences, milestones you can tap away, and
// the Projection's "Your history" scale.

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
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

function monthsAgo(back: number) {
  const d = new Date()
  const idx = d.getFullYear() * 12 + d.getMonth() - back
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

async function seedQuarterMilestone(page: Page) {
  const res = await page.request.post("/api/portfolios", {
    data: { name: "P7M Milestone PF" },
  })
  const { id } = (await res.json()) as { id: number }
  for (const [back, value] of [
    [2, 4_000],
    [1, 6_000],
  ] as const) {
    const r = await page.request.post(`/api/portfolios/${id}/entries`, {
      data: { ...monthsAgo(back), day: 28, invested: 0, value },
    })
    expect(r.ok()).toBe(true)
  }
  const g = await page.request.post("/api/goals", {
    data: {
      name: "P7M Twenty k",
      kind: "portfolio_value",
      scope: "portfolio",
      portfolioId: id,
      target: 20_000,
      targetYear: new Date().getFullYear() + 5,
    },
  })
  expect(g.status()).toBe(201)
  return `goal-${((await g.json()) as { id: number }).id}-q25`
}

test("E2E-M-P7-001 — each key screen opens with its sentence, inside the screen", async ({
  page,
}) => {
  for (const [path, id] of [
    ["/", "overview-headline"],
    ["/goals", "goals-headline"],
    ["/income", "income-headline"],
  ] as const) {
    await page.goto(path)
    const el = page.getByTestId(id)
    await expect(el).toBeVisible()
    const box = await el.boundingBox()
    const vw = page.viewportSize()!.width
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
  }
})

test("E2E-M-P7-002 — a milestone can be tapped away with a 44px target", async ({
  page,
}) => {
  const id = await seedQuarterMilestone(page)
  await page.goto("/")
  const item = page.getByTestId(`milestone-${id}`)
  await item.scrollIntoViewIfNeeded()
  await expect(item).toBeVisible()
  const dismiss = page.getByTestId(`dismiss-milestone-${id}`)
  const box = await dismiss.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await dismiss.tap()
  await expect(item).toHaveCount(0)
})

test("E2E-M-P7-003 — “Your history” works on a phone", async ({ page }) => {
  await page.goto("/projection")
  await expect(page.getByTestId("growth-chart-svg")).toContainText("NOW")
  await page.getByTestId("chart-range-history").tap()
  await expect(page.getByTestId("chart-range-note")).toContainText(
    "Just what actually happened"
  )
  await expect(page.getByTestId("growth-chart-svg")).not.toContainText("NOW")
})
