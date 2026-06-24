import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { dividendEvents, entries, holdings, portfolios } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import { createImportEngine } from "@/lib/import/engine"

const HEADER =
  '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"'

const cells = (c: Record<string, string>): string => {
  const order = [
    "datetime",
    "date",
    "account_type",
    "category",
    "type",
    "asset_class",
    "name",
    "symbol",
    "shares",
    "price",
    "amount",
    "fee",
    "tax",
    "currency",
    "original_amount",
    "original_currency",
    "fx_rate",
    "description",
    "transaction_id",
    "counterparty_name",
    "counterparty_iban",
    "payment_reference",
    "mcc_code",
  ]
  return order.map((k) => `"${c[k] ?? ""}"`).join(",")
}

function makeCsv(rows: Record<string, string>[]) {
  return [HEADER, ...rows.map(cells)].join("\n")
}

const SAMPLE_ROWS: Record<string, string>[] = [
  {
    date: "2024-01-10",
    category: "CASH",
    type: "CUSTOMER_INBOUND",
    amount: "500",
    transaction_id: "tx-deposit-1",
  },
  {
    date: "2024-02-10",
    category: "CASH",
    type: "CUSTOMER_INBOUND",
    amount: "200",
    transaction_id: "tx-deposit-2",
  },
  {
    date: "2024-03-15",
    category: "CASH",
    type: "DIVIDEND",
    asset_class: "STOCK",
    name: "Apple",
    symbol: "US0378331005",
    amount: "3.77",
    tax: "-0.57",
    transaction_id: "tx-div-1",
  },
  {
    date: "2024-04-30",
    category: "CASH",
    type: "INTEREST_PAYMENT",
    amount: "1.25",
    transaction_id: "tx-int-1",
  },
  {
    date: "2024-05-01",
    category: "TRADING",
    type: "BUY",
    amount: "-100",
    transaction_id: "tx-buy-1",
  },
]

let pid: number
const engine = createImportEngine(db)

beforeAll(async () => {
  await ensureSeeded()
  const p = db
    .insert(portfolios)
    .values({
      name: "Engine Test",
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
  db.delete(holdings).where(eq(holdings.portfolioId, pid)).run()
})

describe("importEngine.previewImport", () => {
  it("INT-IMPORT-001 — returns months, income, holdings from valid CSV", () => {
    const res = engine.previewImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: makeCsv(SAMPLE_ROWS),
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.preview.months).toHaveLength(2)
    expect(res.preview.incomeEvents).toHaveLength(2)
    expect(res.preview.holdings).toHaveLength(1)
  })

  it("INT-IMPORT-002 — flags currentInvested from existing entries", () => {
    db.insert(entries)
      .values({
        portfolioId: pid,
        year: 2024,
        month: 1,
        day: 28,
        invested: 999,
        value: 999,
        note: "",
      })
      .run()
    const res = engine.previewImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: makeCsv(SAMPLE_ROWS),
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const jan = res.preview.months.find((m) => m.year === 2024 && m.month === 1)
    expect(jan?.currentInvested).toBe(999)
  })

  it("INT-IMPORT-004 — flags exists=true for holdings already present by ISIN", () => {
    db.insert(holdings)
      .values({
        portfolioId: pid,
        name: "Apple Existing",
        type: "stock",
        isin: "US0378331005",
      })
      .run()
    const res = engine.previewImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: makeCsv(SAMPLE_ROWS),
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.preview.holdings[0]).toMatchObject({
      isin: "US0378331005",
      exists: true,
    })
  })

  it("INT-IMPORT-005 — rejects unknown broker", () => {
    const res = engine.previewImport({
      broker: "etrade",
      portfolioId: pid,
      csv: makeCsv(SAMPLE_ROWS),
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.status).toBe(400)
  })

  it("INT-IMPORT-006 — rejects malformed CSV", () => {
    const res = engine.previewImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: '"foo","bar"\n"1","2"',
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.status).toBe(400)
  })

  it("INT-IMPORT-013 — rejects missing csv body", () => {
    const res = engine.previewImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: "",
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.status).toBe(400)
  })
})

