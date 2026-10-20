import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"
import { navClick, preselectPortfolio } from "../helpers"

// P6 on a phone: the monthly catch-up and the month jump.

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

type ApiPortfolio = {
  id: number
  name: string
  entries: { year: number; month: number; value: number | null }[]
}

async function portfolios(page: Page): Promise<ApiPortfolio[]> {
  return (await (
    await page.request.get("/api/portfolios")
  ).json()) as ApiPortfolio[]
}

test("E2E-M-P6-W2-001 — four accounts logged on a phone in under 8 taps", async ({
  page,
}) => {
  for (const name of ["P6 Broker C", "P6 Broker D"]) {
    const res = await page.request.post("/api/portfolios", { data: { name } })
    expect(res.ok()).toBe(true)
  }
  const all = await portfolios(page)
  expect(all).toHaveLength(4)

  await page.addInitScript(() => {
    document.addEventListener(
      "click",
      () => {
        const n = Number(sessionStorage.getItem("p6-clicks") ?? 0) + 1
        sessionStorage.setItem("p6-clicks", String(n))
      },
      true
    )
  })
  await page.goto("/")
  await expect(page.getByTestId("kpi-portfolio-value")).toBeVisible()
  await page.evaluate(() => sessionStorage.setItem("p6-clicks", "0"))

  // 2 taps: menu + Monthly Entries.
  await navClick(page, "nav-entries", "**/entries")
  await expect(page.getByTestId("catchup-panel")).toBeVisible()

  // 4 taps: one field per account.
  for (const [i, p] of all.entries()) {
    const field = page.getByTestId(`catchup-value-${p.id}`)
    await field.scrollIntoViewIfNeeded()
    await field.click()
    await page.keyboard.type(String(10_000 * (i + 1)))
  }
  // 1 tap: Save.
  const save = page.getByTestId("catchup-save")
  await save.scrollIntoViewIfNeeded()
  const box = (await save.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  await save.click()
  await expect(page.getByTestId("toast").last()).toContainText(/for 4 accounts/)

  const taps = await page.evaluate(() =>
    Number(sessionStorage.getItem("p6-clicks") ?? 0)
  )
  expect(taps).toBe(7)
  expect(taps).toBeLessThan(8)

  const now = new Date()
  const after = await portfolios(page)
  for (const [i, p] of all.entries()) {
    const saved = after
      .find((x) => x.id === p.id)!
      .entries.find(
        (e) => e.year === now.getFullYear() && e.month === now.getMonth() + 1
      )
    expect(saved?.value).toBe(10_000 * (i + 1))
  }
})

test("E2E-M-P6-W2-002 — the catch-up form fits a phone: no sideways scroll", async ({
  page,
}) => {
  await page.goto("/entries")
  const panel = page.getByTestId("catchup-panel")
  await expect(panel).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  expect(overflow).toBe(false)
  const box = (await panel.boundingBox())!
  const vw = page.viewportSize()!.width
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vw)
})

test("E2E-M-P6-M8-001 — Entries jumps straight to a month on a phone", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.getByTestId("entries-jump").click()
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Previous year" }).click()
  }
  await page.getByRole("gridcell", { name: "Jun" }).click()
  const row = page.locator(
    '[data-testid="entries-table"] tr[data-month="2021-6"]'
  )
  await expect(row).toBeInViewport()
})
