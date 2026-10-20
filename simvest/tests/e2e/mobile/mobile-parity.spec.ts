import type { Page } from "@playwright/test"
import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

/**
 * P9 — mobile parity: tap targets (M7), scroll affordances (M2), tap-to-read
 * charts (M3) and the sticky Save-all bar (M1), at 390x844 on touch WebKit.
 */

const ROUTES = [
  "/",
  "/projection",
  "/goals",
  "/income",
  "/entries",
  "/holdings",
  "/settings",
] as const

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-safari", "mobile only")
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      /* about:blank — ignore */
    }
  })
  await page.setViewportSize({ width: 390, height: 844 })
})

type TapIssue = { what: string; w: number; h: number }

/**
 * Every visible interactive element whose effective hit area is under 44x44.
 *
 * Effective hit area: the element's own box, or — for a form control — the
 * <label> wrapping/naming it (tapping the label activates the control).
 *
 * Exceptions (each one is a WCAG 2.5.8 exception or an equivalent target):
 *   - inline links inside a sentence (the "inline" exception): an <a> or
 *     .link-button whose parent also holds running text of its own;
 *   - SVG chart hit rects marked [data-chart-hit]: on touch the whole plot is
 *     the target (useChartTouch scrubs to the nearest month), so the owning
 *     <svg> must be >= 44x44 instead;
 *   - visually hidden controls (the sr-only sort header on mobile), which
 *     can't be tapped at all.
 */
function collectSmallTargets(): TapIssue[] {
  const SEL =
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="slider"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"], [tabindex="0"]'
  const hiddenUp = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === "none" || cs.visibility === "hidden") return true
      if (parseFloat(cs.opacity) === 0) return true
      if (cs.clipPath === "inset(50%)") return true
      const r = n.getBoundingClientRect()
      if (
        n !== el &&
        (r.width <= 1 || r.height <= 1) &&
        cs.overflow !== "visible"
      )
        return true
    }
    return false
  }
  const inSentence = (el: Element) => {
    if (!(el.matches("a") || el.matches(".link-button"))) return false
    const parent = el.parentElement
    if (!parent) return false
    return Array.from(parent.childNodes).some(
      (n) =>
        n.nodeType === Node.TEXT_NODE &&
        (n.textContent ?? "").replace(/[\s·—–,.]/g, "").length > 0
    )
  }
  const describe = (el: Element) => {
    const tid = el.getAttribute("data-testid")
    const label = el.getAttribute("aria-label")
    const text = (el.textContent ?? "").trim().slice(0, 30)
    return `${el.tagName.toLowerCase()}${tid ? `[${tid}]` : ""}${label ? `{${label.slice(0, 40)}}` : ""} "${text}"`
  }
  const out: TapIssue[] = []
  document.querySelectorAll(SEL).forEach((el) => {
    const r0 = el.getBoundingClientRect()
    if (r0.width === 0 || r0.height === 0) return
    if (hiddenUp(el)) return
    if (inSentence(el)) return
    let w = r0.width
    let h = r0.height
    if (el.hasAttribute("data-chart-hit")) {
      const svg = el.closest("svg")?.getBoundingClientRect()
      w = svg?.width ?? 0
      h = svg?.height ?? 0
    } else if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement
    ) {
      const label =
        el.closest("label") ??
        (el.id ? document.querySelector(`label[for="${el.id}"]`) : null)
      if (label) {
        const lr = label.getBoundingClientRect()
        w = Math.max(w, lr.width)
        h = Math.max(h, lr.height)
      }
    }
    // 0.5px tolerance for sub-pixel layout.
    if (w < 43.5 || h < 43.5)
      out.push({ what: describe(el), w: Math.round(w), h: Math.round(h) })
  })
  return out
}

async function settle(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator("h1").first()).toBeVisible()
  await page.waitForLoadState("networkidle")
}

