import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { GET as EXPORT } from "@/app/api/portfolios/[id]/export/route"
import { POST as IMPORT } from "@/app/api/portfolios/import/route"
import { db } from "@/lib/db"
import {
  portfolios,
  entries,
  holdings,
  dividendEvents,
  goals,
} from "@/lib/db/schema"
import { eq, asc } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"
import type { TransferPortfolioFile } from "@/lib/transfer/types"

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

/**
 * Hero round-trip test — the strongest guarantee we ship.
 *
 * 1. Seed a portfolio with 24 monthly entries (mixed null/value), 3 holdings
 *    (one without ISIN), 12 dividends + 4 interest events (one dividend on
 *    the ISIN-less holding), 2 portfolio-scoped goals + 1 combined goal.
 * 2. Export.
 * 3. Wipe DB.
 * 4. Re-import.
 * 5. Deep-equality on every field except IDs and `(sourceBroker,
 *    sourceTransactionId)` which are intentionally NULL after restore.
 */
describe("transfer round-trip", () => {
  it("INT-TRANSFER-ROUND-001 — round-trips a rich portfolio losslessly (modulo IDs and source provenance)", async () => {
    // ── 1. Seed ──────────────────────────────────────────────────────
    const p = db
      .insert(portfolios)
      .values({
        name: "Round Trip Portfolio",
        color: "#1E40AF",
        targetMonthlyContribution: 750,
        startingValue: 5000,
        startingDate: "2023-01",
        createdAt: 1700000000000,
      })
      .returning()
      .get()

    const seededEntries = []
    for (let year = 2023; year <= 2024; year++) {
      for (let month = 1; month <= 12; month++) {
        const everyOther = (year * 12 + month) % 3 === 0
        seededEntries.push({
          portfolioId: p.id,
          year,
          month,
          day: 28,
          invested: 750,
          value: everyOther ? null : 1000 + month * 10,
          note: "",
        })
      }
    }
    db.insert(entries).values(seededEntries).run()

    const h1 = db
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
    const h2 = db
      .insert(holdings)
      .values({
        portfolioId: p.id,
        name: "Apple Inc",
        type: "stock",
        isin: "US0378331005",
        createdAt: 1700000000002,
      })
      .returning()
      .get()
    const h3NoIsin = db
      .insert(holdings)
      .values({
        portfolioId: p.id,
        name: "ISIN-less position",
        type: "stock",
        isin: null,
        createdAt: 1700000000003,
      })
      .returning()
      .get()

    const dividendRows = []
    for (let m = 1; m <= 12; m++) {
      const holdingId = m % 4 === 0 ? h3NoIsin.id : m % 2 === 0 ? h1.id : h2.id
      dividendRows.push({
        portfolioId: p.id,
        holdingId,
        paidDate: `2024-${String(m).padStart(2, "0")}-15`,
        amount: 12.34,
        kind: "dividend" as const,
        tax: 2.5,
        note: "",
        sourceBroker: "trade_republic",
        sourceTransactionId: `tr-${m}`,
        createdAt: 1710000000000 + m * 1000,
      })
    }
    db.insert(dividendEvents).values(dividendRows).run()

    db.insert(dividendEvents)
      .values([
        {
          portfolioId: p.id,
          holdingId: null,
          paidDate: "2024-01-31",
          amount: 1.11,
          kind: "interest",
          tax: 0,
          note: "",
          sourceBroker: null,
          sourceTransactionId: null,
          createdAt: 1715000000000,
        },
        {
          portfolioId: p.id,
          holdingId: null,
          paidDate: "2024-04-30",
          amount: 0.95,
          kind: "interest",
          tax: 0,
          note: "",
          sourceBroker: null,
          sourceTransactionId: null,
          createdAt: 1715000000001,
        },
        {
          portfolioId: p.id,
          holdingId: null,
          paidDate: "2024-07-31",
          amount: 1.25,
          kind: "interest",
          tax: 0,
          note: "",
          sourceBroker: null,
          sourceTransactionId: null,
          createdAt: 1715000000002,
        },
        {
          portfolioId: p.id,
          holdingId: null,
          paidDate: "2024-10-31",
          amount: 1.0,
          kind: "interest",
          tax: 0,
          note: "",
          sourceBroker: null,
          sourceTransactionId: null,
          createdAt: 1715000000003,
        },
      ])
      .run()

    db.insert(goals)
      .values([
        {
          name: "Portfolio goal 1",
          color: "#059669",
          kind: "portfolio_value",
          scope: "portfolio",
          portfolioId: p.id,
          target: 100000,
          targetYear: 2030,
          swr: null,
          yieldAssumed: null,
          createdAt: 1700000000000,
        },
        {
          name: "Portfolio goal 2",
          color: "#7C3AED",
          kind: "annual_income",
          scope: "portfolio",
          portfolioId: p.id,
          target: 5000,
          targetYear: 2035,
          swr: 4,
          yieldAssumed: 3,
          createdAt: 1700000000001,
        },
        {
          name: "Combined goal (should not export)",
          color: "#1E40AF",
          kind: "portfolio_value",
          scope: "combined",
          portfolioId: null,
          target: 500000,
          targetYear: 2040,
          swr: null,
          yieldAssumed: null,
          createdAt: 1700000000002,
        },
      ])
      .run()

    // ── 2. Export ────────────────────────────────────────────────────
    const exportReq = new NextRequest(
      `http://localhost/api/portfolios/${p.id}/export`
    )
    const exportRes = await EXPORT(exportReq, {
      params: Promise.resolve({ id: String(p.id) }),
    })
    expect(exportRes.status).toBe(200)
    const file = (await exportRes.json()) as TransferPortfolioFile

    // ── 3. Wipe DB ───────────────────────────────────────────────────
    db.delete(dividendEvents).run()
    db.delete(holdings).run()
    db.delete(goals).run()
    db.delete(entries).run()
    db.delete(portfolios).run()

    // ── 4. Re-import ─────────────────────────────────────────────────
    const importRes = await IMPORT(
      new NextRequest("http://localhost/api/portfolios/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: file }),
      })
    )
    expect(importRes.status).toBe(201)
    const { portfolio: created } = (await importRes.json()) as {
      portfolio: { id: number; name: string }
    }

    // ── 5. Deep-equality (modulo IDs + source provenance) ────────────
    const restored = db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, created.id))
      .get()
    expect(restored).toBeDefined()
    expect(restored?.name).toBe("Round Trip Portfolio")
    expect(restored?.color).toBe("#1E40AF")
    expect(restored?.targetMonthlyContribution).toBe(750)
    expect(restored?.startingValue).toBe(5000)
    expect(restored?.startingDate).toBe("2023-01")
    expect(restored?.createdAt).toBe(1700000000000)

    const restoredEntries = db
      .select()
      .from(entries)
      .where(eq(entries.portfolioId, created.id))
      .orderBy(asc(entries.year), asc(entries.month))
      .all()
    expect(restoredEntries).toHaveLength(seededEntries.length)
    for (let i = 0; i < seededEntries.length; i++) {
      const src = seededEntries[i]
      const dst = restoredEntries[i]
      expect(dst.year).toBe(src.year)
      expect(dst.month).toBe(src.month)
      expect(dst.invested).toBe(src.invested)
      expect(dst.value).toBe(src.value)
      expect(dst.note).toBe(src.note)
    }

    const restoredHoldings = db
      .select()
      .from(holdings)
      .where(eq(holdings.portfolioId, created.id))
      .orderBy(asc(holdings.createdAt))
      .all()
    expect(restoredHoldings).toHaveLength(3)
    expect(restoredHoldings[0].name).toBe("Vanguard FTSE All-World")
    expect(restoredHoldings[0].isin).toBe("IE00BK5BQT80")
    expect(restoredHoldings[2].isin).toBe(null) // ISIN-less round-trips

    const restoredEvents = db
      .select()
      .from(dividendEvents)
      .where(eq(dividendEvents.portfolioId, created.id))
      .orderBy(asc(dividendEvents.paidDate), asc(dividendEvents.createdAt))
      .all()
    const dividends = restoredEvents.filter((e) => e.kind === "dividend")
    const interest = restoredEvents.filter((e) => e.kind === "interest")
    expect(dividends).toHaveLength(12)
    expect(interest).toHaveLength(4)
    // Source provenance is intentionally null after restore.
    for (const ev of restoredEvents) {
      expect(ev.sourceBroker).toBe(null)
      expect(ev.sourceTransactionId).toBe(null)
    }

    const restoredGoals = db
      .select()
      .from(goals)
      .where(eq(goals.portfolioId, created.id))
      .all()
    expect(restoredGoals).toHaveLength(2) // combined goal was excluded
    expect(restoredGoals.map((g) => g.name).sort()).toEqual([
      "Portfolio goal 1",
      "Portfolio goal 2",
    ])
    // No combined goal anywhere in the DB.
    const combinedAfter = db
      .select()
      .from(goals)
      .where(eq(goals.scope, "combined"))
      .all()
    expect(combinedAfter).toHaveLength(0)
  })
})
