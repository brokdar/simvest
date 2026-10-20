import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { eq, inArray } from "drizzle-orm"
import { POST } from "@/app/api/entries/batch/route"
import { db } from "@/lib/db"
import { entries, portfolios } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"

function batchReq(body: unknown) {
  const req = new NextRequest("http://localhost/api/entries/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return POST(req)
}

let a: number
let b: number

function row(portfolioId: number, o: Record<string, unknown> = {}) {
  return {
    portfolioId,
    year: 2026,
    month: 10,
    day: 31,
    invested: 100,
    value: 1000,
    note: "",
    ...o,
  }
}

function rowsFor(ids: number[]) {
  return db
    .select()
    .from(entries)
    .where(inArray(entries.portfolioId, ids))
    .all()
}

beforeAll(async () => {
  await ensureSeeded()
  const mk = (name: string) =>
    db
      .insert(portfolios)
      .values({ name, color: "#000", targetMonthlyContribution: 0 })
      .returning()
      .get().id
  a = mk("Batch A")
  b = mk("Batch B")
})

beforeEach(() => {
  db.delete(entries)
    .where(inArray(entries.portfolioId, [a, b]))
    .run()
})

describe("POST /api/entries/batch (W2 catch-up)", () => {
  it("INT-ENTRIES-BATCH-001 — writes one row per account in one request", async () => {
    const res = await batchReq({
      entries: [row(a, { value: 1500 }), row(b, { value: 2500 })],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.counts).toEqual({ added: 2, updated: 0 })
    expect(
      body.entries.map((e: { portfolioId: number }) => e.portfolioId)
    ).toEqual([a, b])
    expect(body.entries[0].label).toBeTruthy()
    const saved = rowsFor([a, b])
    expect(saved.map((e) => e.value).sort()).toEqual([1500, 2500])
  })

  it("INT-ENTRIES-BATCH-002 — an existing month is updated, not duplicated", async () => {
    await batchReq({ entries: [row(a, { value: 1000 })] })
    const res = await batchReq({
      entries: [row(a, { value: 1100, invested: 50 })],
    })
    expect((await res.json()).counts).toEqual({ added: 0, updated: 1 })
    const saved = rowsFor([a])
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ value: 1100, invested: 50 })
  })

  it("INT-ENTRIES-BATCH-003 — one bad row rejects the batch, names it, and writes nothing", async () => {
    const res = await batchReq({
      entries: [row(a), row(b, { value: null })],
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/^Row 2:/)
    expect(body.index).toBe(1)
    expect(rowsFor([a, b])).toHaveLength(0)
  })

  it("INT-ENTRIES-BATCH-004 — an unknown account rejects the batch", async () => {
    const res = await batchReq({ entries: [row(a), row(999_999)] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no longer exists/)
    expect(rowsFor([a])).toHaveLength(0)
  })

  it("INT-ENTRIES-BATCH-005 — empty or malformed bodies are 400", async () => {
    expect((await batchReq({ entries: [] })).status).toBe(400)
    expect((await batchReq({})).status).toBe(400)
    expect((await batchReq({ entries: [row(a, { day: 32 })] })).status).toBe(
      400
    )
    expect(
      db.select().from(entries).where(eq(entries.portfolioId, a)).all()
    ).toHaveLength(0)
  })
})
