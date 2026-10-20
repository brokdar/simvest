/**
 * D1 + D5 — the money field never silently re-reads what you typed, and it
 * shows what it will store while you type. Exercised in the entries grid (the
 * densest money field) on both desktop and mobile, in both number formats.
 */
import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

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

async function setLocale(page: Page, locale: string) {
  const r = await page.request.patch("/api/settings", { data: { locale } })
  expect(r.ok()).toBe(true)
}

/** Enter edit mode on portfolio 1 and return the newest row's value cell. */
async function editNewestValueCell(page: Page) {
  await preselectPortfolio(page, 1)
  await page.goto("/entries")
  await page.getByTestId("btn-edit-table").click()
  const row = page.locator('[data-testid="entries-table"] tbody tr').first()
  const id = (await row.getAttribute("data-testid"))!.replace("entry-row-", "")
  return { row, id, cell: page.getByTestId(`cell-value-${id}`) }
}

type Outcome =
  | { raw: string; echo: string }
  | { raw: string; error: RegExp; suggest?: string }

const DE: Outcome[] = [
  { raw: "1234,56", echo: "€1.234,56" },
  { raw: "1.234,56", echo: "€1.234,56" },
  { raw: "€ 1.234,56", echo: "€1.234,56" },
  { raw: "1.234", echo: "€1.234,00" },
  { raw: "0,5", echo: "€0,50" },
  // A portfolio value can't be negative (the field's min is 0).
  { raw: "-50", error: /Must be 0 or greater\./ },
  { raw: "200 + 1.000,50", echo: "€1.200,50" },
  {
    raw: "1234.56",
    error: /Did you mean 1\.234,56\?/,
    suggest: "Use 1.234,56",
  },
  {
    raw: "1,234.56",
    error: /Did you mean 1\.234,56\?/,
    suggest: "Use 1.234,56",
  },
  { raw: "12.5", error: /Did you mean 12,5\?/, suggest: "Use 12,50" },
  {
    raw: "1,234",
    error: /could be thousands or decimals/,
    suggest: "Use 1.234,00",
  },
  { raw: "200 + 1234.56", error: /“1234\.56”: Did you mean 1\.234,56\?/ },
  { raw: "abc", error: /Couldn't read "abc" as a number\. Try 36\.855,97\./ },
]

const EN: Outcome[] = [
  { raw: "1234.56", echo: "€1,234.56" },
  { raw: "1,234.56", echo: "€1,234.56" },
  { raw: "€ 1,234.56", echo: "€1,234.56" },
  { raw: "1,234", echo: "€1,234.00" },
  {
    raw: "1.234,56",
    error: /Did you mean 1,234\.56\?/,
    suggest: "Use 1,234.56",
  },
  {
    raw: "1234,56",
    error: /Did you mean 1,234\.56\?/,
    suggest: "Use 1,234.56",
  },
  {
    raw: "1.234",
    error: /could be thousands or decimals/,
    suggest: "Use 1,234.00",
  },
]

for (const [locale, table] of [
  ["de-DE", DE],
  ["en-US", EN],
] as const) {
  test(`E2E-X-MONEY-D1-${locale} — every input either echoes exactly or is rejected with its likely meaning`, async ({
    page,
  }) => {
    await setLocale(page, locale)
    const { cell, id } = await editNewestValueCell(page)
    const echo = page.getByTestId(`echo-cell-value-${id}`)
    const error = page.getByTestId(`error-cell-value-${id}`)
    const observed: string[] = []
    for (const o of table) {
      await cell.fill(o.raw)
      if ("echo" in o) {
        await expect(echo, o.raw).toHaveText(`= ${o.echo}`)
        await expect(error, o.raw).toHaveCount(0)
        observed.push(
          `${locale} | ${o.raw} | echo "${await echo.textContent()}"`
        )
      } else {
        await expect(error, o.raw).toBeVisible()
        await expect(error, o.raw).toHaveText(o.error)
        await expect(echo, o.raw).toHaveCount(0)
        const suggest = page.getByTestId(`suggest-cell-value-${id}`)
        if (o.suggest) await expect(suggest, o.raw).toHaveText(o.suggest)
        else await expect(suggest, o.raw).toHaveCount(0)
        observed.push(
          `${locale} | ${o.raw} | rejected "${(await error.innerText()).replace(/\s+/g, " ")}"`
        )
      }
    }
    console.log(`D1-OBSERVED\n${observed.join("\n")}`)
  })
}

test("E2E-X-MONEY-D1-010 — a rejected amount blocks Save; the suggestion fixes it and saves the right number", async ({
  page,
}) => {
  await setLocale(page, "de-DE")
  const { cell, id } = await editNewestValueCell(page)
  await cell.fill("1234.56")
  await cell.blur()
  await expect(page.getByTestId(`error-cell-value-${id}`)).toBeVisible()

  // Save is blocked with a row-level reason; nothing is POSTed.
  let posted = false
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/entries")) posted = true
  })
  await page.getByTestId("entries-grid-save").click()
  await expect(page.getByTestId(`row-error-${id}`)).toContainText(
    "Fix the Portfolio value amount"
  )
  await expect(page.getByTestId("entries-grid-status")).toContainText(
    "1 row needs a fix before saving."
  )
  expect(posted).toBe(false)

  // One tap on the suggestion applies the reading the parser proposed.
  await cell.focus()
  await page.getByTestId(`suggest-cell-value-${id}`).click()
  await expect(cell).toHaveValue("1.234,56")
  await expect(page.getByTestId(`error-cell-value-${id}`)).toHaveCount(0)
  await expect(page.getByTestId(`row-error-${id}`)).toHaveCount(0)

  const save = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/entries")
  )
  await page.getByTestId("entries-grid-save").click()
  expect((await save).ok()).toBe(true)
  const pf = (await (
    await page.request.get("/api/portfolios")
  ).json()) as Array<{
    id: number
    entries: Array<{ id: number; value: number | null }>
  }>
  const saved = pf[0].entries.find((e) => String(e.id) === id)
  expect(saved?.value).toBe(1234.56)
})

