import { test, expect } from "../fixtures"

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
})

test("E2E-D-P8-001 — 404 page renders inside the app shell", async ({
  page,
}) => {
  const res = await page.goto("/definitely-not-a-page")
  expect(res?.status()).toBe(404)
  await expect(
    page.getByRole("heading", { name: "Page not found" })
  ).toBeVisible()
  await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
  await expect(page.locator("nav")).not.toHaveCount(0)
  await expect(page.locator('[data-testid="topbar-crumb"]')).toContainText(
    "Page not found"
  )
  await expect(page.locator('[data-testid="topbar-crumb"]')).not.toContainText(
    "Overview"
  )
  await expect(
    page.locator('[data-testid="sidebar"] .nav-item.active')
  ).toHaveCount(0)
  await expect(
    page.getByRole("link", { name: "Back to overview" })
  ).toBeVisible()
})

test("E2E-D-P8-002 — entries table header stays visible while scrolling", async ({
  page,
}) => {
  await page.goto("/entries")
  const th = page.locator(".entries-table th.th-date")
  await expect(th).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 1500))
  await expect
    .poll(async () => (await th.boundingBox())?.y ?? -999)
    .toBeGreaterThanOrEqual(0)
  const box = await th.boundingBox()
  expect(box!.y).toBeLessThan(100)
})

test("E2E-D-P8-003 — goal badges on the projection chart fit inside their pill and the plot", async ({
  page,
}) => {
  await page.goto("/projection")
  const svg = page.locator('[data-testid="growth-chart-svg"]')
  await expect(svg).toBeVisible()
  const res = await svg.evaluate((el) => {
    const out: { text: string; spill: number; inPlot: boolean }[] = []
    const svgBox = el.getBoundingClientRect()
    el.querySelectorAll("g > rect + text").forEach((t) => {
      const rect = t.previousElementSibling as SVGRectElement
      const tb = t.getBoundingClientRect()
      const rb = rect.getBoundingClientRect()
      out.push({
        text: t.textContent ?? "",
        spill: Math.max(0, tb.right - rb.right, rb.left - tb.left),
        inPlot:
          rb.right <= svgBox.right &&
          rb.left >= svgBox.left &&
          rb.bottom <= svgBox.bottom - 36 + 1,
      })
    })
    return out
  })
  expect(res.length).toBeGreaterThan(0)
  for (const r of res) {
    expect(r.spill, `badge "${r.text}" spills`).toBeLessThanOrEqual(1)
    expect(r.inPlot, `badge "${r.text}" leaves the plot`).toBe(true)
  }
})

test("E2E-D-P8-004 — heatmap tooltip flips above a cell near the viewport bottom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/income")
  const cells = page.locator('[data-testid^="income-heatmap-cell-"]')
  await expect(cells.first()).toBeVisible()
  const cell = cells.last()
  await cell.evaluate((el) => el.scrollIntoView({ block: "end" }))
  await cell.hover()
  const tip = page.locator('[data-testid="income-heatmap-detail"]')
  await expect(tip).toBeVisible()
  const box = await tip.boundingBox()
  const vh = page.viewportSize()!.height
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(vh)
})

test("E2E-D-P8-005 — donut shows the hovered slice's value in its centre", async ({
  page,
}) => {
  await page.goto("/income")
  const donut = page.locator('svg[aria-label="Income by source"]')
  await expect(donut).toBeVisible()
  const centre = donut.locator("text").last()
  const total = await centre.textContent()
  // A real pointer on the ring (the slice's bbox centre can sit in the hole).
  await donut.scrollIntoViewIfNeeded()
  const d = (await donut.boundingBox())!
  await page.mouse.move(d.x + d.width / 2 + 75, d.y + d.height / 2)
  await expect(centre).not.toHaveText(total ?? "")
  await expect(centre).toContainText("€")
  await page.mouse.move(5, 5)
  await expect(centre).toHaveText(total ?? "")
})
