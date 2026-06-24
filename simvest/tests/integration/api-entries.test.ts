import { describe, it, expect, beforeAll } from "vitest"
import { NextRequest } from "next/server"
import { POST as upsertEntry } from "@/app/api/portfolios/[id]/entries/route"
import {
  PATCH as patchEntry,
  DELETE as deleteEntry,
} from "@/app/api/entries/[id]/route"
import { db } from "@/lib/db"
import { portfolios, entries } from "@/lib/db/schema"
import { eq, and, count } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"
import { daysInMonth } from "@/lib/dates"

function withDefaultDay(body: unknown): unknown {
  if (!body || typeof body !== "object") return body
  const b = body as Record<string, unknown>
  if (
    typeof b.year === "number" &&
    Number.isFinite(b.year) &&
    typeof b.month === "number" &&
    Number.isFinite(b.month) &&
    b.day === undefined
  ) {
    const m = Math.max(1, Math.min(12, Math.floor(b.month)))
    const y = Math.floor(b.year)
    return { ...b, day: daysInMonth(y, m) }
  }
  return body
}

function upsertReq(
  portfolioId: number,
  body: unknown
): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(
    `http://localhost/api/portfolios/${portfolioId}/entries`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withDefaultDay(body)),
    }
  )
  return [req, { params: Promise.resolve({ id: String(portfolioId) }) }]
}

function entryParams(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) }
}

