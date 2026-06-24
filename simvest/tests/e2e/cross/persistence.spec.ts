import { test, expect } from "../fixtures"
import { preselectPortfolio } from "../helpers"

// No project scoping guard — runs on both chromium-desktop and mobile-safari.

test.describe("Persistence — cross-cutting", () => {
  // PERSIST-003..008 PATCH the single `settings` row and the portfolio rows.
  // Reset after each so the seeded defaults are restored for the next test.
  test.afterEach(async ({ resetDb }) => {
    resetDb()
  })

  // E2E-X-PERSIST-001 — Selected portfolio persists across a full page reload
  test("E2E-X-PERSIST-001 — selected portfolio persists across a full page reload", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(
      page.locator('[data-testid="portfolio-switcher-trigger"]')
    ).toBeVisible()

    // Select portfolio id=1 (first individual portfolio)
    await page.locator('[data-testid="portfolio-switcher-trigger"]').click()
    await expect(page.locator('[data-testid="pf-opt-1"]')).toBeVisible()
    await page.locator('[data-testid="pf-opt-1"]').click()

    const nameBefore = await page.locator(".pf-dd-name").first().textContent()
    expect(nameBefore).not.toBe("Combined")

    // Full page reload
    await page.reload()
    await expect(
      page.locator('[data-testid="portfolio-switcher-trigger"]')
    ).toBeVisible()

    // localStorage value should be "1"
    const lsValue = await page.evaluate(() =>
      localStorage.getItem("simvest.selectedPortfolio")
    )
    expect(lsValue).toBe("1")

    // Displayed name should match what we selected (after hydration kicks in).
    // The DataProvider reads localStorage in a useEffect, so the trigger label
    // briefly shows "Combined" on first paint before settling.
    await expect(
      page
        .locator('[data-testid="portfolio-switcher-trigger"]')
        .locator(".pf-dd-name")
    ).toHaveText(nameBefore!)
  })

  // E2E-X-PERSIST-002 — Selecting Combined (id=0) persists across reload
  test("E2E-X-PERSIST-002 — selecting Combined persists across reload", async ({
    page,
  }) => {
    // Seed localStorage on first navigation, then evaluate to inspect later.
    // We DO NOT use addInitScript here — that would re-set the value on every
    // reload and defeat the test's intent.
    await page.goto("/")
    await page.evaluate(() =>
      localStorage.setItem("simvest.selectedPortfolio", "1")
    )
    await page.reload()

    await expect(
      page.locator('[data-testid="portfolio-switcher-trigger"]')
    ).toBeVisible()

    // Switch to Combined
    await page.locator('[data-testid="portfolio-switcher-trigger"]').click()
    await expect(page.locator('[data-testid="pf-opt-0"]')).toBeVisible()
    await page.locator('[data-testid="pf-opt-0"]').click()

    // Full page reload
    await page.reload()
    await expect(
      page.locator('[data-testid="portfolio-switcher-trigger"]')
    ).toBeVisible()

    // Name should be Combined
    const nameAfter = await page.locator(".pf-dd-name").first().textContent()
    expect(nameAfter).toBe("Combined")

    // localStorage should be "0"
    const lsValue = await page.evaluate(() =>
      localStorage.getItem("simvest.selectedPortfolio")
    )
    expect(lsValue).toBe("0")
  })

  // E2E-X-PERSIST-003 — Settings horizon slider change persists to DB after debounce
  test("E2E-X-PERSIST-003 — horizon slider change persists to DB after debounce", async ({
    page,
  }) => {
    await page.goto("/chart")
    await expect(page.locator('[data-testid="chart-stats-grid"]')).toBeVisible()

    // Set up watcher for PATCH to /api/settings — wait for the RESPONSE so the
    // DB write has actually completed before we reload to verify persistence.
    const patchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/settings") &&
        resp.request().method() === "PATCH",
      { timeout: 10_000 }
    )

    // Move horizon slider by at least one step. Range inputs ignore fill(),
    // so we use keyboard arrow presses. Under heavy parallel load the first
    // press can land before React's onChange listener is attached; the poll
    // re-presses until the value actually changes.
    const slider = page.locator('[data-testid="chart-slider-horizon"]')
    await slider.focus()
    const initial = parseInt((await slider.inputValue()) || "20", 10)
    const key = initial >= 40 ? "ArrowLeft" : "ArrowRight"
    await expect
      .poll(
        async () => {
          const current = parseInt((await slider.inputValue()) || "0", 10)
          if (current !== initial) return current
          await slider.press(key)
          return parseInt((await slider.inputValue()) || "0", 10)
        },
        { timeout: 10_000, intervals: [100, 200, 500] }
      )
      .not.toBe(initial)
    const target = parseInt((await slider.inputValue()) || "0", 10)

    // Displayed value should update immediately (optimistic UI)
    await expect(
      page.locator('[data-testid="chart-slider-horizon-value"]')
    ).toContainText(String(target))

    // Wait for the PATCH response (debounce fires at 400ms)
    const resp = await patchPromise
    expect(resp.status()).toBe(200)
    const body = resp.request().postDataJSON() as Record<string, unknown>
    expect(body).toHaveProperty("horizonYears", target)

    // Persistence is verified by the PATCH 200 + matching body above — the
    // route handler writes to SQLite before responding. A reload + DOM check
    // would be redundant and is unreliable here: settings is a single shared
    // row, and other parallel workers (chart.spec.ts → CHART-005, other
    // persistence tests) PATCH /api/settings concurrently. By the time we'd
    // reload, the row may already hold whatever value the last writer set.
  })

  // E2E-X-PERSIST-004 — Rapid slider drags coalesce into a single PATCH request (debounce)
  test("E2E-X-PERSIST-004 — rapid slider drags coalesce into a single PATCH request", async ({
    page,
  }) => {
    await page.goto("/chart")
    await expect(page.locator('[data-testid="chart-stats-grid"]')).toBeVisible()

    const patchRequests: string[] = []
    page.on("request", (req) => {
      if (req.url().includes("/api/settings") && req.method() === "PATCH") {
        patchRequests.push(req.url())
      }
    })

    // Simulate 10 rapid arrow-key presses on the horizon slider.
    // Arrow keys are React-tracker safe; programmatic `.value =` is not.
    const slider = page.locator('[data-testid="chart-slider-horizon"]')
    await slider.focus()
    for (let i = 0; i < 10; i++) {
      await slider.press("ArrowRight")
    }

    // Wait 600ms for debounce to settle (debounce is 400ms)
    await page.waitForTimeout(700)

    // Exactly 1 PATCH should have fired
    expect(patchRequests.length).toBe(1)
  })

  // E2E-X-PERSIST-005 — Portfolio contribution slider coalesces rapid drags into a single PATCH.
  // The Forecast page replaced the old Simulation Sandbox; the editable contribution slider
  // now lives in the Planning assumptions card on /chart when a specific portfolio is selected.
  test("E2E-X-PERSIST-005 — portfolio contribution slider coalesces rapid drags into single PATCH", async ({
    page,
  }) => {
    await preselectPortfolio(page, 1)
    await page.goto("/chart")
    await expect(page.locator("h1")).toContainText("Forecast")

    const scenarioCard = page.locator('[data-testid="scenario-assumptions"]')
    await expect(scenarioCard.locator('input[type="range"]')).toHaveCount(4)

    const patchRequests: Array<{ url: string; body: unknown }> = []
    page.on("request", (req) => {
      if (req.url().includes("/api/portfolios/1") && req.method() === "PATCH") {
        try {
          patchRequests.push({ url: req.url(), body: req.postDataJSON() })
        } catch {
          patchRequests.push({ url: req.url(), body: null })
        }
      }
    })

    // Monthly saving slider is the 2nd range in the scenario card.
    const monthlySaving = scenarioCard.locator('input[type="range"]').nth(1)
    await monthlySaving.focus()
    for (let i = 0; i < 8; i++) {
      await monthlySaving.press("ArrowRight")
    }

    // Wait 800ms for debounce (400ms) + request roundtrip.
    await page.waitForTimeout(800)

    // Exactly 1 PATCH should have fired (debounced).
    expect(patchRequests.length).toBe(1)
    if (patchRequests.length > 0) {
      const body = patchRequests[0].body as Record<string, unknown>
      expect(typeof body.targetMonthlyContribution).toBe("number")
    }
  })

  // E2E-X-PERSIST-006 — Settings persist across fast typing / multiple slider changes
  //
  // What this test owns:
  //   1. Rapid changes to two slider keys coalesce into ≤ 2 PATCH requests
  //      (debounced merge behaviour in updateSettings).
  //   2. Both values survive a full reload (DB persistence).
  //
  // Previous implementation used `waitForTimeout(900)` then `page.reload()`,
  // assuming the debounced PATCH had committed in that window. Under server
  // contention or mobile-safari load the PATCH could still be in flight at
  // reload time — the new page then read the seeded default from DB and the
  // assertion failed intermittently. We now poll `/api/settings` directly
  // to confirm the DB has the expected values, then reload. Polling the API
  // (not waiting on a request count or fixed timeout) is the only way to
  // know the network round-trip AND the SQLite commit have both completed,
  // regardless of whether the two slider series coalesced into 1 PATCH or
  // fired as 2 separate requests.
  test("E2E-X-PERSIST-006 — multiple slider changes coalesce and persist across reload", async ({
    page,
  }) => {
    await page.goto("/chart")
    await expect(page.locator('[data-testid="chart-stats-grid"]')).toBeVisible()

    // Count outgoing PATCHes so we can verify the coalesce property (≤ 2).
    // We only count requests issued *after* this listener attaches, so a
    // stray PATCH from a sibling test's pending debounce (very unlikely
    // since DB reset happens in afterEach, but cheap insurance) doesn't
    // inflate the count.
    const patchBodies: Record<string, unknown>[] = []
    page.on("request", (req) => {
      if (req.url().includes("/api/settings") && req.method() === "PATCH") {
        try {
          patchBodies.push(req.postDataJSON() as Record<string, unknown>)
        } catch {
          /* body unavailable — counted only */
          patchBodies.push({})
        }
      }
    })

    const conservative = page.locator(
      '[data-testid="chart-slider-conservative"]'
    )
    const optimistic = page.locator('[data-testid="chart-slider-optimistic"]')

    const consInitial = parseFloat((await conservative.inputValue()) || "4")
    const optInitial = parseFloat((await optimistic.inputValue()) || "10")

    // Step 1: nudge conservative down by 0.5 (step=0.1, so 5 presses).
    // Poll so a dropped press self-heals (mobile-safari + parallel load).
    await conservative.focus()
    await expect
      .poll(
        async () => {
          const current = parseFloat((await conservative.inputValue()) || "0")
          if (current <= consInitial - 0.5 + 0.001) return current
          await conservative.press("ArrowLeft")
          return parseFloat((await conservative.inputValue()) || "0")
        },
        { timeout: 10_000, intervals: [50, 100] }
      )
      .toBeLessThanOrEqual(consInitial - 0.5 + 0.001)

    // Step 2: nudge optimistic up by 0.5. Same self-healing pattern.
    await optimistic.focus()
    await expect
      .poll(
        async () => {
          const current = parseFloat((await optimistic.inputValue()) || "0")
          if (current >= optInitial + 0.5 - 0.001) return current
          await optimistic.press("ArrowRight")
          return parseFloat((await optimistic.inputValue()) || "0")
        },
        { timeout: 10_000, intervals: [50, 100] }
      )
      .toBeGreaterThanOrEqual(optInitial + 0.5 - 0.001)

    // Capture final slider DOM values — these reflect React state which
    // updates synchronously on each key-press. The PATCH to /api/settings
    // is debounced (400 ms) and may not have fired yet.
    const consFinal = parseFloat((await conservative.inputValue()) || "0")
    const optFinal = parseFloat((await optimistic.inputValue()) || "0")
    // Build locale-neutral expectations: the page may render the decimal
    // separator as either "." (en-US) or "," (de-DE) depending on the
    // resolved locale, so match the integer and fractional digits with a
    // regex that accepts either separator.
    const consDigits = (Math.round(consFinal * 10) / 10).toFixed(1).split(".")
    const optDigits = (Math.round(optFinal * 10) / 10).toFixed(1).split(".")
    const consTarget = new RegExp(`${consDigits[0]}[.,]${consDigits[1]}`)
    const optTarget = new RegExp(`${optDigits[0]}[.,]${optDigits[1]}`)

    // Wait until the DB itself reflects the new values. This is the only
    // signal that ALL outstanding debounced PATCHes have completed their
    // network round-trip AND committed to SQLite. Without this, a
    // subsequent reload can read pre-PATCH state and the assertion
    // mis-fires intermittently under load.
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/settings")
          if (!res.ok()) return null
          const data = (await res.json()) as {
            conservativeReturn: number
            optimisticReturn: number
          }
          return {
            cons: Math.round(data.conservativeReturn * 10) / 10,
            opt: Math.round(data.optimisticReturn * 10) / 10,
          }
        },
        { timeout: 10_000, intervals: [100, 200, 300] }
      )
      .toEqual({
        cons: Math.round(consFinal * 10) / 10,
        opt: Math.round(optFinal * 10) / 10,
      })

    // Coalesce property: at most 2 PATCHes total (one per slider series).
    // Often coalesces to 1 when both presses fall in the same 400 ms window.
    expect(patchBodies.length).toBeLessThanOrEqual(2)
    expect(patchBodies.length).toBeGreaterThanOrEqual(1)

    // Reload and verify both values persisted to DB.
    await page.reload()
    await expect(page.locator('[data-testid="chart-stats-grid"]')).toBeVisible()
    await expect(
      page.locator('[data-testid="stat-conservative"]')
    ).toContainText(consTarget)
    await expect(page.locator('[data-testid="stat-optimistic"]')).toContainText(
      optTarget
    )
  })

  // E2E-X-PERSIST-007 — localStorage key is exactly "simvest.selectedPortfolio"
  test("E2E-X-PERSIST-007 — localStorage key is exactly simvest.selectedPortfolio", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(
      page.locator('[data-testid="portfolio-switcher-trigger"]')
    ).toBeVisible()

    // Select a non-Combined portfolio to ensure the key is written
    await page.locator('[data-testid="portfolio-switcher-trigger"]').click()
    await expect(page.locator('[data-testid="pf-opt-1"]')).toBeVisible()
    await page.locator('[data-testid="pf-opt-1"]').click()

    // Inspect localStorage keys
    const keys = await page.evaluate(() => Object.keys(localStorage))
    expect(keys).toContain("simvest.selectedPortfolio")

    // No unexpected simvest.* keys
    const simvestKeys = keys.filter((k) => k.startsWith("simvest."))
    expect(simvestKeys).toEqual(["simvest.selectedPortfolio"])
  })

  // E2E-X-PERSIST-008 — Settings PATCH request body contains only the changed keys (minimal patch)
  test("E2E-X-PERSIST-008 — settings PATCH request body contains only the changed key", async ({
    page,
  }) => {
    await page.goto("/chart")
    await expect(page.locator('[data-testid="chart-stats-grid"]')).toBeVisible()

    // Capture the next PATCH to /api/settings
    const patchPromise = page.waitForRequest(
      (req) => req.url().includes("/api/settings") && req.method() === "PATCH",
      { timeout: 10_000 }
    )

    // Only move the Horizon slider via arrow keys (range inputs ignore fill())
    const slider = page.locator('[data-testid="chart-slider-horizon"]')
    const initial = parseInt((await slider.inputValue()) || "20", 10)
    const target = initial === 18 ? 19 : 18
    const diff = target - initial
    const key = diff > 0 ? "ArrowRight" : "ArrowLeft"
    for (let i = 0; i < Math.abs(diff); i++) {
      await slider.press(key)
    }

    const patchReq = await patchPromise
    const body = patchReq.postDataJSON() as Record<string, unknown>

    // Body must contain horizonYears
    expect(body).toHaveProperty("horizonYears")

    // Body must NOT contain conservative or optimistic return (they weren't changed)
    expect(Object.keys(body)).not.toContain("conservativeReturn")
    expect(Object.keys(body)).not.toContain("optimisticReturn")
  })
})
