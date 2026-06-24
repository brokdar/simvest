import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { db } from "@/lib/db"
import {
  portfolios,
  entries,
  holdings,
  dividendEvents,
  goals,
} from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import { exportPortfolio } from "@/lib/transfer/export-portfolio"

beforeAll(async () => {
  await ensureSeeded()
})

beforeEach(() => {
  db.delete(dividendEvents).run()
  db.delete(holdings).run()
  db.delete(goals).run()
  db.delete(entries).run()
  db.delete(portfolios).run()
})

function seedRichPortfolio() {
  const p = db
    .insert(portfolios)
    .values({
      name: "Test Portfolio",
      color: "#1E40AF",
      targetMonthlyContribution: 500,
      startingValue: 0,
      startingDate: null,
      createdAt: 1700000000000,
    })
    .returning()
    .get()

  db.insert(entries)
    .values([
      {
        portfolioId: p.id,
        year: 2025,
        month: 1,
        day: 31,
        invested: 1500,
        value: 1623.4567,
        note: "",
      },
      {
        portfolioId: p.id,
        year: 2025,
        month: 2,
        day: 28,
        invested: 1500,
        value: null,
        note: "",
      },
    ])
    .run()

  const hWithIsin = db
    .insert(holdings)
    .values({
      portfolioId: p.id,
      name: "Vanguard FTSE All-World",
      type: "etf",
      isin: "IE00BK5BQT80",
      createdAt: 1700000000001,
    })
    .returning()
    .get()
  const hNoIsin = db
    .insert(holdings)
    .values({
      portfolioId: p.id,
      name: "ISIN-less position",
      type: "stock",
      isin: null,
      createdAt: 1700000000002,
    })
    .returning()
    .get()

  db.insert(dividendEvents)
    .values([
      {
        portfolioId: p.id,
        holdingId: hWithIsin.id,
        paidDate: "2025-03-15",
        amount: 23.45,
        kind: "dividend",
        tax: 6.18,
        note: "",
        sourceBroker: "trade_republic",
        sourceTransactionId: "abc-123",
        createdAt: 1710000000000,
      },
      {
        portfolioId: p.id,
        holdingId: hNoIsin.id,
        paidDate: "2025-03-16",
        amount: 5.5,
        kind: "dividend",
        tax: 0,
        note: "",
        sourceBroker: null,
        sourceTransactionId: null,
        createdAt: 1710000000001,
      },
      {
        portfolioId: p.id,
        holdingId: null,
        paidDate: "2025-04-01",
        amount: 1.12,
        kind: "interest",
        tax: 0,
        note: "",
        sourceBroker: null,
        sourceTransactionId: null,
        createdAt: 1712000000000,
      },
    ])
    .run()

  db.insert(goals)
    .values([
      {
        name: "ETF target 2045",
        color: "#059669",
        kind: "portfolio_value",
        scope: "portfolio",
        portfolioId: p.id,
        target: 250000,
        targetYear: 2045,
        swr: null,
        yieldAssumed: null,
        createdAt: 1700000000000,
      },
      {
        // Combined goal — must NOT appear in the export.
        name: "Combined goal",
        color: "#1E40AF",
        kind: "annual_income",
        scope: "combined",
        portfolioId: null,
        target: 50000,
        targetYear: 2050,
        swr: 4,
        yieldAssumed: null,
        createdAt: 1700000000001,
      },
    ])
    .run()

  return p
}

describe("exportPortfolio", () => {
  it("UNIT-TRANSFER-EXPORT-001 — returns 404 for unknown portfolio", async () => {
    const r = await exportPortfolio(99999)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(404)
  })

  it("UNIT-TRANSFER-EXPORT-002 — emits version + kind discriminator", async () => {
    const p = seedRichPortfolio()
    const r = await exportPortfolio(p.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.file.version).toBe(1)
    expect(r.file.kind).toBe("simvest.portfolio")
  })

  it("UNIT-TRANSFER-EXPORT-003 — preserves null entries.value", async () => {
    const p = seedRichPortfolio()
    const r = await exportPortfolio(p.id)
    if (!r.ok) throw new Error("export failed")
    const nullEntry = r.file.entries.find((e) => e.value === null)
    expect(nullEntry).toBeDefined()
    expect(nullEntry?.value).toBe(null)
  })

  it("UNIT-TRANSFER-EXPORT-004 — rounds money to 2 decimals at the boundary", async () => {
    const p = seedRichPortfolio()
    const r = await exportPortfolio(p.id)
    if (!r.ok) throw new Error("export failed")
    const entry = r.file.entries.find((e) => e.year === 2025 && e.month === 1)
    expect(entry?.value).toBe(1623.46) // rounded from 1623.4567
  })

  it("UNIT-TRANSFER-EXPORT-005 — assigns stable holdingRef from 0", async () => {
    const p = seedRichPortfolio()
    const r = await exportPortfolio(p.id)
    if (!r.ok) throw new Error("export failed")
    expect(r.file.holdings.map((h) => h.holdingRef)).toEqual([0, 1])
    // The no-ISIN holding survives via index.
    const noIsin = r.file.holdings.find((h) => h.isin === null)
    expect(noIsin).toBeDefined()
    expect(typeof noIsin?.holdingRef).toBe("number")
  })

  it("UNIT-TRANSFER-EXPORT-006 — incomeEvents reference the in-file holdingRef", async () => {
    const p = seedRichPortfolio()
    const r = await exportPortfolio(p.id)
    if (!r.ok) throw new Error("export failed")
    const dividendOnNoIsin = r.file.incomeEvents.find(
      (e) => e.kind === "dividend" && e.paidDate === "2025-03-16"
    )
    expect(dividendOnNoIsin?.holdingRef).toBe(1)
    const interest = r.file.incomeEvents.find((e) => e.kind === "interest")
    expect(interest?.holdingRef).toBe(null)
  })

  it("UNIT-TRANSFER-EXPORT-007 — excludes combined goals and records the count in meta", async () => {
    const p = seedRichPortfolio()
    const r = await exportPortfolio(p.id)
    if (!r.ok) throw new Error("export failed")
    expect(r.file.goals).toHaveLength(1)
    expect(r.file.goals[0].name).toBe("ETF target 2045")
    expect(r.file.meta?.combinedGoalsExcluded).toBe(1)
  })

  it("UNIT-TRANSFER-EXPORT-008 — omits meta when no combined goals exist", async () => {
    // Seed a portfolio with only a portfolio-scoped goal.
    const p = db
      .insert(portfolios)
      .values({
        name: "Minimal",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    db.insert(goals)
      .values({
        name: "P-only",
        color: "#1E40AF",
        kind: "portfolio_value",
        scope: "portfolio",
        portfolioId: p.id,
        target: 1,
        targetYear: 2040,
      })
      .run()

    const r = await exportPortfolio(p.id)
    if (!r.ok) throw new Error("export failed")
    expect(r.file.meta).toBeUndefined()
  })
})
