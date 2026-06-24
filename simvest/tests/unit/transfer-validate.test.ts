import { describe, it, expect } from "vitest"
import { validateTransferFile } from "@/lib/validation/transfer-portfolio"
import type { TransferPortfolioFile } from "@/lib/transfer/types"

function makeValid(
  patch: Partial<TransferPortfolioFile> = {}
): TransferPortfolioFile {
  return {
    version: 1,
    kind: "simvest.portfolio",
    exportedAt: "2026-05-22T10:30:00Z",
    sourceAppVersion: "0.0.1",
    portfolio: {
      name: "Hauptdepot",
      color: "#1E40AF",
      targetMonthlyContribution: 500,
      startingValue: 0,
      startingDate: null,
      createdAt: 1700000000000,
    },
    entries: [
      {
        year: 2025,
        month: 1,
        day: 31,
        invested: 1500,
        value: 1623.45,
        note: "",
      },
      { year: 2025, month: 2, day: 28, invested: 1500, value: null, note: "" },
    ],
    holdings: [
      {
        holdingRef: 0,
        name: "Vanguard FTSE All-World",
        type: "etf",
        isin: "IE00BK5BQT80",
        createdAt: 1700000000000,
      },
      {
        holdingRef: 1,
        name: "ISIN-less position",
        type: "stock",
        isin: null,
        createdAt: 1700000000000,
      },
    ],
    incomeEvents: [
      {
        holdingRef: 0,
        paidDate: "2025-03-15",
        amount: 23.45,
        kind: "dividend",
        tax: -6.18,
        note: "",
        createdAt: 1710000000000,
      },
      {
        holdingRef: null,
        paidDate: "2025-04-01",
        amount: 1.12,
        kind: "interest",
        tax: 0,
        note: "",
        createdAt: 1712000000000,
      },
    ],
    goals: [
      {
        name: "ETF target 2045",
        color: "#059669",
        kind: "portfolio_value",
        targetYear: 2045,
        target: 250000,
        swr: null,
        yieldAssumed: null,
        createdAt: 1700000000000,
      },
    ],
    ...patch,
  }
}

describe("validateTransferFile", () => {
  it("UNIT-TRANSFER-VAL-001 — accepts a known-good fixture", () => {
    const r = validateTransferFile(makeValid())
    expect(r.ok).toBe(true)
  })

  it("UNIT-TRANSFER-VAL-002 — rejects non-object payloads", () => {
    expect(validateTransferFile(null).ok).toBe(false)
    expect(validateTransferFile("string").ok).toBe(false)
    expect(validateTransferFile([]).ok).toBe(false)
    expect(validateTransferFile(42).ok).toBe(false)
  })

  it("UNIT-TRANSFER-VAL-003 — rejects payloads with the wrong kind discriminator", () => {
    const bad = { ...makeValid(), kind: "not.a.simvest.thing" } as unknown
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Not a Simvest portfolio export.")
  })

  it("UNIT-TRANSFER-VAL-004 — rejects versions newer than this build", () => {
    const r = validateTransferFile({ ...makeValid(), version: 2 } as unknown)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/newer Simvest version/)
  })

  it("UNIT-TRANSFER-VAL-005 — rejects empty portfolio.name", () => {
    const bad = makeValid()
    bad.portfolio.name = "   "
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
  })

  it("UNIT-TRANSFER-VAL-006 — rejects entries with NaN / Infinity", () => {
    const bad = makeValid()
    bad.entries[0].invested = Number.POSITIVE_INFINITY
    // Through JSON.stringify Infinity becomes null — emulate that path.
    const wire = JSON.parse(JSON.stringify(bad))
    const r = validateTransferFile(wire)
    expect(r.ok).toBe(false)
  })

  it("UNIT-TRANSFER-VAL-007 — rejects duplicate (year, month) in entries", () => {
    const bad = makeValid()
    bad.entries.push({ ...bad.entries[0] })
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Duplicate/)
  })

  it("UNIT-TRANSFER-VAL-008 — rejects out-of-range entry month", () => {
    const bad = makeValid()
    bad.entries[0].month = 13
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
  })

  it("UNIT-TRANSFER-VAL-009 — rejects holdings with mismatched holdingRef", () => {
    const bad = makeValid()
    bad.holdings[1].holdingRef = 5
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
  })

  it("UNIT-TRANSFER-VAL-010 — rejects invalid ISIN", () => {
    const bad = makeValid()
    bad.holdings[0].isin = "NOT-AN-ISIN"
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
  })

  it("UNIT-TRANSFER-VAL-011 — accepts null ISIN on a holding", () => {
    // Already covered by the fixture's second holding — assert explicitly.
    const r = validateTransferFile(makeValid())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.holdings[1].isin).toBe(null)
  })

  it("UNIT-TRANSFER-VAL-012 — rejects dividend with null holdingRef", () => {
    const bad = makeValid()
    bad.incomeEvents[0].holdingRef = null
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/dividends must reference a holding/)
  })

  it("UNIT-TRANSFER-VAL-013 — rejects income event with out-of-range holdingRef", () => {
    const bad = makeValid()
    bad.incomeEvents[0].holdingRef = 99
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
  })

  it("UNIT-TRANSFER-VAL-014 — accepts interest with null holdingRef", () => {
    const r = validateTransferFile(makeValid())
    expect(r.ok).toBe(true)
    if (r.ok) {
      const interest = r.data.incomeEvents.find((e) => e.kind === "interest")
      expect(interest?.holdingRef).toBe(null)
    }
  })

  it("UNIT-TRANSFER-VAL-015 — rejects goal with invalid kind", () => {
    const bad = makeValid()
    ;(bad.goals[0] as { kind: string }).kind = "frobnicate"
    const r = validateTransferFile(bad)
    expect(r.ok).toBe(false)
  })

  it("UNIT-TRANSFER-VAL-016 — preserves null entries.value end-to-end", () => {
    const r = validateTransferFile(makeValid())
    expect(r.ok).toBe(true)
    if (r.ok) {
      const nullValue = r.data.entries.find((e) => e.value === null)
      expect(nullValue).toBeDefined()
    }
  })

  it("UNIT-TRANSFER-VAL-017 — accepts an optional meta.combinedGoalsExcluded", () => {
    const r = validateTransferFile({
      ...makeValid(),
      meta: { combinedGoalsExcluded: 3 },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.meta?.combinedGoalsExcluded).toBe(3)
  })

  it("UNIT-TRANSFER-VAL-018 — rejects negative or non-integer meta.combinedGoalsExcluded", () => {
    const bad1 = validateTransferFile({
      ...makeValid(),
      meta: { combinedGoalsExcluded: -1 },
    })
    expect(bad1.ok).toBe(false)
    const bad2 = validateTransferFile({
      ...makeValid(),
      meta: { combinedGoalsExcluded: 1.5 },
    })
    expect(bad2.ok).toBe(false)
  })
})
