import { describe, it, expect } from "vitest"
import {
  aggregateIncomeByHoldingMonth,
  aggregateIncomeByMonthSource,
  bucketEventsForSparkline,
  concentrationTop,
  inferCadence,
  trailing12mIncome,
  trailingYoYDelta,
} from "@/lib/calc"
import type { IncomeEventDTO } from "@/lib/types"

function ev(
  id: number,
  paidDate: string,
  amount: number,
  opts: Partial<IncomeEventDTO> = {}
): IncomeEventDTO {
  return {
    id,
    portfolioId: 1,
    holdingId: opts.holdingId ?? 10,
    holdingName: opts.holdingName ?? "Acme",
    holdingType: opts.holdingType ?? "stock",
    holdingIsin: null,
    paidDate,
    kind: opts.kind ?? "dividend",
    amount,
    tax: opts.tax ?? 0,
    note: "",
    sourceBroker: null,
    sourceTransactionId: null,
    ...opts,
  }
}

function interest(
  id: number,
  paidDate: string,
  amount: number
): IncomeEventDTO {
  return ev(id, paidDate, amount, {
    kind: "interest",
    holdingId: null,
    holdingName: null,
    holdingType: null,
  })
}

describe("aggregateIncomeByHoldingMonth", () => {
  it("UNIT-CALC-INC-001 — rolls per-holding inside target month, sorts desc, ties by holdingId", () => {
    const events: IncomeEventDTO[] = [
      ev(1, "2026-03-04", 50, { holdingId: 20, holdingName: "Beta" }),
      ev(2, "2026-03-12", 30, { holdingId: 10, holdingName: "Acme" }),
      ev(3, "2026-03-22", 20, { holdingId: 10, holdingName: "Acme" }),
      ev(4, "2026-02-01", 100, { holdingId: 10, holdingName: "Acme" }),
      ev(5, "2026-03-30", 50, { holdingId: 30, holdingName: "Gamma" }),
    ]
    const rows = aggregateIncomeByHoldingMonth(events, 2026, 3, "gross")
    expect(rows.map((r) => r.holdingId)).toEqual([10, 20, 30])
    expect(rows.every((r) => r.amount === 50)).toBe(true)
    expect(rows[0].count).toBe(2)
    expect(rows[1].count).toBe(1)
  })

  it("UNIT-CALC-INC-002 — rolls all interest events to holdingId:null with name 'Interest'", () => {
    const events: IncomeEventDTO[] = [
      interest(1, "2026-03-15", 4),
      interest(2, "2026-03-28", 6),
      ev(3, "2026-03-10", 15, { holdingId: 10, holdingName: "Acme" }),
    ]
    const rows = aggregateIncomeByHoldingMonth(events, 2026, 3, "gross")
    const interestRow = rows.find((r) => r.holdingId === null)
    expect(interestRow).toBeDefined()
    expect(interestRow!.holdingName).toBe("Interest")
    expect(interestRow!.amount).toBe(10)
    expect(interestRow!.count).toBe(2)
    expect(interestRow!.kind).toBe("interest")
  })

  it("UNIT-CALC-INC-003 — honours basis (net subtracts tax)", () => {
    const events: IncomeEventDTO[] = [
      ev(1, "2026-03-10", 100, { tax: -25 }),
      ev(2, "2026-03-15", 50, { tax: -10 }),
    ]
    const gross = aggregateIncomeByHoldingMonth(events, 2026, 3, "gross")
    const net = aggregateIncomeByHoldingMonth(events, 2026, 3, "net")
    expect(gross[0].amount).toBe(150)
    expect(net[0].amount).toBe(115)
  })
})

