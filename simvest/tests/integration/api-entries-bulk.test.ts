import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { POST } from "@/app/api/portfolios/[id]/entries/bulk/route"
import { db } from "@/lib/db"
import { entries, portfolios } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"

function bulkReq(id: number | string, body: unknown) {
  const req = new NextRequest(
    `http://localhost/api/portfolios/${id}/entries/bulk`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  return POST(req, { params: Promise.resolve({ id: String(id) }) })
}

let pid: number

beforeAll(async () => {
  await ensureSeeded()
  const p = db
    .insert(portfolios)
    .values({
      name: "Bulk Entries",
      color: "#000",
      targetMonthlyContribution: 0,
    })
    .returning()
    .get()
  pid = p.id
})

beforeEach(() => {
  db.delete(entries).where(eq(entries.portfolioId, pid)).run()
})

describe("bulk entries route", () => {
  it("INT-ENTRIES-BULK-001 — all-new batch inserts and counts adds", async () => {
    const res = await bulkReq(pid, {
      entries: [
        {
          year: 2024,
          month: 1,
          day: 31,
          invested: 250,
          value: 10000,
          note: "",
        },
        {
          year: 2024,
          month: 2,
          day: 29,
          invested: 250,
          value: 10500,
          note: "",
        },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.counts).toEqual({ added: 2, updated: 0, skipped: 0 })
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].label).toBeTruthy()

    const persisted = db
      .select()
      .from(entries)
      .where(eq(entries.portfolioId, pid))
      .all()
    expect(persisted).toHaveLength(2)
  })

  it("INT-ENTRIES-BULK-002 — existing month updates, new months add", async () => {
    db.insert(entries)
      .values({
        portfolioId: pid,
        year: 2024,
        month: 1,
        day: 31,
        invested: 100,
        value: 9000,
        note: "old",
      })
      .run()

    const res = await bulkReq(pid, {
      entries: [
        {
          year: 2024,
          month: 1,
          day: 31,
          invested: 250,
          value: 10000,
          note: "new",
        },
        {
          year: 2024,
          month: 2,
          day: 29,
          invested: 250,
          value: 10500,
          note: "",
        },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.counts).toEqual({ added: 1, updated: 1, skipped: 0 })

    const jan = db
      .select()
      .from(entries)
      .where(and(eq(entries.portfolioId, pid), eq(entries.month, 1)))
      .get()
    expect(jan?.invested).toBe(250)
    expect(jan?.value).toBe(10000)
    expect(jan?.note).toBe("new")
  })

  it("INT-ENTRIES-BULK-003 — null value round-trips as NULL", async () => {
    const res = await bulkReq(pid, {
      entries: [
        { year: 2024, month: 3, day: 31, invested: 250, value: null, note: "" },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries[0].value).toBe(null)

    const row = db
      .select()
      .from(entries)
      .where(and(eq(entries.portfolioId, pid), eq(entries.month, 3)))
      .get()
    expect(row?.value).toBe(null)
  })

  it("INT-ENTRIES-BULK-004 — invalid id and empty body return 400", async () => {
    const bad = await bulkReq("abc", { entries: [] })
    expect(bad.status).toBe(400)

    const empty = await bulkReq(pid, { entries: [] })
    expect(empty.status).toBe(400)
  })

  it("INT-ENTRIES-BULK-005 — an invalid row is skipped while valid rows write", async () => {
    const res = await bulkReq(pid, {
      entries: [
        {
          year: 2024,
          month: 4,
          day: 30,
          invested: 250,
          value: 12000,
          note: "",
        },
        // day out of range for April → rejected by validateEntryUpsert
        {
          year: 2024,
          month: 4,
          day: 31,
          invested: 250,
          value: 12000,
          note: "",
        },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    // The valid April row inserts; the invalid one (same month, day 31) is skipped.
    expect(body.counts.added).toBe(1)
    expect(body.counts.skipped).toBe(1)
  })
})
