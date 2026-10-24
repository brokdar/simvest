import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"
import { navClick, preselectPortfolio } from "../helpers"

// P6 — convenience: the monthly ritual (catch-up screen) and the links that
// lead from what a screen says to where you'd act on it.

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

// Reset before too: a spec that ran earlier on this worker may have left a
// changed contribution behind, and W8 reads the plan.
test.beforeEach(async ({ resetDb }) => {
  resetDb()
})

test.afterEach(async ({ resetDb }) => {
  resetDb()
})

type ApiPortfolio = {
  id: number
  name: string
  entries: {
    year: number
    month: number
    value: number | null
    invested: number
  }[]
}

async function createPortfolio(page: Page, name: string, contribution = 0) {
  const res = await page.request.post("/api/portfolios", {
    data: { name, targetMonthlyContribution: contribution },
  })
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { id: number }).id
}

async function portfolios(page: Page): Promise<ApiPortfolio[]> {
  return (await (
    await page.request.get("/api/portfolios")
  ).json()) as ApiPortfolio[]
}

/** Counts every real click the page receives (capture phase, survives
 *  client-side navigation; sessionStorage survives a full one). */
async function installClickCounter(page: Page) {
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
}
const clickCount = (page: Page) =>
  page.evaluate(() => Number(sessionStorage.getItem("p6-clicks") ?? 0))

const now = new Date()
const thisYear = now.getFullYear()
const thisMonth = now.getMonth() + 1

test("E2E-D-P6-W2-001 — four accounts logged from the Overview in under 8 clicks", async ({
  page,
}) => {
  await createPortfolio(page, "P6 Broker C", 300)
  await createPortfolio(page, "P6 Broker D")
  const all = await portfolios(page)
  expect(all).toHaveLength(4)

  await installClickCounter(page)
  await page.goto("/")
  await expect(page.getByTestId("kpi-portfolio-value")).toBeVisible()
  await page.evaluate(() => sessionStorage.setItem("p6-clicks", "0"))

  // 1 click: Monthly Entries. Combined lands on the catch-up form (W1).
  await navClick(page, "nav-entries", "**/entries")
  const panel = page.getByTestId("catchup-panel")
  await expect(panel).toBeVisible()

  // 4 clicks: one field per account, type its value.
  const values = [150_000, 140_000, 9_000, 1_234]
  for (const [i, p] of all.entries()) {
    await expect(page.getByTestId(`catchup-row-${p.id}`)).toContainText(p.name)
    await page.getByTestId(`catchup-value-${p.id}`).click()
    await page.keyboard.type(String(values[i]))
  }
  await expect(page.getByTestId("catchup-save")).toHaveText(/Save 4 accounts/)

  // 1 click: Save — one batch.
  const batch = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/entries/batch") && r.request().method() === "POST"
  )
  await page.getByTestId("catchup-save").click()
  expect((await batch).status()).toBe(200)
  await expect(page.getByTestId("toast").last()).toContainText(/for 4 accounts/)

  const clicks = await clickCount(page)
  expect(clicks).toBe(6)
  expect(clicks).toBeLessThan(8)

  // Every account now has this month's value; "Added" took each plan.
  const after = await portfolios(page)
  for (const [i, p] of all.entries()) {
    const saved = after
      .find((x) => x.id === p.id)!
      .entries.find((e) => e.year === thisYear && e.month === thisMonth)
    expect(saved?.value).toBe(values[i])
  }
  const c = after.find((x) => x.name === "P6 Broker C")!
  expect(
    c.entries.find((e) => e.year === thisYear && e.month === thisMonth)
      ?.invested
  ).toBe(300)
  // …and the form now says so.
  for (const p of all) {
    await expect(page.getByTestId(`catchup-last-${p.id}`)).toContainText(
      "Logged for"
    )
  }
})

