import { describe, it, expect, beforeAll } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "@/app/api/income-events/route"
import { PATCH, DELETE } from "@/app/api/income-events/[id]/route"
import { db } from "@/lib/db"
import { dividendEvents, holdings, portfolios } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"

function jsonReq(body: unknown, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/income-events", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) }
}

let pid: number
let hid: number
let hid2: number

beforeAll(async () => {
  await ensureSeeded()
  const p = db
    .insert(portfolios)
    .values({
      name: "Income Test Portfolio",
      color: "#1E40AF",
      targetMonthlyContribution: 0,
    })
    .returning()
    .get()
  pid = p.id
  const h = db
    .insert(holdings)
    .values({
      portfolioId: pid,
      name: "Test Co",
      type: "stock",
    })
    .returning()
    .get()
  hid = h.id
  const h2 = db
    .insert(holdings)
    .values({ portfolioId: pid, name: "Test 2", type: "etf" })
    .returning()
    .get()
  hid2 = h2.id
})

describe("GET /api/income-events", () => {
  it("INT-INCOME-001 — GET returns empty array on fresh DB", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(0)
  })
})

describe("POST /api/income-events", () => {
  it("INT-INCOME-002 — POST creates a dividend and infers portfolioId from holding", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: hid,
        paidDate: "2024-03-15",
        amount: 42.5,
        tax: -5.25,
        note: "Q1 distribution",
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeGreaterThan(0)
    expect(body.kind).toBe("dividend")
    expect(body.holdingId).toBe(hid)
    expect(body.portfolioId).toBe(pid)
    expect(body.holdingName).toBe("Test Co")
    expect(body.paidDate).toBe("2024-03-15")
    expect(body.amount).toBe(42.5)
    expect(body.tax).toBe(-5.25)
    expect(body.note).toBe("Q1 distribution")
  })

  it("INT-INCOME-003 — POST defaults note to empty string and tax to 0", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: hid,
        paidDate: "2024-06-15",
        amount: 10,
      })
    )
    const body = await res.json()
    expect(body.note).toBe("")
    expect(body.tax).toBe(0)
  })

  it("INT-INCOME-004 — POST rejects missing holdingId for dividend", async () => {
    const res = await POST(
      jsonReq({ kind: "dividend", paidDate: "2024-01-15", amount: 10 })
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-005 — POST rejects unknown holdingId", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: 999999,
        paidDate: "2024-01-15",
        amount: 10,
      })
    )
    expect(res.status).toBe(404)
  })

  it("INT-INCOME-006 — POST rejects malformed paidDate", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: hid,
        paidDate: "15/03/2024",
        amount: 10,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-007 — POST rejects non-ISO paidDate string", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: hid,
        paidDate: "2024-13-01",
        amount: 10,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-008 — POST rejects zero amount", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: hid,
        paidDate: "2024-01-15",
        amount: 0,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-009 — POST rejects negative amount", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: hid,
        paidDate: "2024-01-15",
        amount: -5,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-010 — POST rejects positive tax", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: hid,
        paidDate: "2024-01-15",
        amount: 10,
        tax: 1,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-018 — POST with kind=interest and holdingId=null succeeds", async () => {
    const res = await POST(
      jsonReq({
        kind: "interest",
        portfolioId: pid,
        paidDate: "2024-04-15",
        amount: 3.25,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.kind).toBe("interest")
    expect(body.holdingId).toBeNull()
    expect(body.portfolioId).toBe(pid)
  })

  it("INT-INCOME-019 — POST with kind=interest and a holdingId is rejected", async () => {
    const res = await POST(
      jsonReq({
        kind: "interest",
        portfolioId: pid,
        holdingId: hid,
        paidDate: "2024-04-15",
        amount: 3,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-020 — POST rejects unknown kind", async () => {
    const res = await POST(
      jsonReq({
        kind: "bonus",
        holdingId: hid,
        paidDate: "2024-04-15",
        amount: 3,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-021 — POST stores negative tax round-trips correctly", async () => {
    const res = await POST(
      jsonReq({
        kind: "dividend",
        holdingId: hid,
        paidDate: "2024-08-15",
        amount: 100,
        tax: -15.5,
      })
    )
    const body = await res.json()
    expect(body.tax).toBe(-15.5)
  })
})

describe("PATCH /api/income-events/[id]", () => {
  it("INT-INCOME-011 — PATCH updates amount and note", async () => {
    const created = db
      .insert(dividendEvents)
      .values({
        portfolioId: pid,
        holdingId: hid,
        paidDate: "2024-09-15",
        amount: 10,
        kind: "dividend",
        tax: 0,
        note: "",
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ amount: 25, note: "Updated" }, "PATCH"),
      params(created.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.amount).toBe(25)
    expect(body.note).toBe("Updated")
  })

  it("INT-INCOME-012 — PATCH changing holding moves event to that holding's portfolio", async () => {
    const created = db
      .insert(dividendEvents)
      .values({
        portfolioId: pid,
        holdingId: hid,
        paidDate: "2024-09-15",
        amount: 10,
        kind: "dividend",
        tax: 0,
        note: "",
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ holdingId: hid2 }, "PATCH"),
      params(created.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.holdingId).toBe(hid2)
    expect(body.holdingName).toBe("Test 2")
  })

  it("INT-INCOME-013 — PATCH rejects malformed paidDate", async () => {
    const created = db
      .insert(dividendEvents)
      .values({
        portfolioId: pid,
        holdingId: hid,
        paidDate: "2024-09-15",
        amount: 10,
        kind: "dividend",
        tax: 0,
        note: "",
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ paidDate: "not-a-date" }, "PATCH"),
      params(created.id)
    )
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-014 — PATCH rejects zero amount", async () => {
    const created = db
      .insert(dividendEvents)
      .values({
        portfolioId: pid,
        holdingId: hid,
        paidDate: "2024-09-15",
        amount: 10,
        kind: "dividend",
        tax: 0,
        note: "",
      })
      .returning()
      .get()
    const res = await PATCH(jsonReq({ amount: 0 }, "PATCH"), params(created.id))
    expect(res.status).toBe(400)
  })

  it("INT-INCOME-015 — PATCH unknown id returns 404", async () => {
    const res = await PATCH(jsonReq({ amount: 5 }, "PATCH"), params(999999))
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/income-events/[id]", () => {
  it("INT-INCOME-016 — DELETE removes the event", async () => {
    const created = db
      .insert(dividendEvents)
      .values({
        portfolioId: pid,
        holdingId: hid,
        paidDate: "2024-12-15",
        amount: 5,
        kind: "dividend",
        tax: 0,
        note: "",
      })
      .returning()
      .get()
    const res = await DELETE(jsonReq({}, "DELETE"), params(created.id))
    expect(res.status).toBe(200)
    const row = db
      .select()
      .from(dividendEvents)
      .where(eq(dividendEvents.id, created.id))
      .get()
    expect(row).toBeUndefined()
  })

  it("INT-INCOME-017 — DELETE invalid id returns 400", async () => {
    const res = await DELETE(jsonReq({}, "DELETE"), params("nope"))
    expect(res.status).toBe(400)
  })
})

describe("Cascading deletes", () => {
  it("INT-INCOME-022 — deleting a holding cascades to its dividend events", async () => {
    const h = db
      .insert(holdings)
      .values({
        portfolioId: pid,
        name: "Cascade Test",
        type: "stock",
      })
      .returning()
      .get()
    db.insert(dividendEvents)
      .values({
        portfolioId: pid,
        holdingId: h.id,
        paidDate: "2024-01-15",
        amount: 10,
        kind: "dividend",
        tax: 0,
        note: "",
      })
      .run()
    db.delete(holdings).where(eq(holdings.id, h.id)).run()
    const remaining = db
      .select()
      .from(dividendEvents)
      .where(eq(dividendEvents.holdingId, h.id))
      .all()
    expect(remaining).toHaveLength(0)
  })
})