test.describe("Mobile parity — tap targets (M7)", () => {
  for (const path of ROUTES) {
    test(`E2E-M-P9-TAP-${path === "/" ? "overview" : path.slice(1)} — every tap target on ${path} is at least 44x44`, async ({
      page,
    }) => {
      await preselectPortfolio(page, 1)
      await settle(page, path)
      const small = await page.evaluate(collectSmallTargets)
      expect(small, JSON.stringify(small, null, 1)).toEqual([])
    })
  }

  test("E2E-M-P9-TAP-nav — the open nav drawer's targets are at least 44x44", async ({
    page,
  }) => {
    await settle(page, "/")
    await page.getByTestId("nav-toggle").tap()
    await expect(page.getByTestId("mobile-drawer")).toBeVisible()
    const small = await page.evaluate(collectSmallTargets)
    expect(small, JSON.stringify(small, null, 1)).toEqual([])
  })
})

test.describe("Mobile parity — scroll affordance (M2)", () => {
  for (const path of ["/income", "/goals"]) {
    test(`E2E-M-P9-SCROLL-${path.slice(1)} — every horizontal scroller on ${path} shows an edge fade`, async ({
      page,
    }) => {
      await preselectPortfolio(page, 1)
      await settle(page, path)
      const scrollers = await page.evaluate(() =>
        Array.from(document.querySelectorAll("body *"))
          .filter((el) => {
            const ox = getComputedStyle(el).overflowX
            return (
              (ox === "auto" || ox === "scroll") &&
              el.scrollWidth > el.clientWidth + 1 &&
              el.getBoundingClientRect().width > 0
            )
          })
          .map((el, i) => {
            el.setAttribute("data-p9-scroller", String(i))
            return {
              i,
              faded: !!el.parentElement?.matches(".scroll-fade"),
            }
          })
      )
      expect(scrollers.length).toBeGreaterThan(0)
      for (const s of scrollers) {
        expect(s, `scroller ${s.i} sits in a .scroll-fade`).toEqual({
          i: s.i,
          faded: true,
        })
        const el = page.locator(`[data-p9-scroller="${s.i}"]`)
        const wrap = el.locator("xpath=..")
        // At rest: a fade on the right says "more this way", none on the left.
        await expect(wrap).toHaveAttribute("data-fade-end", "")
        await expect(wrap).not.toHaveAttribute("data-fade-start", "")
        await el.evaluate((n) => {
          n.scrollLeft = n.scrollWidth
        })
        await expect(wrap).toHaveAttribute("data-fade-start", "")
        await expect(wrap).not.toHaveAttribute("data-fade-end", "")
      }
    })
  }
})

test.describe("Mobile parity — charts answer a tap inline (M3)", () => {
  const docHeight = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollHeight)

  test("E2E-M-P9-M3-001 — tapping a Monthly Payouts bar shows its tooltip without navigating or growing the page", async ({
    page,
  }) => {
    await settle(page, "/income")
    const chart = page.getByTestId("income-monthly-chart")
    await chart.scrollIntoViewIfNeeded()
    const url = page.url()
    const before = await docHeight(page)
    const rows = await page.locator('[data-testid^="income-row-"]').count()

    await page.locator('[data-testid^="income-bar-hit-"]').last().tap()
    const tip = page.getByTestId("income-monthly-detail")
    await expect(tip).toBeVisible()

    expect(page.url()).toBe(url)
    expect(await docHeight(page)).toBeLessThanOrEqual(before + 50)
    expect(await page.locator('[data-testid^="income-row-"]').count()).toBe(
      rows
    )

    // Tap outside the chart dismisses it.
    await page.locator("h1").first().tap()
    await expect(tip).toBeHidden()
  })

  test("E2E-M-P9-M3-002 — tapping a heatmap cell shows its tooltip without navigating or growing the page", async ({
    page,
  }) => {
    await settle(page, "/income")
    const cellId = await page
      .locator('[data-testid^="income-heatmap-cell-"][data-status="paid"]')
      .first()
      .getAttribute("data-testid")
    expect(cellId).toBeTruthy()
    const cell = page.getByTestId(cellId!)
    await cell.scrollIntoViewIfNeeded()
    const url = page.url()
    const before = await docHeight(page)
    const rows = await page.locator('[data-testid^="income-row-"]').count()

    await cell.tap()
    const tip = page.getByTestId("income-heatmap-detail")
    await expect(tip).toBeVisible()

    expect(page.url()).toBe(url)
    expect(await docHeight(page)).toBeLessThanOrEqual(before + 50)
    expect(await page.locator('[data-testid^="income-row-"]').count()).toBe(
      rows
    )

    // A second tap on the same cell closes it again.
    await cell.tap()
    await expect(tip).toBeHidden()
  })
})

