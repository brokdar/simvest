import { describe, it, expect, beforeAll } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "@/app/api/goals/route"
import { PATCH, DELETE } from "@/app/api/goals/[id]/route"
import { db } from "@/lib/db"
import { goals } from "@/lib/db/schema"
import { eq, count } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"

function jsonReq(body: unknown, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/goals", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) }
}

function insertAnnualIncomeGoal(
  name = "Test Goal",
  target = 30000,
  targetYear = 2040,
  color = "#1E40AF"
) {
  return db
    .insert(goals)
    .values({
      name,
      target,
      targetYear,
      color,
      kind: "annual_income",
      scope: "combined",
      swr: 4.0,
    })
    .returning()
    .get()
}

beforeAll(async () => {
  await ensureSeeded()
})

describe("GET /api/goals", () => {
  it("INT-GOALS-001 — GET returns empty array on fresh DB", async () => {
    db.delete(goals).run()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(0)
  })

  it("INT-GOALS-002 — GET returns goals ordered by id ascending", async () => {
    insertAnnualIncomeGoal("First", 12000, 2030)
    insertAnnualIncomeGoal("Second", 15000, 2050)
    const res = await GET()
    const body = await res.json()
    const ids = body.map((g: { id: number }) => g.id)
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1])
    }
    db.delete(goals).run()
  })

  it("INT-GOALS-003 — GET returns empty array when no goals exist", async () => {
    db.delete(goals).run()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it("INT-GOALS-004 — GET returns canonical GoalDTO shape (no createdAt / annualIncome leakage)", async () => {
    insertAnnualIncomeGoal("Check DTO", 20000, 2030)
    const res = await GET()
    const body = await res.json()
    expect(body.length).toBeGreaterThan(0)
    const g = body[0]
    expect(g).not.toHaveProperty("createdAt")
    expect(g).not.toHaveProperty("annualIncome")
    expect(g).toHaveProperty("kind")
    expect(g).toHaveProperty("scope")
    expect(g).toHaveProperty("target")
    db.delete(goals).run()
  })
})