describe("inferCadence", () => {
  function gapEvents(gapDays: number, count: number, start = "2024-01-15") {
    const out: IncomeEventDTO[] = []
    const startT = Date.parse(start)
    for (let i = 0; i < count; i++) {
      const d = new Date(startT + i * gapDays * 86_400_000)
      out.push(ev(i + 1, d.toISOString().slice(0, 10), 10))
    }
    return out
  }

  it("UNIT-CALC-INC-004 — 12 events spaced ~30 days = monthly", () => {
    expect(inferCadence(gapEvents(30, 12))).toBe("monthly")
  })

  it("UNIT-CALC-INC-005 — 8 events spaced ~90 days = quarterly", () => {
    expect(inferCadence(gapEvents(90, 8))).toBe("quarterly")
  })

  it("UNIT-CALC-INC-006 — semi-annual/annual/irregular branches", () => {
    expect(inferCadence(gapEvents(180, 6))).toBe("semi-annual")
    expect(inferCadence(gapEvents(365, 4))).toBe("annual")
    expect(inferCadence(gapEvents(700, 3))).toBe("irregular")
  })

  it("UNIT-CALC-INC-007 — <2 events returns irregular", () => {
    expect(inferCadence([])).toBe("irregular")
    expect(inferCadence([ev(1, "2024-01-01", 5)])).toBe("irregular")
  })
})

describe("concentrationTop", () => {
  it("UNIT-CALC-INC-008 — returns top-N leaders, remainder bucketed as Rest summing to ~100%", () => {
    const events: IncomeEventDTO[] = [
      ev(1, "2024-01-15", 400, { holdingId: 10, holdingName: "A" }),
      ev(2, "2024-01-15", 300, { holdingId: 20, holdingName: "B" }),
      ev(3, "2024-01-15", 200, { holdingId: 30, holdingName: "C" }),
      ev(4, "2024-01-15", 50, { holdingId: 40, holdingName: "D" }),
      ev(5, "2024-01-15", 50, { holdingId: 50, holdingName: "E" }),
    ]
    const { topPct, leaders } = concentrationTop(events, 3, "gross")
    expect(leaders).toHaveLength(4)
    expect(leaders[0].name).toBe("A")
    expect(leaders[3].name).toBe("Rest")
    const sum = leaders.reduce((s, l) => s + l.pct, 0)
    expect(sum).toBeCloseTo(100, 5)
    expect(topPct).toBeCloseTo(90, 5)
  })
})

describe("trailingYoYDelta", () => {
  it("UNIT-CALC-INC-009 — returns finite values when prior12 == 0", () => {
    const now = new Date("2026-05-20T00:00:00Z")
    const events: IncomeEventDTO[] = [ev(1, "2026-04-01", 100)]
    const r = trailingYoYDelta(events, undefined, "all", "gross", now)
    expect(Number.isFinite(r.deltaPct)).toBe(true)
    expect(r.prior12).toBe(0)
    expect(r.last12).toBe(100)
    expect(r.deltaPct).toBe(0)
  })

  it("UNIT-CALC-INC-010 — last12 matches trailing12mIncome (regression guard)", () => {
    const now = new Date("2026-05-20T00:00:00Z")
    const events: IncomeEventDTO[] = [
      ev(1, "2026-04-01", 100),
      ev(2, "2025-11-01", 80),
      ev(3, "2024-08-01", 50),
    ]
    const r = trailingYoYDelta(events, undefined, "all", "gross", now)
    expect(r.last12).toBe(
      trailing12mIncome(events, undefined, "all", "gross", now)
    )
  })
})

describe("trailing12mIncome — interest inclusion", () => {
  it("UNIT-CALC-INC-020 — surfaces trailing-12m interest for a portfolio with only interest events", () => {
    // Issue #13 Bug 3: interest events are stored with holdingId === null, so
    // they can't key to a holding row, but a portfolio-level trailing figure
    // must still surface them rather than dropping income to "—".
    const now = new Date("2026-05-20T00:00:00Z")
    const events: IncomeEventDTO[] = [
      interest(1, "2026-03-15", 4), // within 12 mo
      interest(2, "2025-11-01", 6), // within 12 mo
      interest(3, "2024-08-01", 99), // older than 12 mo — excluded
    ]
    const trailing = trailing12mIncome(events, 1, "interest", "gross", now)
    expect(trailing).toBe(10)
  })

  it("UNIT-CALC-INC-021 — interest trailing figure is scoped to the portfolio", () => {
    const now = new Date("2026-05-20T00:00:00Z")
    const events: IncomeEventDTO[] = [
      { ...interest(1, "2026-03-15", 4), portfolioId: 1 },
      { ...interest(2, "2026-03-15", 7), portfolioId: 2 },
    ]
    expect(trailing12mIncome(events, 1, "interest", "gross", now)).toBe(4)
    expect(trailing12mIncome(events, 2, "interest", "gross", now)).toBe(7)
  })
})

