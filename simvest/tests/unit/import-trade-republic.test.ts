import { describe, it, expect } from "vitest"
import { tradeRepublicParser } from "@/lib/import/trade-republic"

const HEADER =
  '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"'

const row = (cells: Record<string, string>): string => {
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
  return order.map((k) => `"${cells[k] ?? ""}"`).join(",")
}

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\n")
}

describe("trade-republic parser", () => {
  it("UNIT-IMPORT-001 — CUSTOMER_INBOUND + TRANSFER_INBOUND aggregate per month", () => {
    const text = csv(
      row({
        date: "2024-01-10",
        category: "CASH",
        type: "CUSTOMER_INBOUND",
        amount: "500",
        transaction_id: "a1",
      }),
      row({
        date: "2024-01-20",
        category: "CASH",
        type: "TRANSFER_INBOUND",
        amount: "300",
        transaction_id: "a2",
      }),
      row({
        date: "2024-02-15",
        category: "CASH",
        type: "CUSTOMER_INBOUND",
        amount: "200",
        transaction_id: "a3",
      })
    )
    const r = tradeRepublicParser.parse(text)
    expect(r.monthsAggregated).toHaveLength(2)
    const jan = r.monthsAggregated.find((m) => m.month === 1)
    expect(jan?.deposits).toBe(800)
    expect(jan?.sourceTransactionIds).toEqual(["a1", "a2"])
  })

  it("UNIT-IMPORT-002 — INTEREST_PAYMENT emits an income event with kind='interest', NOT a month aggregate", () => {
    const text = csv(
      row({
        date: "2024-01-31",
        category: "CASH",
        type: "INTEREST_PAYMENT",
        amount: "12.34",
        transaction_id: "i1",
      })
    )
    const r = tradeRepublicParser.parse(text)
    expect(r.monthsAggregated).toHaveLength(0)
    expect(r.income).toHaveLength(1)
    expect(r.income[0].kind).toBe("interest")
    expect(r.income[0].amount).toBe(12.34)
  })

  it("UNIT-IMPORT-003 — DIVIDEND produces kind='dividend' with gross + negative tax", () => {
    const text = csv(
      row({
        date: "2024-05-14",
        category: "CASH",
        type: "DIVIDEND",
        asset_class: "STOCK",
        name: "Apple",
        symbol: "US0378331005",
        amount: "3.77",
        tax: "-0.57",
        transaction_id: "d1",
      })
    )
    const r = tradeRepublicParser.parse(text)
    expect(r.income).toHaveLength(1)
    expect(r.income[0]).toMatchObject({
      kind: "dividend",
      isin: "US0378331005",
      holdingName: "Apple",
      assetClass: "stock",
      amount: 3.77,
      tax: -0.57,
    })
  })

  it("UNIT-IMPORT-005 — TRADING BUY/SELL produce no output", () => {
    const text = csv(
      row({
        date: "2024-01-10",
        category: "TRADING",
        type: "BUY",
        asset_class: "STOCK",
        amount: "-100",
        transaction_id: "t1",
      }),
      row({
        date: "2024-01-10",
        category: "TRADING",
        type: "SELL",
        asset_class: "STOCK",
        amount: "100",
        transaction_id: "t2",
      })
    )
    const r = tradeRepublicParser.parse(text)
    expect(r.monthsAggregated).toHaveLength(0)
    expect(r.income).toHaveLength(0)
  })

  it("UNIT-IMPORT-006 — CORPORATE_ACTION SPLIT/CAPITAL_INCR_CASH produce no output", () => {
    const text = csv(
      row({
        date: "2024-01-10",
        category: "CORPORATE_ACTION",
        type: "SPLIT",
        transaction_id: "c1",
      })
    )
    const r = tradeRepublicParser.parse(text)
    expect(r.monthsAggregated).toHaveLength(0)
    expect(r.income).toHaveLength(0)
  })

  it("UNIT-IMPORT-009 — Same ISIN across multiple dividend rows produces ONE holding candidate", () => {
    const text = csv(
      row({
        date: "2024-01-15",
        category: "CASH",
        type: "DIVIDEND",
        asset_class: "STOCK",
        name: "Apple",
        symbol: "US0378331005",
        amount: "3",
        tax: "0",
        transaction_id: "d1",
      }),
      row({
        date: "2024-04-15",
        category: "CASH",
        type: "DIVIDEND",
        asset_class: "STOCK",
        name: "Apple",
        symbol: "US0378331005",
        amount: "3",
        tax: "0",
        transaction_id: "d2",
      })
    )
    const r = tradeRepublicParser.parse(text)
    expect(r.holdingsCandidates).toHaveLength(1)
    expect(r.holdingsCandidates[0].isin).toBe("US0378331005")
  })

  it("UNIT-IMPORT-011 — Empty CSV returns empty arrays, no errors", () => {
    const r = tradeRepublicParser.parse("")
    expect(r.income).toHaveLength(0)
    expect(r.monthsAggregated).toHaveLength(0)
    expect(r.errors).toHaveLength(0)
  })

  it("UNIT-IMPORT-012 — CSV missing required columns returns errors", () => {
    const text = '"foo","bar"\n"1","2"'
    const r = tradeRepublicParser.parse(text)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it("UNIT-IMPORT-013 — UTF-8 names round-trip", () => {
    const text = csv(
      row({
        date: "2024-01-15",
        category: "CASH",
        type: "DIVIDEND",
        asset_class: "STOCK",
        name: "LVMH Moët Hennessy",
        symbol: "FR0000121014",
        amount: "5",
        tax: "0",
        transaction_id: "d1",
      })
    )
    const r = tradeRepublicParser.parse(text)
    expect(r.income[0].holdingName).toBe("LVMH Moët Hennessy")
  })
})
