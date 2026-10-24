import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"

// LO-A — a contribution that was never set reads differently from a
// deliberate €0 (R2), and a dismissed milestone stays dismissed for the user,
// not for the browser (R4).

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
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

async function seedQuarterMilestone(page: Page) {
  const created = await page.request.post("/api/portfolios", {
    data: { name: "LO-A Milestone PF", targetMonthlyContribution: 100 },
  })
  expect(created.status()).toBe(201)
  const pid = ((await created.json()) as { id: number }).id
  for (const [back, value] of [
    [2, 4_000],
    [1, 6_000],
  ]) {
    const res = await page.request.post(`/api/portfolios/${pid}/entries`, {
      data: { ...monthsAgo(back), day: 28, invested: 0, value },
    })
    expect(res.ok()).toBe(true)
  }
  const goal = await page.request.post("/api/goals", {
    data: {
      name: "LO-A Twenty k",
      color: "#1E40AF",
      kind: "portfolio_value",
      scope: "portfolio",
      portfolioId: pid,
      target: 20_000,
      targetYear: new Date().getFullYear() + 5,
    },
  })
  expect(goal.status()).toBe(201)
  const gid = ((await goal.json()) as { id: number }).id
  return `goal-${gid}-q25`
}

test("E2E-D-LO-R2-001 — a portfolio created without a contribution says 'Not set yet'; setting €0 reads as a choice", async ({
  page,
}) => {
  await page.goto("/settings")
  await page.locator('button:has-text("Add portfolio")').click()
  await page
    .locator('[role="dialog"] input[placeholder="e.g. Pension brokerage"]')
    .fill("LO-A Empty PF")
  await page.getByTestId("monthly-contribution-input").fill("")
  await page
    .locator('[role="dialog"] button:has-text("Create portfolio")')
    .click()
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)

  const list = await page.request.get("/api/portfolios")
  const pf = ((await list.json()) as Array<{ id: number; name: string }>).find(
    (p) => p.name === "LO-A Empty PF"
  )
  expect(pf).toBeDefined()
  const id = pf!.id

  const caption = page.getByTestId(`settings-contribution-caption-${id}`)
  await expect(caption).toContainText("Not set yet")
  await expect(caption).not.toContainText("Nothing going in each month")
  await expect(page.getByTestId(`settings-contribution-${id}`)).toHaveValue("")

  await page.getByTestId(`settings-contribution-${id}`).fill("0")
  await page.getByTestId(`settings-contribution-${id}`).blur()
  await expect(caption).toContainText("Nothing going in each month")

  // The choice is stored, not just shown.
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/portfolios")
      const all = (await res.json()) as Array<{
        id: number
        contributionSet: boolean
      }>
      return all.find((p) => p.id === id)?.contributionSet
    })
    .toBe(true)
  await page.reload()
  await expect(
    page.getByTestId(`settings-contribution-caption-${id}`)
  ).toContainText("Nothing going in each month")
})

test("E2E-D-LO-R4-001 — a dismissed milestone stays gone in a fresh browser context, in the card and the bell", async ({
  page,
  browser,
  baseURL,
}) => {
  const milestoneId = await seedQuarterMilestone(page)
  await page.goto("/")
  const item = page.getByTestId(`milestone-${milestoneId}`)
  await expect(item).toBeVisible()
  await page.getByTestId(`dismiss-milestone-${milestoneId}`).click()
  await expect(item).toHaveCount(0)
  // The write is optimistic; wait until the server has it.
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/milestones")
      return ((await res.json()) as string[]).includes(milestoneId)
    })
    .toBe(true)

  const fresh = await browser.newContext({ baseURL })
  try {
    const other = await fresh.newPage()
    await other.goto("/")
    await expect(other.getByTestId("overview-headline")).toBeVisible()
    await expect(other.getByTestId(`milestone-${milestoneId}`)).toHaveCount(0)
    await other.getByTestId("notifications-trigger").click()
    await expect(
      other.getByTestId(`notification-milestone-${milestoneId}`)
    ).toHaveCount(0)
  } finally {
    await fresh.close()
  }
})