describe("POST /api/goals", () => {
  it("INT-GOALS-005 — POST creates an annual_income goal with all fields", async () => {
    const res = await POST(
      jsonReq({
        name: "Lean FI",
        kind: "annual_income",
        scope: "combined",
        target: 18000,
        targetYear: 2032,
        color: "#7C3AED",
        swr: 4.0,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(typeof body.id).toBe("number")
    expect(body.id).toBeGreaterThan(0)
    expect(body.name).toBe("Lean FI")
    expect(body.target).toBe(18000)
    expect(body.targetYear).toBe(2032)
    expect(body.color).toBe("#7C3AED")
    expect(body.kind).toBe("annual_income")
    expect(body.scope).toBe("combined")
    expect(body.swr).toBe(4.0)
  })

  it("INT-GOALS-006 — POST creates with default color #1E40AF when color missing", async () => {
    const res = await POST(
      jsonReq({
        name: "Default Color",
        kind: "portfolio_value",
        scope: "combined",
        target: 1_000_000,
        targetYear: 2040,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.color).toBe("#1E40AF")
  })

  it("INT-GOALS-007 — POST trims whitespace from name", async () => {
    const res = await POST(
      jsonReq({
        name: "  Trimmed  ",
        kind: "annual_income",
        scope: "combined",
        target: 10000,
        targetYear: 2028,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe("Trimmed")
  })

  it("INT-GOALS-008 — POST floors targetYear (fractional year truncated)", async () => {
    const res = await POST(
      jsonReq({
        name: "Floored Year",
        kind: "annual_income",
        scope: "combined",
        target: 10000,
        targetYear: 2031.9,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.targetYear).toBe(2031)
  })

  it("INT-GOALS-009 — POST with missing name returns 400", async () => {
    const res = await POST(
      jsonReq({
        kind: "annual_income",
        scope: "combined",
        target: 10000,
        targetYear: 2030,
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("name is required")
  })

  it("INT-GOALS-010 — POST with invalid kind returns 400", async () => {
    const res = await POST(
      jsonReq({
        name: "Bad Kind",
        kind: "not_a_kind",
        scope: "combined",
        target: 10000,
        targetYear: 2030,
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid kind")
  })

  it("INT-GOALS-011 — POST with missing targetYear returns 400", async () => {
    const res = await POST(
      jsonReq({
        name: "No Year",
        kind: "annual_income",
        scope: "combined",
        target: 10000,
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("targetYear is required")
  })

  it("INT-GOALS-012 — POST with target=0 returns 400 (must be positive)", async () => {
    const res = await POST(
      jsonReq({
        name: "Zero Target",
        kind: "annual_income",
        scope: "combined",
        target: 0,
        targetYear: 2030,
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("target must be a positive number")
  })

  it("INT-GOALS-013 — POST with non-finite target returns 400", async () => {
    const res = await POST(
      jsonReq({
        name: "Bad Target",
        kind: "annual_income",
        scope: "combined",
        target: "not-a-number",
        targetYear: 2030,
      })
    )
    expect(res.status).toBe(400)
  })

  it("INT-GOALS-014 — POST scope=portfolio without portfolioId returns 400", async () => {
    const res = await POST(
      jsonReq({
        name: "Bad Scope",
        kind: "portfolio_value",
        scope: "portfolio",
        target: 1_000_000,
        targetYear: 2030,
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("portfolioId is required when scope is 'portfolio'")
  })

  it("INT-GOALS-015 — POST with invalid scope returns 400", async () => {
    const res = await POST(
      jsonReq({
        name: "Bad Scope",
        kind: "annual_income",
        scope: "globe",
        target: 10000,
        targetYear: 2030,
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid scope")
  })

  it("INT-GOALS-016 — POST with out-of-range SWR returns 400", async () => {
    const res = await POST(
      jsonReq({
        name: "Bad SWR",
        kind: "annual_income",
        scope: "combined",
        target: 10000,
        targetYear: 2030,
        swr: 99,
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("swr must be > 0 and ≤ 20")
  })

  it("INT-GOALS-017 — POST dividend_annual kind preserves yieldAssumed override", async () => {
    const res = await POST(
      jsonReq({
        name: "Divs",
        kind: "dividend_annual",
        scope: "combined",
        target: 12_000,
        targetYear: 2035,
        yieldAssumed: 3.5,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.kind).toBe("dividend_annual")
    expect(body.yieldAssumed).toBe(3.5)
    expect(body.swr).toBe(null)
  })

  it("INT-GOALS-018 — POST portfolio_value kind nulls out swr and yieldAssumed", async () => {
    const res = await POST(
      jsonReq({
        name: "First Million",
        kind: "portfolio_value",
        scope: "combined",
        target: 1_000_000,
        targetYear: 2040,
        swr: 4.0,
        yieldAssumed: 3.0,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.kind).toBe("portfolio_value")
    expect(body.swr).toBe(null)
    expect(body.yieldAssumed).toBe(null)
  })
})

describe("PATCH /api/goals/[id]", () => {
  it("INT-GOALS-020 — PATCH updates name only", async () => {
    const g = insertAnnualIncomeGoal("Patch Name Test", 30000, 2040)
    const res = await PATCH(
      jsonReq({ name: "Renamed Goal" }, "PATCH"),
      params(g.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("Renamed Goal")
    expect(body.target).toBe(30000)
    expect(body.targetYear).toBe(2040)
  })

  it("INT-GOALS-021 — PATCH updates target only", async () => {
    const g = insertAnnualIncomeGoal("Patch Target Test", 30000, 2040)
    const res = await PATCH(jsonReq({ target: 48000 }, "PATCH"), params(g.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.target).toBe(48000)
    expect(body).not.toHaveProperty("annualIncome")
  })

  it("INT-GOALS-022 — PATCH updates targetYear only", async () => {
    const g = insertAnnualIncomeGoal("Patch Year Test", 30000, 2040)
    const res = await PATCH(
      jsonReq({ targetYear: 2045 }, "PATCH"),
      params(g.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.targetYear).toBe(2045)
  })

  it("INT-GOALS-023 — PATCH updates color only", async () => {
    const g = insertAnnualIncomeGoal("Patch Color Test", 30000, 2040)
    const res = await PATCH(
      jsonReq({ color: "#FF0000" }, "PATCH"),
      params(g.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.color).toBe("#FF0000")
  })

  it("INT-GOALS-024 — PATCH changing kind from annual_income clears swr", async () => {
    const g = insertAnnualIncomeGoal("Convert", 30000, 2040)
    const res = await PATCH(
      jsonReq({ kind: "portfolio_value" }, "PATCH"),
      params(g.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kind).toBe("portfolio_value")
    expect(body.swr).toBe(null)
  })

  it("INT-GOALS-025 — PATCH with empty body returns 400", async () => {
    const g = insertAnnualIncomeGoal("Patch Empty Test", 30000, 2040)
    const res = await PATCH(jsonReq({}, "PATCH"), params(g.id))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("no changes")
  })

  it("INT-GOALS-026 — PATCH on non-existent id returns 404", async () => {
    const res = await PATCH(jsonReq({ name: "Ghost" }, "PATCH"), params(99999))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("not found")
  })

  it("INT-GOALS-027 — PATCH with non-numeric id returns 400", async () => {
    const res = await PATCH(jsonReq({ name: "Bad" }, "PATCH"), params("abc"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid id")
  })
})

describe("DELETE /api/goals/[id]", () => {
  it("INT-GOALS-030 — DELETE removes goal and returns ok", async () => {
    const g = insertAnnualIncomeGoal("To Delete", 10000, 2030)
    const req = new NextRequest(`http://localhost/api/goals/${g.id}`, {
      method: "DELETE",
    })
    const res = await DELETE(req, params(g.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    const rows = db.select().from(goals).where(eq(goals.id, g.id)).all()
    expect(rows).toHaveLength(0)
  })

  it("INT-GOALS-031 — DELETE on non-existent id returns 200 (silent no-op)", async () => {
    const countBefore = db.select({ c: count() }).from(goals).get()!.c
    const req = new NextRequest("http://localhost/api/goals/99999", {
      method: "DELETE",
    })
    const res = await DELETE(req, params(99999))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    const countAfter = db.select({ c: count() }).from(goals).get()!.c
    expect(countAfter).toBe(countBefore)
  })

  it("INT-GOALS-032 — DELETE with non-numeric id returns 400", async () => {
    const req = new NextRequest("http://localhost/api/goals/bad", {
      method: "DELETE",
    })
    const res = await DELETE(req, params("bad"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid id")
  })
})
