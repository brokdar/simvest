/**
 * N6 — a fresh portfolio with a single entry must not show an annualised
 * growth rate (it used to render a 31-digit CAGR that overflowed the card).
 */
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

test.afterEach(async ({ resetDb }) => {
  resetDb()
})

test("E2E-X-OV-N6-001 — one entry: 'not enough history yet', no absurd CAGR, nothing overflows", async ({
  page,
}) => {
  const res = await page.request.post("/api/portfolios", {
    data: { name: "N6 Fresh", startingValue: 100, startingDate: "2026-08" },
  })
  expect(res.status()).toBe(201)
  const { id } = (await res.json()) as { id: number }
  const e = await page.request.post(`/api/portfolios/${id}/entries`, {
    data: { year: 2026, month: 9, day: 30, invested: 100, value: 100000 },
  })
  expect(e.ok()).toBe(true)

  await preselectPortfolio(page, id)
  await page.goto("/")
  const card = page.getByTestId("kpi-net-gain")
  const cagr = page.getByTestId("kpi-net-gain-cagr")
  await expect(cagr).toHaveText("CAGR · not enough history yet")
  await expect(card).not.toContainText(/\d{5,}%/)

  // The card's content fits inside it.
  const overflow = await card.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return Array.from(el.querySelectorAll("*")).some((c) => {
      const b = c.getBoundingClientRect()
      return b.right > r.right + 1 || c.scrollWidth > c.clientWidth + 1
    })
  })
  expect(overflow).toBe(false)
})
