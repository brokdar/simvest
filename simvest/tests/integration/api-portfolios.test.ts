import { describe, it, expect, beforeAll } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "@/app/api/portfolios/route"
import { PATCH, DELETE } from "@/app/api/portfolios/[id]/route"
import { db } from "@/lib/db"
import { portfolios, entries } from "@/lib/db/schema"
import { eq, count } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"

function jsonReq(body: unknown, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/portfolios", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id: number) {
  return { params: Promise.resolve({ id: String(id) }) }
}

beforeAll(async () => {
  await ensureSeeded()
})

describe("GET /api/portfolios", () => {
  it("INT-PORTFOLIOS-001 — GET returns empty array on fresh DB (no demo data seeded)", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(0)
  })

  it("INT-PORTFOLIOS-002 — GET returns empty array when no portfolios exist", async () => {
    db.delete(entries).run()
    db.delete(portfolios).run()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it("INT-PORTFOLIOS-022 — GET returns entries with label field populated", async () => {
    // Re-seed by inserting a portfolio with one entry
    const p = db
      .insert(portfolios)
      .values({
        name: "Label Test",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    db.insert(entries)
      .values({
        portfolioId: p.id,
        year: 2021,
        month: 3,
        invested: 100,
        value: 110,
        note: "",
      })
      .run()

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    const portfolio = body.find((x: { id: number }) => x.id === p.id)
    expect(portfolio).toBeDefined()
    expect(portfolio.entries.length).toBeGreaterThan(0)
    for (const entry of portfolio.entries) {
      expect(typeof entry.label).toBe("string")
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.label).toMatch(/^[A-Z][a-z]{2} \d{2}$/)
    }
    // Clean up
    db.delete(portfolios).where(eq(portfolios.id, p.id)).run()
  })
})

describe("POST /api/portfolios", () => {
  it("INT-PORTFOLIOS-003 — POST creates a portfolio with all fields", async () => {
    const res = await POST(
      jsonReq({
        name: "Tech Growth",
        color: "#7C3AED",
        targetMonthlyContribution: 500,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(typeof body.id).toBe("number")
    expect(body.id).toBeGreaterThan(0)
    expect(body.name).toBe("Tech Growth")
    expect(body.color).toBe("#7C3AED")
    expect(body.targetMonthlyContribution).toBe(500)
    expect(body.entries).toEqual([])
    const rows = db
      .select()
      .from(portfolios)
      .where(eq(portfolios.name, "Tech Growth"))
      .all()
    expect(rows).toHaveLength(1)
  })

  it("INT-PORTFOLIOS-004 — POST creates a portfolio with only name (defaults apply)", async () => {
    const res = await POST(jsonReq({ name: "Minimal" }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.color).toBe("#1E40AF")
    expect(body.targetMonthlyContribution).toBe(0)
    expect(body.entries).toEqual([])
  })

  it("INT-PORTFOLIOS-005 — POST trims whitespace from name", async () => {
    const res = await POST(jsonReq({ name: "  Padded Name  " }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe("Padded Name")
    const rows = db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, body.id))
      .all()
    expect(rows[0].name).toBe("Padded Name")
  })

  it("INT-PORTFOLIOS-006 — POST with missing name returns 400", async () => {
    const countBefore = db.select({ c: count() }).from(portfolios).get()!.c
    const res = await POST(jsonReq({ color: "#fff" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("name is required")
    const countAfter = db.select({ c: count() }).from(portfolios).get()!.c
    expect(countAfter).toBe(countBefore)
  })

  it("INT-PORTFOLIOS-007 — POST with empty-string name returns 400", async () => {
    const res = await POST(jsonReq({ name: "" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("name is required")
  })

  it("INT-PORTFOLIOS-008 — POST with non-finite targetMonthlyContribution defaults to 0", async () => {
    const res = await POST(
      jsonReq({ name: "Test", targetMonthlyContribution: "bad_value" })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.targetMonthlyContribution).toBe(0)
  })

  it("INT-PORTFOLIOS-009 — POST ignores unknown fields", async () => {
    const res = await POST(
      jsonReq({ name: "Valid", unknownField: "ignored", adminOverride: true })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).not.toHaveProperty("unknownField")
    expect(body).not.toHaveProperty("adminOverride")
  })

  it("POST with name: null returns 400 (null is falsy)", async () => {
    const res = await POST(jsonReq({ name: null }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("name is required")
  })

  it("POST with name: 123 (number) returns 400", async () => {
    const res = await POST(jsonReq({ name: 123 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("name is required")
  })

  it("POST with targetMonthlyContribution: 0 returns 201 with 0", async () => {
    const res = await POST(
      jsonReq({ name: "Zero Contrib", targetMonthlyContribution: 0 })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.targetMonthlyContribution).toBe(0)
  })
})

describe("PATCH /api/portfolios/[id]", () => {
  it("INT-PORTFOLIOS-010 — PATCH updates name only", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "Original",
        color: "#123456",
        targetMonthlyContribution: 100,
      })
      .returning()
      .get()
    const res = await PATCH(jsonReq({ name: "Renamed" }, "PATCH"), params(p.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("Renamed")
    expect(body.color).toBe("#123456")
    expect(body.targetMonthlyContribution).toBe(100)
    const row = db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, p.id))
      .get()
    expect(row?.name).toBe("Renamed")
  })

  it("INT-PORTFOLIOS-011 — PATCH updates color only", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "ColorTest",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ color: "#FF0000" }, "PATCH"),
      params(p.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.color).toBe("#FF0000")
    const row = db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, p.id))
      .get()
    expect(row?.name).toBe("ColorTest")
  })

  it("INT-PORTFOLIOS-012 — PATCH updates targetMonthlyContribution only", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "ContribTest",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ targetMonthlyContribution: 750 }, "PATCH"),
      params(p.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.targetMonthlyContribution).toBe(750)
    expect(body.name).toBe("ContribTest")
    expect(body.color).toBe("#1E40AF")
  })

  it("INT-PORTFOLIOS-013 — PATCH with negative targetMonthlyContribution returns 400", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "NegTest",
        color: "#1E40AF",
        targetMonthlyContribution: 100,
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ targetMonthlyContribution: -100 }, "PATCH"),
      params(p.id)
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe(
      "targetMonthlyContribution must be a non-negative number"
    )
    const row = db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, p.id))
      .get()
    expect(row?.targetMonthlyContribution).toBe(100)
  })

  it("INT-PORTFOLIOS-014 — PATCH with non-finite targetMonthlyContribution rejects with 400", async () => {
    // JSON.stringify({targetMonthlyContribution: Infinity}) serialises as null;
    // the validator (`asFiniteNumber`) rejects null instead of coercing it to 0.
    const p = db
      .insert(portfolios)
      .values({
        name: "InfTest",
        color: "#1E40AF",
        targetMonthlyContribution: 100,
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ targetMonthlyContribution: Infinity }, "PATCH"),
      params(p.id)
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/targetMonthlyContribution/)
  })

  it("INT-PORTFOLIOS-015 — PATCH with empty body returns 400", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "EmptyPatch",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    const res = await PATCH(jsonReq({}, "PATCH"), params(p.id))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("no changes")
  })

  it("INT-PORTFOLIOS-016 — PATCH on non-existent id returns 404", async () => {
    const res = await PATCH(jsonReq({ name: "Ghost" }, "PATCH"), params(99999))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("not found")
  })

  it("INT-PORTFOLIOS-017 — PATCH with non-numeric id returns 400", async () => {
    const res = await PATCH(jsonReq({ name: "Bad" }, "PATCH"), {
      params: Promise.resolve({ id: "abc" }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid id")
  })

  it("PATCH with only unknown fields returns 400 no changes", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "UnknownPatch",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    const res = await PATCH(
      jsonReq({ unknownField: "x" } as never, "PATCH"),
      params(p.id)
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("no changes")
  })
})

describe("DELETE /api/portfolios/[id]", () => {
  it("INT-PORTFOLIOS-018 — DELETE removes portfolio and returns ok", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "ToDelete",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    const req = new NextRequest(`http://localhost/api/portfolios/${p.id}`, {
      method: "DELETE",
    })
    const res = await DELETE(req, params(p.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    const rows = db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, p.id))
      .all()
    expect(rows).toHaveLength(0)
  })

  it("INT-PORTFOLIOS-019 — DELETE cascades to all associated entries", async () => {
    // Insert two portfolios and entries
    const p1 = db
      .insert(portfolios)
      .values({
        name: "CascadeP1",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    const p2 = db
      .insert(portfolios)
      .values({
        name: "CascadeP2",
        color: "#059669",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    // Insert 3 entries for p1 and 2 for p2
    db.insert(entries)
      .values([
        {
          portfolioId: p1.id,
          year: 2021,
          month: 1,
          invested: 100,
          value: 110,
          note: "",
        },
        {
          portfolioId: p1.id,
          year: 2021,
          month: 2,
          invested: 100,
          value: 110,
          note: "",
        },
        {
          portfolioId: p1.id,
          year: 2021,
          month: 3,
          invested: 100,
          value: 110,
          note: "",
        },
      ])
      .run()
    db.insert(entries)
      .values([
        {
          portfolioId: p2.id,
          year: 2021,
          month: 1,
          invested: 50,
          value: 60,
          note: "",
        },
        {
          portfolioId: p2.id,
          year: 2021,
          month: 2,
          invested: 50,
          value: 60,
          note: "",
        },
      ])
      .run()
    const portfolioCountBefore = db
      .select({ c: count() })
      .from(portfolios)
      .get()!.c
    const req = new NextRequest(`http://localhost/api/portfolios/${p1.id}`, {
      method: "DELETE",
    })
    await DELETE(req, params(p1.id))
    const portfolioCountAfter = db
      .select({ c: count() })
      .from(portfolios)
      .get()!.c
    expect(portfolioCountAfter).toBe(portfolioCountBefore - 1)
    const p1Entries = db
      .select({ c: count() })
      .from(entries)
      .where(eq(entries.portfolioId, p1.id))
      .get()!.c
    expect(p1Entries).toBe(0)
    const p2Entries = db
      .select({ c: count() })
      .from(entries)
      .where(eq(entries.portfolioId, p2.id))
      .get()!.c
    expect(p2Entries).toBe(2)
    // Cleanup
    db.delete(portfolios).where(eq(portfolios.id, p2.id)).run()
  })

  it("INT-PORTFOLIOS-020 — DELETE on non-existent id returns 200 (silent no-op)", async () => {
    // Insert known portfolios to track count
    const countBefore = db.select({ c: count() }).from(portfolios).get()!.c
    const req = new NextRequest("http://localhost/api/portfolios/99999", {
      method: "DELETE",
    })
    const res = await DELETE(req, params(99999))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    const countAfter = db.select({ c: count() }).from(portfolios).get()!.c
    expect(countAfter).toBe(countBefore)
  })

  it("INT-PORTFOLIOS-021 — DELETE with non-numeric id returns 400", async () => {
    const req = new NextRequest(
      "http://localhost/api/portfolios/not-a-number",
      { method: "DELETE" }
    )
    const res = await DELETE(req, {
      params: Promise.resolve({ id: "not-a-number" }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid id")
  })

  it("DELETE on portfolio with no entries returns 200, entry count stays 0", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "NoEntries",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    const entryCountBefore = db
      .select({ c: count() })
      .from(entries)
      .where(eq(entries.portfolioId, p.id))
      .get()!.c
    expect(entryCountBefore).toBe(0)
    const req = new NextRequest(`http://localhost/api/portfolios/${p.id}`, {
      method: "DELETE",
    })
    const res = await DELETE(req, params(p.id))
    expect(res.status).toBe(200)
    const entryCountAfter = db
      .select({ c: count() })
      .from(entries)
      .where(eq(entries.portfolioId, p.id))
      .get()!.c
    expect(entryCountAfter).toBe(0)
  })
})