function jsonReq(body: unknown, method = "PATCH"): NextRequest {
  return new NextRequest("http://localhost/api/entries/1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// Helper to insert an entry directly and return it
function insertEntry(
  portfolioId: number,
  year: number,
  month: number,
  overrides: Partial<{
    invested: number
    value: number
    note: string
  }> = {}
) {
  return db
    .insert(entries)
    .values({
      portfolioId,
      year,
      month,
      day: daysInMonth(year, month),
      invested: overrides.invested ?? 0,
      value: overrides.value ?? 0,
      note: overrides.note ?? "",
    })
    .returning()
    .get()
}

// Seeded portfolio ids — created in beforeAll
let pid1: number
let pid2: number

beforeAll(async () => {
  await ensureSeeded()
  // Insert two portfolios for use in tests that need clean portfolios
  const p1 = db
    .insert(portfolios)
    .values({
      name: "Entries Test P1",
      color: "#1E40AF",
      targetMonthlyContribution: 0,
    })
    .returning()
    .get()
  const p2 = db
    .insert(portfolios)
    .values({
      name: "Entries Test P2",
      color: "#059669",
      targetMonthlyContribution: 0,
    })
    .returning()
    .get()
  pid1 = p1.id
  pid2 = p2.id
})

describe("POST /api/portfolios/[id]/entries — upsert", () => {
  it("INT-ENTRIES-001 — POST upsert creates a new entry (insert path)", async () => {
    const [req, ctx] = upsertReq(pid1, {
      year: 2030,
      month: 1,
      invested: 500,
      value: 510,
      note: "Test",
    })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(typeof body.id).toBe("number")
    expect(body.id).toBeGreaterThan(0)
    expect(body.portfolioId).toBe(pid1)
    expect(body.year).toBe(2030)
    expect(body.month).toBe(1)
    expect(body.invested).toBe(500)
    expect(body.value).toBe(510)
    expect(body.note).toBe("Test")
    expect(body.label).toBe("Jan 30")
    const rows = db
      .select()
      .from(entries)
      .where(
        and(
          eq(entries.portfolioId, pid1),
          eq(entries.year, 2030),
          eq(entries.month, 1)
        )
      )
      .all()
    expect(rows).toHaveLength(1)
  })

  it("INT-ENTRIES-002 — POST upsert updates an existing entry (update path, same year/month)", async () => {
    const original = insertEntry(pid1, 2030, 6, { invested: 100 })
    const [req, ctx] = upsertReq(pid1, {
      year: 2030,
      month: 6,
      invested: 999,
      value: 1000,
    })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(original.id)
    expect(body.invested).toBe(999)
    expect(body.value).toBe(1000)
    const count2 = db
      .select({ c: count() })
      .from(entries)
      .where(
        and(
          eq(entries.portfolioId, pid1),
          eq(entries.year, 2030),
          eq(entries.month, 6)
        )
      )
      .get()!.c
    expect(count2).toBe(1)
  })

  it("INT-ENTRIES-003 — POST upsert: updating an entry preserves its row id", async () => {
    const original = insertEntry(pid1, 2030, 3, { invested: 50 })
    const [req, ctx] = upsertReq(pid1, {
      year: 2030,
      month: 3,
      invested: 777,
      value: 800,
    })
    const res = await upsertEntry(req, ctx)
    const body = await res.json()
    expect(body.id).toBe(original.id)
    const countAfter = db
      .select({ c: count() })
      .from(entries)
      .where(
        and(
          eq(entries.portfolioId, pid1),
          eq(entries.year, 2030),
          eq(entries.month, 3)
        )
      )
      .get()!.c
    expect(countAfter).toBe(1)
  })

  it("INT-ENTRIES-004 — POST upsert: omitted optional fields default to 0 / null / empty string", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 2031, month: 1 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.invested).toBe(0)
    // value is nullable (migration 0009): omitted means "not recorded yet".
    expect(body.value).toBeNull()
    expect(body.note).toBe("")
  })

  it("INT-ENTRIES-005 — POST upsert: month is clamped to [1, 12] (below range)", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 2032, month: 0 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.month).toBe(1)
  })

  it("INT-ENTRIES-005b — POST upsert: month is clamped to [1, 12] (above range)", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 2032, month: 13 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.month).toBe(12)
  })

  it("INT-ENTRIES-006 — POST upsert: December entry (month=12) is stored correctly", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 2033, month: 12, invested: 300 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.month).toBe(12)
    expect(body.label).toBe("Dec 33")
  })

  it("INT-ENTRIES-007 — POST upsert: January entry (month=1) is stored correctly", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 2034, month: 1 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.month).toBe(1)
    expect(body.label).toBe("Jan 34")
  })

  it("INT-ENTRIES-008 — POST upsert: year is floored (fractional year truncated)", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 2025.9, month: 6 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.year).toBe(2025)
  })

  it("INT-ENTRIES-009 — POST upsert: negative invested value is accepted", async () => {
    const [req, ctx] = upsertReq(pid1, {
      year: 2036,
      month: 4,
      invested: -1500,
    })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.invested).toBe(-1500)
  })

  it("INT-ENTRIES-010 — POST upsert: year=0 is accepted (no lower bound enforced)", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 0, month: 6 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.year).toBe(0)
  })

  it("INT-ENTRIES-011 — POST upsert: missing year returns 400", async () => {
    const [req, ctx] = upsertReq(pid1, { month: 6 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("year and month are required")
  })

  it("INT-ENTRIES-012 — POST upsert: missing month returns 400", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 2025 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("year and month are required")
  })

  it("INT-ENTRIES-013 — POST upsert: non-numeric year returns 400", async () => {
    const [req, ctx] = upsertReq(pid1, { year: "bad", month: 6 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("year and month are required")
  })

  it("INT-ENTRIES-014 — POST upsert: non-numeric portfolioId returns 400", async () => {
    const req = new NextRequest("http://localhost/api/portfolios/abc/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: 2025, month: 6 }),
    })
    const res = await upsertEntry(req, {
      params: Promise.resolve({ id: "abc" }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid id")
  })

  it("INT-ENTRIES-015 — POST upsert: different portfolios can share the same (year, month)", async () => {
    const [req1, ctx1] = upsertReq(pid1, {
      year: 2037,
      month: 6,
      invested: 100,
    })
    const [req2, ctx2] = upsertReq(pid2, {
      year: 2037,
      month: 6,
      invested: 200,
    })
    const res1 = await upsertEntry(req1, ctx1)
    const res2 = await upsertEntry(req2, ctx2)
    expect(res1.status).toBe(201)
    expect(res2.status).toBe(201)
    const rows = db
      .select()
      .from(entries)
      .where(and(eq(entries.year, 2037), eq(entries.month, 6)))
      .all()
    const pids = rows.map((r) => r.portfolioId)
    expect(pids).toContain(pid1)
    expect(pids).toContain(pid2)
    const p1Entry = rows.find((r) => r.portfolioId === pid1)
    const p2Entry = rows.find((r) => r.portfolioId === pid2)
    expect(p1Entry?.portfolioId).not.toBe(p2Entry?.portfolioId)
  })

  it("INT-ENTRIES-016 — POST upsert: label field is returned for both insert and update paths", async () => {
    const [reqI, ctxI] = upsertReq(pid1, {
      year: 2035,
      month: 7,
      invested: 100,
    })
    const resI = await upsertEntry(reqI, ctxI)
    const bodyI = await resI.json()
    expect(bodyI.label).toBe("Jul 35")
    const [reqU, ctxU] = upsertReq(pid1, {
      year: 2035,
      month: 7,
      invested: 200,
    })
    const resU = await upsertEntry(reqU, ctxU)
    const bodyU = await resU.json()
    expect(bodyU.label).toBe("Jul 35")
  })

  it("INT-ENTRIES-027 — POST upsert: response includes portfolioId field", async () => {
    const [req, ctx] = upsertReq(pid1, { year: 2038, month: 3, invested: 50 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.portfolioId).toBe(pid1)
  })

  it("POST with year: null, month: null returns 400", async () => {
    const [req, ctx] = upsertReq(pid1, { year: null, month: null })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("year and month are required")
  })

  it("POST with year: NaN returns 400", async () => {
    const [req, ctx] = upsertReq(pid1, { year: NaN, month: 6 })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("year and month are required")
  })
})

describe("POST /api/portfolios/[id]/entries — day validation", () => {
  it("INT-ENTRIES-028 — POST stores the supplied day", async () => {
    const [req, ctx] = upsertReq(pid1, {
      year: 2045,
      month: 4,
      day: 15,
      invested: 100,
      value: 110,
    })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.day).toBe(15)
  })

  it("INT-ENTRIES-029 — POST rejects day > daysInMonth (Feb 30)", async () => {
    const [req, ctx] = upsertReq(pid1, {
      year: 2045,
      month: 2,
      day: 30,
      invested: 100,
      value: 110,
    })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/day must be between 1 and 28/)
  })

  it("INT-ENTRIES-030 — POST accepts Feb 29 in a leap year (2024)", async () => {
    const [req, ctx] = upsertReq(pid1, {
      year: 2024,
      month: 2,
      day: 29,
      invested: 100,
      value: 110,
    })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.day).toBe(29)
  })

  it("INT-ENTRIES-031 — POST rejects day=0", async () => {
    const [req, ctx] = upsertReq(pid1, {
      year: 2046,
      month: 6,
      day: 0,
      invested: 100,
      value: 110,
    })
    const res = await upsertEntry(req, ctx)
    expect(res.status).toBe(400)
  })

  it("INT-ENTRIES-032 — POST rejects missing day with 'day is required'", async () => {
    const req = new NextRequest(
      `http://localhost/api/portfolios/${pid1}/entries`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: 2047, month: 6, invested: 100 }),
      }
    )
    const res = await upsertEntry(req, {
      params: Promise.resolve({ id: String(pid1) }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("day is required")
  })
})

describe("PATCH /api/entries/[id]", () => {
  it("INT-ENTRIES-017 — PATCH entry: update single numeric field", async () => {
    const e = insertEntry(pid1, 2040, 1, {
      invested: 100,
      value: 200,
      note: "original",
    })
    const res = await patchEntry(jsonReq({ invested: 750 }), entryParams(e.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invested).toBe(750)
    expect(body.value).toBe(200)
    expect(body.note).toBe("original")
    expect(typeof body.label).toBe("string")
    expect(body.label.length).toBeGreaterThan(0)
  })

  it("INT-ENTRIES-018 — PATCH entry: update note field", async () => {
    const e = insertEntry(pid1, 2040, 2, {
      invested: 100,
      value: 200,
      note: "old",
    })
    const res = await patchEntry(
      jsonReq({ note: "Updated note" }),
      entryParams(e.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.note).toBe("Updated note")
    expect(body.invested).toBe(100)
    expect(body.value).toBe(200)
  })

  it("INT-ENTRIES-019 — PATCH entry: update multiple fields at once", async () => {
    const e = insertEntry(pid1, 2040, 3, {
      invested: 100,
      value: 200,
    })
    const res = await patchEntry(
      jsonReq({ invested: 900, value: 950 }),
      entryParams(e.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invested).toBe(900)
    expect(body.value).toBe(950)
  })

  it("INT-ENTRIES-020 — PATCH entry: empty body returns 400", async () => {
    const e = insertEntry(pid1, 2040, 4)
    const res = await patchEntry(jsonReq({}), entryParams(e.id))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("no changes")
  })

  it("INT-ENTRIES-021 — PATCH entry: non-existent id returns 404", async () => {
    const res = await patchEntry(jsonReq({ invested: 1 }), entryParams(99999))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("not found")
  })

  it("INT-ENTRIES-022 — PATCH entry: non-numeric id returns 400", async () => {
    const res = await patchEntry(jsonReq({ invested: 1 }), entryParams("xyz"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid id")
  })

  it("INT-ENTRIES-023 — PATCH entry: unknown fields in body produce no changes", async () => {
    const e = insertEntry(pid1, 2040, 5)
    const res = await patchEntry(
      jsonReq({ unknownField: "ignored" } as never),
      entryParams(e.id)
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("no changes")
  })
})

describe("DELETE /api/entries/[id]", () => {
  it("INT-ENTRIES-024 — DELETE entry: removes the row", async () => {
    const e = insertEntry(pid1, 2041, 1, { invested: 100 })
    const req = new NextRequest(`http://localhost/api/entries/${e.id}`, {
      method: "DELETE",
    })
    const res = await deleteEntry(req, entryParams(e.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    const rows = db.select().from(entries).where(eq(entries.id, e.id)).all()
    expect(rows).toHaveLength(0)
  })

  it("INT-ENTRIES-025 — DELETE entry: non-existent id returns 200 (silent no-op)", async () => {
    const req = new NextRequest("http://localhost/api/entries/99999", {
      method: "DELETE",
    })
    const res = await deleteEntry(req, entryParams(99999))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it("INT-ENTRIES-026 — DELETE entry: non-numeric id returns 400", async () => {
    const req = new NextRequest("http://localhost/api/entries/bad", {
      method: "DELETE",
    })
    const res = await deleteEntry(req, entryParams("bad"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid id")
  })
})