describe("bucketEventsForSparkline", () => {
  it("UNIT-CALC-INC-011 — returns requested length, latest bucket = current month", () => {
    const now = new Date("2026-05-15T00:00:00Z")
    const events: IncomeEventDTO[] = [
      ev(1, "2026-05-02", 10),
      ev(2, "2026-04-04", 20),
      ev(3, "2024-06-01", 5),
    ]
    const buckets = bucketEventsForSparkline(events, 24, "gross", now)
    expect(buckets).toHaveLength(24)
    expect(buckets[buckets.length - 1]).toBe(10)
    expect(buckets[buckets.length - 2]).toBe(20)
    expect(buckets[0]).toBe(5)
  })
})

describe("aggregateIncomeByMonthSource", () => {
  it("UNIT-CALC-INC-101 — buckets per month, sorted chronologically, sources desc by amount", () => {
    const events: IncomeEventDTO[] = [
      ev(1, "2026-03-10", 30, { holdingId: 10, holdingName: "Acme" }),
      ev(2, "2026-03-22", 50, { holdingId: 20, holdingName: "Beta" }),
      ev(3, "2026-01-15", 12, { holdingId: 10, holdingName: "Acme" }),
      ev(4, "2026-02-15", 99, { holdingId: 20, holdingName: "Beta" }),
    ]
    const buckets = aggregateIncomeByMonthSource(events, "gross")
    expect(buckets.map((b) => b.key)).toEqual(["2026-01", "2026-02", "2026-03"])
    const march = buckets[2]
    expect(march.total).toBe(80)
    // Sources biggest-first: Beta (50) before Acme (30).
    expect(march.sources.map((s) => s.id)).toEqual([20, 10])
    expect(march.sources[0].name).toBe("Beta")
  })

  it("UNIT-CALC-INC-102 — sums multiple events for the same source within a month", () => {
    const events: IncomeEventDTO[] = [
      ev(1, "2026-03-04", 20, { holdingId: 10, holdingName: "Acme" }),
      ev(2, "2026-03-18", 25, { holdingId: 10, holdingName: "Acme" }),
    ]
    const buckets = aggregateIncomeByMonthSource(events, "gross")
    expect(buckets).toHaveLength(1)
    expect(buckets[0].sources).toHaveLength(1)
    expect(buckets[0].sources[0].amount).toBe(45)
  })

  it("UNIT-CALC-INC-103 — interest collapses to the 'interest' id distinct from holdings", () => {
    const events: IncomeEventDTO[] = [
      ev(1, "2026-03-10", 30, { holdingId: 10, holdingName: "Acme" }),
      interest(2, "2026-03-15", 5),
      interest(3, "2026-03-28", 7),
    ]
    const buckets = aggregateIncomeByMonthSource(events, "gross")
    const interestSrc = buckets[0].sources.find((s) => s.id === "interest")
    expect(interestSrc).toBeDefined()
    expect(interestSrc!.name).toBe("Interest")
    expect(interestSrc!.amount).toBe(12)
  })

  it("UNIT-CALC-INC-104 — net basis adds (negative) tax, lowering source amounts", () => {
    const events: IncomeEventDTO[] = [
      ev(1, "2026-03-10", 100, {
        holdingId: 10,
        holdingName: "Acme",
        tax: -26,
      }),
    ]
    const gross = aggregateIncomeByMonthSource(events, "gross")
    const net = aggregateIncomeByMonthSource(events, "net")
    expect(gross[0].sources[0].amount).toBe(100)
    expect(net[0].sources[0].amount).toBe(74)
  })
})