type Box = { x: number; y: number; width: number; height: number }
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5

// Desktop widths keep the echo inside the (wide) grid field; phone widths
// put it on its own line under the field. Either way it covers nothing.
const WIDTHS: Record<string, Array<[number, number]>> = {
  "chromium-desktop": [
    [1440, 900],
    [1280, 800],
  ],
  "mobile-safari": [
    [360, 740],
    [390, 844],
    [414, 896],
  ],
}

test("E2E-X-MONEY-D5-001 — the echo appears while typing, covers nothing, and goes on blur", async ({
  page,
}, testInfo) => {
  await setLocale(page, "de-DE")
  const { row, cell, id } = await editNewestValueCell(page)
  const echo = page.getByTestId(`echo-cell-value-${id}`)
  const desktop = testInfo.project.name === "chromium-desktop"

  for (const [w, h] of WIDTHS[testInfo.project.name] ?? []) {
    await page.setViewportSize({ width: w, height: h })
    await cell.blur()
    await cell.scrollIntoViewIfNeeded()
    const before = (await row.boundingBox())!
    await cell.fill("15740,93")
    await expect(echo).toHaveText("= €15.740,93")

    const e = (await echo.boundingBox())!
    const input = (await cell.boundingBox())!
    const td = (await cell.locator("xpath=ancestor::td[1]").boundingBox())!
    // The card label ("PORTFOLIO VALUE", a ::before on the cell) sits in the
    // cell above the field.
    const label = { x: td.x, y: td.y, width: td.width, height: input.y - td.y }
    expect(intersects(e, label), `${w}px: echo covers the label`).toBe(false)
    for (const other of [`cell-invested-${id}`, `cell-delta-${id}`]) {
      const ob = (await page.getByTestId(other).boundingBox())!
      expect(intersects(e, ob), `${w}px: echo covers ${other}`).toBe(false)
    }
    const inField =
      e.y >= input.y - 0.5 && e.y + e.height <= input.y + input.height + 0.5
    if (desktop) {
      expect(inField, `${w}px: echo sits inside the field`).toBe(true)
      // No row shift, and the typed digits have room left of the chip.
      const during = (await row.boundingBox())!
      expect(during.height).toBeCloseTo(before.height, 0)
      const padRight = await cell.evaluate((el) =>
        parseFloat(getComputedStyle(el).paddingRight)
      )
      expect(padRight).toBeGreaterThanOrEqual(e.width + 6)
    } else {
      expect(e.y, `${w}px: echo sits below the field`).toBeGreaterThanOrEqual(
        input.y + input.height
      )
    }
  }

  await cell.blur()
  await expect(echo).toHaveCount(0)
  await expect(cell).toHaveValue("15.740,93")
})

test("E2E-X-MONEY-D1-011 — while an amount is rejected, the row's M/M Δ shows — instead of a number", async ({
  page,
}) => {
  await setLocale(page, "de-DE")
  const { cell, id } = await editNewestValueCell(page)
  const delta = page.getByTestId(`cell-delta-${id}`)
  await cell.fill("15740,93")
  await cell.blur()
  await expect(delta).toContainText("€")
  await cell.fill("1234.56")
  await expect(page.getByTestId(`error-cell-value-${id}`)).toBeVisible()
  await expect(delta).toHaveText("—")
  // Fixing the amount brings the derived value back.
  await page.getByTestId(`suggest-cell-value-${id}`).click()
  await expect(delta).toContainText("€")
})
