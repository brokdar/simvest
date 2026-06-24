import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { dividendEvents, entries, portfolios } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import { createImportEngine } from "@/lib/import/engine"
import type { ImportDecisions } from "@/lib/import/types"

function csv(...lines: string[]) {
  return ["Date;Payment type;In;Out;Balance", ...lines].join("\n")
}

const JAN = [
  "1/1/2024;Go & Grow returns;1,00;;1001,00",
  "1/15/2024;SEPA payment;100,00;;1101,00",
  "1/31/2024;Go & Grow returns;1,00;;1102,00",
]
const FEB = [
  "2/10/2024;SEPA payment;50,00;;1152,00",
  "2/29/2024;Go & Grow returns;2,00;;1154,00",
]

const replaceAll = (
  months: { year: number; month: number }[]
): ImportDecisions => ({
  months: months.map((m) => ({ ...m, action: "replace" })),
  importDividends: true,
  importInterest: true,
  importHoldings: true,
})

let pid: number
const engine = createImportEngine(db)

beforeAll(async () => {
  await ensureSeeded()
  const p = db
    .insert(portfolios)
    .values({
      name: "Bondora Test",
      color: "#000",
      targetMonthlyContribution: 0,
    })
    .returning()
    .get()
  pid = p.id
})

beforeEach(async () => {
  db.delete(dividendEvents).where(eq(dividendEvents.portfolioId, pid)).run()
  db.delete(entries).where(eq(entries.portfolioId, pid)).run()
})

describe("importEngine — bondora", () => {
  it("INT-BONDORA-001 — preview carries month-end value and the opening-balance warning", () => {
    const res = engine.previewImport({
      broker: "bondora",
      portfolioId: pid,
      csv: csv(...JAN, ...FEB),
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const jan = res.preview.months.find((m) => m.month === 1)
    expect(jan).toMatchObject({
      newInvested: 100,
      newValue: 1102,
      currentValue: null,
    })
    expect(res.preview.incomeEvents).toHaveLength(3)
    expect(res.preview.incomeEvents.every((e) => e.kind === "interest")).toBe(
      true
    )
    expect(res.preview.warnings.some((w) => /opens at/.test(w))).toBe(true)
  })

  it("INT-BONDORA-002 — apply writes entries WITH value and interest events tagged to the broker", () => {
    const res = engine.applyImport({
      broker: "bondora",
      portfolioId: pid,
      csv: csv(...JAN, ...FEB),
      decisions: replaceAll([
        { year: 2024, month: 1 },
        { year: 2024, month: 2 },
      ]),
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.applied.interestInserted).toBe(3)

    const rows = db
      .select()
      .from(entries)
      .where(eq(entries.portfolioId, pid))
      .all()
    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]))
    expect(byMonth[1].invested).toBe(100)
    expect(byMonth[1].value).toBe(1102) // ← the new value-writing behavior
    expect(byMonth[1].day).toBe(31)
    expect(byMonth[2].value).toBe(1154)

    const interest = db
      .select()
      .from(dividendEvents)
      .where(eq(dividendEvents.portfolioId, pid))
      .all()
    expect(interest).toHaveLength(3)
    expect(interest.every((e) => e.kind === "interest")).toBe(true)
    expect(interest.every((e) => e.holdingId === null)).toBe(true)
    expect(interest.every((e) => e.sourceBroker === "bondora")).toBe(true)
    expect(interest.every((e) => e.tax === 0)).toBe(true)
  })

  it("INT-BONDORA-003 — re-importing the same statement is idempotent", () => {
    const full = csv(...JAN, ...FEB)
    const decisions = replaceAll([
      { year: 2024, month: 1 },
      { year: 2024, month: 2 },
    ])
    engine.applyImport({
      broker: "bondora",
      portfolioId: pid,
      csv: full,
      decisions,
    })
    const res2 = engine.applyImport({
      broker: "bondora",
      portfolioId: pid,
      csv: full,
      decisions,
    })
    expect(res2.ok).toBe(true)
    if (!res2.ok) return
    expect(res2.applied.interestInserted).toBe(0)
    expect(res2.applied.duplicatesSkipped).toBe(3)

    expect(
      db
        .select()
        .from(dividendEvents)
        .where(eq(dividendEvents.portfolioId, pid))
        .all()
    ).toHaveLength(3)
    expect(
      db.select().from(entries).where(eq(entries.portfolioId, pid)).all()
    ).toHaveLength(2)
  })

  it("INT-BONDORA-004 — extending the window later inserts only the new days", () => {
    // First import: January only.
    engine.applyImport({
      broker: "bondora",
      portfolioId: pid,
      csv: csv(...JAN),
      decisions: replaceAll([{ year: 2024, month: 1 }]),
    })
    // Later export covers Jan + Feb.
    const res2 = engine.applyImport({
      broker: "bondora",
      portfolioId: pid,
      csv: csv(...JAN, ...FEB),
      decisions: replaceAll([
        { year: 2024, month: 1 },
        { year: 2024, month: 2 },
      ]),
    })
    expect(res2.ok).toBe(true)
    if (!res2.ok) return
    expect(res2.applied.interestInserted).toBe(1) // only the Feb return
    expect(res2.applied.duplicatesSkipped).toBe(2) // the two Jan returns

    const interest = db
      .select()
      .from(dividendEvents)
      .where(eq(dividendEvents.portfolioId, pid))
      .all()
    expect(interest).toHaveLength(3)
  })

  it("INT-BONDORA-005 — a skipped month writes neither its entry nor changes its value", () => {
    const res = engine.applyImport({
      broker: "bondora",
      portfolioId: pid,
      csv: csv(...JAN, ...FEB),
      decisions: {
        months: [
          { year: 2024, month: 1, action: "replace" },
          { year: 2024, month: 2, action: "skip" },
        ],
        importDividends: true,
        importInterest: true,
        importHoldings: true,
      },
    })
    expect(res.ok).toBe(true)
    const rows = db
      .select()
      .from(entries)
      .where(eq(entries.portfolioId, pid))
      .all()
    expect(rows).toHaveLength(1)
    expect(rows[0].month).toBe(1)
  })
})