test.describe("Mobile parity — sticky Save-all bar (M1)", () => {
  test("E2E-M-P9-M1-001 — scrolling any row's delete into view leaves it clear of the sticky bars", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await settle(page, "/entries")
    await page.getByTestId("btn-edit-table").tap()
    await expect(page.getByTestId("entries-grid-save-footer")).toBeVisible()

    const covered = await page.evaluate(async () => {
      const out: string[] = []
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="row-delete-"]')
      ).filter((b) => b.getBoundingClientRect().width > 0)
      // Top-most row first, then a spread through the list (each one is
      // what the browser does when you focus/tab to it).
      const picks = buttons.filter((_, i) => i < 3 || i % 7 === 0)
      for (const b of picks) {
        window.scrollTo(0, document.documentElement.scrollHeight)
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        b.scrollIntoView({ block: "nearest" })
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r(null)))
        )
        const r = b.getBoundingClientRect()
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2
        )
        if (!hit || !b.contains(hit))
          out.push(`${b.dataset.testid} under ${hit?.className}`)
        window.scrollTo(0, 0)
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        b.scrollIntoView({ block: "nearest" })
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r(null)))
        )
        const r2 = b.getBoundingClientRect()
        const hit2 = document.elementFromPoint(
          r2.left + r2.width / 2,
          r2.top + r2.height / 2
        )
        if (!hit2 || !b.contains(hit2))
          out.push(`${b.dataset.testid} (from top) under ${hit2?.className}`)
      }
      return out
    })
    expect(covered).toEqual([])
  })
})

test.describe("Mobile parity — money echo never moves the layout", () => {
  test("E2E-M-P9-ECHO-001 — focusing and blurring a money field leaves Save exactly where it was", async ({
    page,
  }) => {
    await settle(page, "/entries")
    const field = page.getByTestId("catchup-value-1")
    const save = page.getByTestId("catchup-save")
    await field.scrollIntoViewIfNeeded()
    const rest = (await save.boundingBox())!

    await field.tap()
    await field.fill("1500")
    await expect(page.getByTestId("echo-catchup-value-1")).toBeVisible()
    const typing = (await save.boundingBox())!

    await field.blur()
    await expect(page.getByTestId("echo-catchup-value-1")).toHaveCount(0)
    const blurred = (await save.boundingBox())!

    expect(typing.y).toBeCloseTo(rest.y, 0)
    expect(blurred.y).toBeCloseTo(rest.y, 0)
  })

  test("E2E-M-P9-ECHO-002 — the dividend editor's Add button doesn't move when the amount field blurs", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await settle(page, "/income")
    await page.getByTestId("action-new-dividend").tap()
    const amount = page.getByTestId("income-event-amount")
    const submit = page.getByTestId("dividend-editor-submit")
    await amount.tap()
    await amount.fill("150")
    await expect(page.getByTestId("echo-income-event-amount")).toBeVisible()
    const typing = (await submit.boundingBox())!
    await amount.blur()
    await expect(page.getByTestId("echo-income-event-amount")).toHaveCount(0)
    const blurred = (await submit.boundingBox())!
    expect(blurred.y).toBeCloseTo(typing.y, 0)
  })
})