test("E2E-D-P6-W2-002 — empty accounts are skipped; Save names what it writes", async ({
  page,
}) => {
  const [first, second] = await portfolios(page)
  await page.goto("/entries")
  const save = page.getByTestId("catchup-save")
  await expect(save).toBeDisabled()
  await expect(page.getByTestId("catchup-last-1")).toContainText(/Last .*2023/)

  await page.getByTestId(`catchup-value-${first.id}`).fill("70000")
  await expect(save).toHaveText(/Save 1 account$/)
  await expect(page.getByTestId("catchup-status")).toContainText(first.name)
  await expect(page.getByTestId("catchup-status")).not.toContainText(
    second.name
  )
  await save.click()
  await expect(page.getByTestId("toast").last()).toContainText(
    `for ${first.name}`
  )
  const after = await portfolios(page)
  const has = (id: number) =>
    after
      .find((p) => p.id === id)!
      .entries.some((e) => e.year === thisYear && e.month === thisMonth)
  expect(has(first.id)).toBe(true)
  expect(has(second.id)).toBe(false)
})

test("E2E-D-P6-W1-001 — Combined Entries is no dead end: New entry focuses the catch-up form", async ({
  page,
}) => {
  await page.goto("/entries")
  await expect(page.getByTestId("catchup-panel")).toBeVisible()
  await expect(page.getByTestId("combined-readonly-banner")).toHaveCount(0)
  const newEntry = page.getByTestId("action-new-entry")
  await expect(newEntry).toBeEnabled()
  await newEntry.click()
  await expect(page.getByTestId("catchup-value-1")).toBeFocused()
  // The table under it is the added-up history, read-only.
  await expect(page.getByTestId("entries-grid-mode-hint")).toContainText(
    "All accounts added up"
  )
})

test("E2E-D-P6-W3-001 — Holdings ranks every holding by 12-month income", async ({
  page,
}) => {
  await page.goto("/holdings")
  await page
    .getByTestId("holdings-order")
    .getByRole("radio", { name: "Top earners" })
    .click()
  const table = page.getByTestId("holdings-earners")
  await expect(table).toBeVisible()
  const rows = table.locator('tbody tr[data-testid^="earner-row-"]')
  expect(await rows.count()).toBeGreaterThan(2)
  const incomes = await rows
    .locator("td.td-holding-income")
    .evaluateAll((tds) =>
      tds.map((td) => {
        const t = (td.textContent ?? "").replace(/[^\d,.-]/g, "")
        if (!t) return 0
        // Accept either locale: strip group separators, normalise decimals.
        const n = t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".")
        return Number(n)
      })
    )
  const sorted = [...incomes].sort((a, b) => b - a)
  expect(incomes).toEqual(sorted)
  expect(incomes[0]).toBeGreaterThan(0)
  // The account each one sits in stays visible.
  await expect(rows.first().locator(".earner-account")).not.toBeEmpty()
})

test("E2E-D-P6-W5-001 — Income looks forward: next payouts and what's still due this month", async ({
  page,
}) => {
  await page.goto("/income")
  const card = page.getByTestId("income-coming-up")
  await expect(card).toBeVisible()
  await expect(page.getByTestId("income-due-this-month")).toContainText(
    /Still expected in \w+/
  )
  const list = page.getByTestId("income-coming-up-list")
  await expect(list.locator("li").first()).toBeVisible()
  // Every row either gives a date or says why it can't.
  const whens = await list
    .locator('[data-testid^="coming-up-when-"]')
    .allTextContents()
  expect(whens.length).toBeGreaterThan(0)
  for (const w of whens) {
    expect(w).toMatch(
      /Next around \d{1,2} \w{3} \d{4}|no rhythm|No fixed schedule|kept paying/
    )
  }
  // The seeded monthly payer gets a date from today on.
  await expect(list).toContainText("Realty Income")
})

test("E2E-D-P6-W6-001 — a stale account's link opens its entry form, not just the table", async ({
  page,
}) => {
  const res = await page.request.post("/api/portfolios", {
    data: { name: "P6 Quiet Broker" },
  })
  const { id } = (await res.json()) as { id: number }
  await page.request.post(`/api/portfolios/${id}/entries`, {
    data: { year: 2020, month: 6, day: 30, invested: 100, value: 1000 },
  })
  await page.goto("/")
  await page.getByTestId(`stale-link-${id}`).click()
  await expect(page).toHaveURL(/\/entries$/)
  await expect(
    page.locator('[data-testid="portfolio-switcher-trigger"] .pf-dd-name')
  ).toHaveText("P6 Quiet Broker")
  const draft = page.locator(
    '[data-testid="entries-table"] tbody tr[data-draft="true"]'
  )
  await expect(draft).toHaveCount(1)
})

