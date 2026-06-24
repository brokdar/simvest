import { describe, it, expect, beforeAll } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "@/app/api/holdings/route"
import { PATCH, DELETE } from "@/app/api/holdings/[id]/route"
import { db } from "@/lib/db"
import { holdings, portfolios } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"

function jsonReq(body: unknown, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/holdings", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) }
}

let pid: number
let pidB: number

beforeAll(async () => {
  await ensureSeeded()
  const p = db
    .insert(portfolios)
    .values({
      name: "Holdings Test Portfolio",
      color: "#1E40AF",
      targetMonthlyContribution: 0,
    })
    .returning()
    .get()
  pid = p.id
  const p2 = db
    .insert(portfolios)
    .values({
      name: "Holdings Test Portfolio B",
      color: "#1E40AF",
      targetMonthlyContribution: 0,
    })
    .returning()
    .get()
  pidB = p2.id
})

describe("GET /api/holdings", () => {
  it("INT-HOLDINGS-001 — GET returns empty array on fresh DB", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(0)
  })
})

describe("POST /api/holdings", () => {
  it("INT-HOLDINGS-002 — POST creates a holding by name", async () => {
    const res = await POST(
      jsonReq({
        portfolioId: pid,
        name: "Tesla, Inc.",
        type: "stock",
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeGreaterThan(0)
    expect(body.portfolioId).toBe(pid)
    expect(body.name).toBe("Tesla, Inc.")
    expect(body.type).toBe("stock")
    expect(body.isin).toBeNull()
  })

  it("INT-HOLDINGS-003 — POST trims whitespace from name", async () => {
    const res = await POST(jsonReq({ portfolioId: pid, name: "  Vanguard  " }))
    const body = await res.json()
    expect(body.name).toBe("Vanguard")
  })

  it("INT-HOLDINGS-004 — POST defaults type to etf when omitted", async () => {
    const res = await POST(jsonReq({ portfolioId: pid, name: "Default Type" }))
    const body = await res.json()
    expect(body.type).toBe("etf")
  })

  it("INT-HOLDINGS-005 — POST rejects missing portfolioId", async () => {
    const res = await POST(jsonReq({ name: "x" }))
    expect(res.status).toBe(400)
  })

  it("INT-HOLDINGS-006 — POST rejects unknown portfolioId", async () => {
    const res = await POST(jsonReq({ portfolioId: 999999, name: "x" }))
    expect(res.status).toBe(404)
  })

  it("INT-HOLDINGS-008 — POST rejects empty name", async () => {
    const res = await POST(jsonReq({ portfolioId: pid, name: "" }))
    expect(res.status).toBe(400)
  })

  it("INT-HOLDINGS-009 — POST rejects unknown type", async () => {
    const res = await POST(
      jsonReq({ portfolioId: pid, name: "X", type: "crypto" })
    )
    expect(res.status).toBe(400)
  })

  it("INT-HOLDINGS-ISIN-001 — POST accepts a valid ISIN", async () => {
    const res = await POST(
      jsonReq({ portfolioId: pid, name: "Apple", isin: "US0378331005" })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.isin).toBe("US0378331005")
  })

  it("INT-HOLDINGS-ISIN-002 — POST rejects malformed ISIN", async () => {
    const res = await POST(
      jsonReq({ portfolioId: pid, name: "Bad ISIN", isin: "not-an-isin" })
    )
    expect(res.status).toBe(400)
  })

  it("INT-HOLDINGS-ISIN-003 — POST rejects duplicate ISIN within the same portfolio", async () => {
    await POST(
      jsonReq({ portfolioId: pid, name: "Microsoft", isin: "US5949181045" })
    )
    const res = await POST(
      jsonReq({
        portfolioId: pid,
        name: "Microsoft (dup)",
        isin: "US5949181045",
      })
    )
    expect(res.status).toBe(409)
  })

  it("INT-HOLDINGS-ISIN-004 — Same ISIN in two different portfolios is allowed", async () => {
    const res = await POST(
      jsonReq({ portfolioId: pidB, name: "Microsoft", isin: "US5949181045" })
    )
    expect(res.status).toBe(201)
  })
})

describe("PATCH /api/holdings/[id]", () => {
  it("INT-HOLDINGS-010 — PATCH updates name", async () => {
    const h = db
      .insert(holdings)
      .values({
        portfolioId: pid,
        name: "Old Name",
        type: "etf",
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ name: "New Name" }, "PATCH"),
      params(h.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("New Name")
  })

  it("INT-HOLDINGS-011 — PATCH rejects empty body", async () => {
    const h = db
      .insert(holdings)
      .values({ portfolioId: pid, name: "E1", type: "etf" })
      .returning()
      .get()
    const res = await PATCH(jsonReq({}, "PATCH"), params(h.id))
    expect(res.status).toBe(400)
  })

  it("INT-HOLDINGS-012 — PATCH rejects empty name", async () => {
    const h = db
      .insert(holdings)
      .values({ portfolioId: pid, name: "E2", type: "etf" })
      .returning()
      .get()
    const res = await PATCH(jsonReq({ name: "   " }, "PATCH"), params(h.id))
    expect(res.status).toBe(400)
  })

  it("INT-HOLDINGS-013 — PATCH rejects bad type", async () => {
    const h = db
      .insert(holdings)
      .values({ portfolioId: pid, name: "E3", type: "etf" })
      .returning()
      .get()
    const res = await PATCH(jsonReq({ type: "weird" }, "PATCH"), params(h.id))
    expect(res.status).toBe(400)
  })

  it("INT-HOLDINGS-014 — PATCH unknown id returns 404", async () => {
    const res = await PATCH(jsonReq({ name: "X" }, "PATCH"), params(999999))
    expect(res.status).toBe(404)
  })

  it("INT-HOLDINGS-ISIN-005 — PATCH can set then clear ISIN", async () => {
    const h = db
      .insert(holdings)
      .values({ portfolioId: pid, name: "ISIN PATCH", type: "etf" })
      .returning()
      .get()
    const setRes = await PATCH(
      jsonReq({ isin: "US0231351067" }, "PATCH"),
      params(h.id)
    )
    expect(setRes.status).toBe(200)
    expect((await setRes.json()).isin).toBe("US0231351067")
    const clearRes = await PATCH(jsonReq({ isin: null }, "PATCH"), params(h.id))
    expect(clearRes.status).toBe(200)
    expect((await clearRes.json()).isin).toBeNull()
  })
})

describe("DELETE /api/holdings/[id]", () => {
  it("INT-HOLDINGS-015 — DELETE removes the holding", async () => {
    const h = db
      .insert(holdings)
      .values({ portfolioId: pid, name: "Del", type: "etf" })
      .returning()
      .get()
    const res = await DELETE(jsonReq({}, "DELETE"), params(h.id))
    expect(res.status).toBe(200)
    const row = db.select().from(holdings).where(eq(holdings.id, h.id)).get()
    expect(row).toBeUndefined()
  })

  it("INT-HOLDINGS-016 — DELETE invalid id returns 400", async () => {
    const res = await DELETE(jsonReq({}, "DELETE"), params("abc"))
    expect(res.status).toBe(400)
  })
})
