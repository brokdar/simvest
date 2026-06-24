import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { POST as PREVIEW } from "@/app/api/import/preview/route"
import { POST as COMMIT } from "@/app/api/import/commit/route"
import { db } from "@/lib/db"
import { dividendEvents, entries, holdings, portfolios } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"

const MINIMAL_CSV = [
  '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"',
  '"","2024-01-10","","CASH","CUSTOMER_INBOUND","","","","","","500","","","","","","","","tx-route-1","","","",""',
].join("\n")

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

let pid: number

beforeAll(async () => {
  await ensureSeeded()
  const p = db
    .insert(portfolios)
    .values({
      name: "Route Plumbing",
      color: "#000",
      targetMonthlyContribution: 0,
    })
    .returning()
    .get()
  pid = p.id
})

beforeEach(() => {
  db.delete(dividendEvents).where(eq(dividendEvents.portfolioId, pid)).run()
  db.delete(entries).where(eq(entries.portfolioId, pid)).run()
  db.delete(holdings).where(eq(holdings.portfolioId, pid)).run()
})

describe("import route plumbing", () => {
  it("INT-IMPORT-ROUTE-001 — preview route maps engine result to 200 JSON", async () => {
    const res = await PREVIEW(
      jsonReq("http://localhost/api/import/preview", {
        broker: "trade_republic",
        portfolioId: pid,
        csv: MINIMAL_CSV,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.parsed.months).toHaveLength(1)
  })

  it("INT-IMPORT-ROUTE-002 — preview route maps engine error to 400 JSON", async () => {
    const res = await PREVIEW(
      jsonReq("http://localhost/api/import/preview", {
        broker: "etrade",
        portfolioId: pid,
        csv: MINIMAL_CSV,
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown broker/)
  })

  it("INT-IMPORT-ROUTE-003 — commit route returns 201 with applied counts", async () => {
    const res = await COMMIT(
      jsonReq("http://localhost/api/import/commit", {
        broker: "trade_republic",
        portfolioId: pid,
        csv: MINIMAL_CSV,
        decisions: {
          months: [{ year: 2024, month: 1, action: "replace" }],
          importDividends: true,
          importInterest: true,
          importHoldings: true,
        },
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.applied.entriesUpserted).toBe(1)
  })

  it("INT-IMPORT-ROUTE-004 — commit route maps missing decisions to 400", async () => {
    const res = await COMMIT(
      jsonReq("http://localhost/api/import/commit", {
        broker: "trade_republic",
        portfolioId: pid,
        csv: MINIMAL_CSV,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-IMPORT-ROUTE-005 — preview route returns 400 on invalid JSON body", async () => {
    const bad = new NextRequest("http://localhost/api/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    })
    const res = await PREVIEW(bad)
    expect(res.status).toBe(400)
  })
})