test("E2E-D-P6-W6-002 — a behind goal on the Overview links to its fix and its account", async ({
  page,
}) => {
  const res = await page.request.post("/api/goals", {
    data: {
      name: "P6 Moonshot",
      kind: "portfolio_value",
      scope: "portfolio",
      portfolioId: 2,
      target: 50_000_000,
      targetYear: thisYear + 3,
    },
  })
  expect(res.status()).toBe(201)
  await page.goto("/")
  const item = page.getByTestId("goal-item").filter({ hasText: "P6 Moonshot" })
  await expect(item.getByTestId("goal-item-account")).toHaveText(
    "Dividend Income"
  )
  const fix = item.getByTestId("goal-item-fix")
  await expect(fix).toHaveAttribute("href", "/settings#contribution-2")
  await fix.click()
  await expect(page).toHaveURL(/\/settings#contribution-2$/)
  await expect(page.locator("#contribution-2")).toBeVisible()
})

test("E2E-D-P6-W6-003 — a holding's dividends link to its payouts", async ({
  page,
}) => {
  await page.goto("/holdings")
  const link = page.locator('[data-testid^="holding-payouts-link-"]').first()
  const testId = (await link.getAttribute("data-testid"))!
  const holdingId = testId.replace("holding-payouts-link-", "")
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/income\\?holding=${holdingId}$`))
  await expect(page.getByTestId("income-holding-filter")).toBeVisible()
})

test("E2E-D-P6-W8-001 — Overview KPIs carry last month's move and the plan", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  const p = (await portfolios(page)).find((x) => x.id === 1)!
  const [prev, last] = p.entries.slice(-2)
  const valueDelta = last.value! - prev.value!
  const market = valueDelta - last.invested
  await page.goto("/")
  const fmt = (n: number) => String(Math.round(Math.abs(n)))
  const valueMom = page.getByTestId("kpi-portfolio-value-mom")
  await expect(valueMom).toContainText(/in Dec ’23/)
  await expect(valueMom).toContainText(/[+−-]€/)
  const netMom = page.getByTestId("kpi-net-gain-mom")
  await expect(netMom).toContainText("from the market in Dec ’23")
  const digits = (s: string) => s.replace(/\D/g, "")
  expect(digits((await valueMom.textContent())!)).toContain(fmt(valueDelta))
  expect(digits((await netMom.textContent())!)).toContain(fmt(market))
  // P7 follow-up: the ↑/↓ sits on the same line as its sentence — it used to
  // wrap alone above "+€… from the market" when the card got narrow.
  for (const width of [1440, 1280, 1100]) {
    await page.setViewportSize({ width, height: 900 })
    const tops = await netMom.evaluate((el) => {
      const arrow = el.querySelector(".kpi-mom-arrow")
      const text = Array.from(el.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ""
      )
      if (!arrow || !text) return null
      const range = document.createRange()
      range.selectNodeContents(text)
      return {
        arrow: arrow.getBoundingClientRect().top,
        text: range.getClientRects()[0].top,
      }
    })
    expect(tops, `arrow and text at ${width}px`).not.toBeNull()
    expect(Math.abs(tops!.arrow - tops!.text)).toBeLessThanOrEqual(2)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  // Seed: €1.000 added every month against a €1.000 plan.
  await expect(page.getByTestId("kpi-total-invested-plan")).toContainText(
    /added in Dec ’23 · on plan/
  )
  await expect(page.getByTestId("kpi-dividends-yoy")).toContainText(
    "vs the 12 months before"
  )
})

test("E2E-D-P6-M8-001 — Entries jumps straight to a month", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.getByTestId("entries-jump").click()
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Previous year" }).click()
  }
  await page.getByRole("gridcell", { name: "Mar" }).click()
  const row = page.locator(
    '[data-testid="entries-table"] tr[data-month="2020-3"]'
  )
  await expect(row).toBeInViewport()
  await expect(row).toHaveAttribute("data-flash", "true")
})

test("E2E-D-P6-L9-001 — empty notes render nothing, not an em-dash per row", async ({
  page,
}) => {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  const notes = page.locator('[data-testid="entries-table"] td.td-note')
  expect(await notes.count()).toBeGreaterThan(50)
  const texts = await notes.allTextContents()
  expect(texts.filter((t) => t.trim() === "—")).toHaveLength(0)
})
