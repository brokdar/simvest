import { test, expect } from "../fixtures"
import { seedThreeMonthGap } from "../gap-seed"

// R1 on a phone: the same gap, one collapsible group per account.

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
})

test.beforeEach(async ({ resetDb }) => {
  resetDb()
})

test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test("E2E-M-LO-B-001 — a 3-month gap on 2 accounts is filled in one Save on a phone", async ({
  page,
}) => {
  const { ids, months } = await seedThreeMonthGap(page)
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      /* ignore */
    }
  })
  const batches: string[] = []
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/entries/batch")) {
      batches.push(r.url())
    }
  })
  await page.goto("/entries")
  await expect(page.getByTestId("catchup-gap")).toBeVisible()

  let clicks = 0
  await page.getByTestId("catchup-gap-fill").click()
  clicks++
  await expect(page.getByTestId("gapfill-panel")).toBeVisible()
  const save = page.getByTestId("gapfill-save")
  await expect(save).toBeDisabled()

  for (const id of ids) {
    for (const { year, month } of months) {
      await page
        .getByTestId(`gapfill-value-${id}-${year}-${month}`)
        .fill(String(2000 + month))
    }
  }
  await expect(save).toBeEnabled()
  await expect(save).toHaveText(/Save 6 months/)
  await save.click()
  clicks++
  await expect(page.getByTestId("toast").last()).toContainText("Saved 6 months")
  await expect(page.getByTestId("gapfill-panel")).toHaveCount(0)

  expect(clicks).toBe(2)
  expect(batches).toHaveLength(1)
  const all = (await (await page.request.get("/api/portfolios")).json()) as {
    id: number
    entries: { year: number; month: number; value: number | null }[]
  }[]
  for (const id of ids) {
    const p = all.find((x) => x.id === id)!
    expect(p.entries).toHaveLength(4)
    for (const { year, month } of months) {
      expect(
        p.entries.find((e) => e.year === year && e.month === month)?.value
      ).toBe(2000 + month)
    }
  }
})
