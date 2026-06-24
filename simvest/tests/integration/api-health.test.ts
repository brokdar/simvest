import { describe, it, expect, beforeAll, vi } from "vitest"
import { GET } from "@/app/api/health/route"
import { db } from "@/lib/db"
import { portfolios, entries, goals, settings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"

beforeAll(async () => {
  await ensureSeeded()
})

describe("GET /api/health — healthy DB", () => {
  it("INT-HEALTH-001 — GET returns 200 with correct payload shape on healthy DB", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("status")
    expect(body).toHaveProperty("database")
    expect(body).toHaveProperty("uptimeSeconds")
    expect(body).toHaveProperty("counts")
    expect(body.status).toBe("ok")
    expect(body.database).toBe("ok")
    expect(typeof body.uptimeSeconds).toBe("number")
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
    expect(body.counts).toHaveProperty("portfolios")
    expect(body.counts).toHaveProperty("entries")
    expect(body.counts).toHaveProperty("goals")
    expect(body.counts).toHaveProperty("settings")
  })

  it("INT-HEALTH-002 — GET counts reflect fresh DB state (no demo data seeded)", async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.counts.portfolios).toBe(0)
    expect(body.counts.entries).toBe(0)
    expect(body.counts.goals).toBe(0)
    expect(body.counts.settings).toBe(1)
  })

  it("INT-HEALTH-003 — GET counts increase after inserting a portfolio", async () => {
    const p = db
      .insert(portfolios)
      .values({
        name: "Extra Portfolio",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
      })
      .returning()
      .get()
    const res = await GET()
    const body = await res.json()
    expect(body.counts.portfolios).toBe(1)
    expect(body.counts.entries).toBe(0)
    // Clean up
    db.delete(portfolios).where(eq(portfolios.id, p.id)).run()
  })

  it("INT-HEALTH-004 — GET counts reflect 0 for empty tables", async () => {
    db.delete(entries).run()
    db.delete(portfolios).run()
    db.delete(goals).run()
    db.delete(settings).run()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
    expect(body.counts.portfolios).toBe(0)
    expect(body.counts.entries).toBe(0)
    expect(body.counts.goals).toBe(0)
    expect(body.counts.settings).toBe(0)
  })

  it("INT-HEALTH-005 — GET uptimeSeconds is >= 0 and numeric integer", async () => {
    const res = await GET()
    const body = await res.json()
    expect(typeof body.uptimeSeconds).toBe("number")
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(body.uptimeSeconds)).toBe(true)
  })

  it("INT-HEALTH-006 — GET uptimeSeconds is non-decreasing over successive calls", async () => {
    const res1 = await GET()
    const body1 = await res1.json()
    await new Promise<void>((r) => setTimeout(r, 1100))
    const res2 = await GET()
    const body2 = await res2.json()
    expect(body2.uptimeSeconds).toBeGreaterThanOrEqual(body1.uptimeSeconds)
  })
})

describe("GET /api/health — DB failure (503)", () => {
  it("INT-HEALTH-007 — GET returns 503 when DB throws", async () => {
    vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("DB unavailable")
    })
    const res = await GET()
    vi.restoreAllMocks()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe("error")
    expect(body.database).toBe("unreachable")
    expect(typeof body.error).toBe("string")
    expect(body.error).toContain("DB unavailable")
  })

  it("INT-HEALTH-008 — GET 503: error field is the Error message string", async () => {
    vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("connection closed")
    })
    const res = await GET()
    vi.restoreAllMocks()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe("connection closed")
  })

  it("INT-HEALTH-009 — GET 503: non-Error throw produces 'unknown error'", async () => {
    vi.spyOn(db, "select").mockImplementation(() => {
      throw "string error" // non-Error throw is intentional — tests the 'unknown error' path
    })
    const res = await GET()
    vi.restoreAllMocks()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe("unknown error")
  })

  it("INT-HEALTH-010 — GET 503 response does not include counts", async () => {
    vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("no counts for you")
    })
    const res = await GET()
    vi.restoreAllMocks()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).not.toHaveProperty("counts")
  })
})