describe("importEngine.applyImport", () => {
  it("INT-IMPORT-007 — upserts entries only for months with action=replace", () => {
    const csv = makeCsv(SAMPLE_ROWS)
    const res = engine.applyImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv,
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
    expect(rows[0].invested).toBe(500)
    expect(rows[0].day).toBe(31)
    expect(rows[0].value).toBeNull()
  })

  it("INT-IMPORT-007b — imported rows use the correct last-day-of-month for non-31-day months", () => {
    const rows: Record<string, string>[] = [
      {
        date: "2023-02-15",
        category: "CASH",
        type: "CUSTOMER_INBOUND",
        amount: "100",
        transaction_id: "feb23",
      },
      {
        date: "2024-02-15",
        category: "CASH",
        type: "CUSTOMER_INBOUND",
        amount: "100",
        transaction_id: "feb24",
      },
      {
        date: "2024-04-15",
        category: "CASH",
        type: "CUSTOMER_INBOUND",
        amount: "100",
        transaction_id: "apr24",
      },
    ]
    const res = engine.applyImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: makeCsv(rows),
      decisions: {
        months: [
          { year: 2023, month: 2, action: "replace" },
          { year: 2024, month: 2, action: "replace" },
          { year: 2024, month: 4, action: "replace" },
        ],
        importDividends: true,
        importInterest: true,
        importHoldings: true,
      },
    })
    expect(res.ok).toBe(true)
    const inserted = db
      .select()
      .from(entries)
      .where(eq(entries.portfolioId, pid))
      .all()
    const byKey = Object.fromEntries(
      inserted.map((r) => [`${r.year}-${r.month}`, r.day])
    )
    expect(byKey["2023-2"]).toBe(28)
    expect(byKey["2024-2"]).toBe(29)
    expect(byKey["2024-4"]).toBe(30)
  })

  it("INT-IMPORT-009 — honors importDividends=false", () => {
    engine.applyImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: makeCsv(SAMPLE_ROWS),
      decisions: {
        months: [],
        importDividends: false,
        importInterest: true,
        importHoldings: true,
      },
    })
    const divs = db
      .select()
      .from(dividendEvents)
      .where(eq(dividendEvents.kind, "dividend"))
      .all()
    expect(divs).toHaveLength(0)
  })

  it("INT-IMPORT-010 — honors importInterest=false", () => {
    engine.applyImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: makeCsv(SAMPLE_ROWS),
      decisions: {
        months: [],
        importDividends: false,
        importInterest: false,
        importHoldings: false,
      },
    })
    const interest = db
      .select()
      .from(dividendEvents)
      .where(eq(dividendEvents.kind, "interest"))
      .all()
    expect(interest).toHaveLength(0)
  })

  it("INT-IMPORT-012 — idempotent: running twice inserts each row once", () => {
    const csv = makeCsv(SAMPLE_ROWS)
    const decisions = {
      months: [
        { year: 2024, month: 1, action: "replace" as const },
        { year: 2024, month: 2, action: "replace" as const },
      ],
      importDividends: true,
      importInterest: true,
      importHoldings: true,
    }
    engine.applyImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv,
      decisions,
    })
    const res2 = engine.applyImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv,
      decisions,
    })
    expect(res2.ok).toBe(true)
    if (!res2.ok) return
    expect(res2.applied.duplicatesSkipped).toBeGreaterThan(0)
    const allEvents = db
      .select()
      .from(dividendEvents)
      .where(eq(dividendEvents.portfolioId, pid))
      .all()
    expect(allEvents).toHaveLength(2)
  })

  it("INT-IMPORT-014 — rejects unknown portfolioId", () => {
    const res = engine.applyImport({
      broker: "trade_republic",
      portfolioId: 999999,
      csv: makeCsv(SAMPLE_ROWS),
      decisions: {
        months: [],
        importDividends: true,
        importInterest: true,
        importHoldings: true,
      },
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.status).toBe(404)
  })

  it("INT-IMPORT-015 — rejects missing decisions.months", () => {
    const res = engine.applyImport({
      broker: "trade_republic",
      portfolioId: pid,
      csv: makeCsv(SAMPLE_ROWS),
      decisions: {},
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.status).toBe(400)
  })
})
