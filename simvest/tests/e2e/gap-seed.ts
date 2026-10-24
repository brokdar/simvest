import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

export type GapSeed = {
  ids: number[]
  /** The three months both accounts are missing, oldest first. */
  months: { year: number; month: number }[]
}

/**
 * Replaces the seeded accounts with two that stopped logging exactly three
 * due months ago (the current month counts once the entry day has come).
 */
export async function seedThreeMonthGap(page: Page): Promise<GapSeed> {
  await page.request.delete("/api/portfolios/1")
  await page.request.delete("/api/portfolios/2")
  await page.request.patch("/api/settings", {
    data: { defaultEntryDay: "last" },
  })
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const lastDay = new Date(y, m + 1, 0).getDate()
  const dueIdx = y * 12 + m - (now.getDate() >= lastDay ? 0 : 1)
  const at = (idx: number) => ({
    year: Math.floor(idx / 12),
    month: (idx % 12) + 1,
  })
  const ids: number[] = []
  for (const [name, contribution] of [
    ["Gap Broker A", 200],
    ["Gap Broker B", 0],
  ] as const) {
    const res = await page.request.post("/api/portfolios", {
      data: { name, targetMonthlyContribution: contribution },
    })
    expect(res.ok()).toBe(true)
    const { id } = (await res.json()) as { id: number }
    ids.push(id)
    const last = at(dueIdx - 3)
    const e = await page.request.post(`/api/portfolios/${id}/entries`, {
      data: { ...last, day: 28, invested: 100, value: 1000 },
    })
    expect(e.ok()).toBe(true)
  }
  return { ids, months: [1, 2, 3].map((n) => at(dueIdx - 3 + n)) }
}
