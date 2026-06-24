import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { GET as EXPORT } from "@/app/api/portfolios/[id]/export/route"
import { POST as PREVIEW } from "@/app/api/portfolios/import/preview/route"
import { POST as IMPORT } from "@/app/api/portfolios/import/route"
import { db } from "@/lib/db"
import {
  portfolios,
  entries,
  holdings,
  dividendEvents,
  goals,
} from "@/lib/db/schema"
import { count } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"
import type { TransferPortfolioFile } from "@/lib/transfer/types"

function jsonReq(
  body: unknown,
  url = "http://localhost/api/portfolios/import"
) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) }
}

beforeAll(async () => {
  await ensureSeeded()
})

beforeEach(() => {
  db.delete(dividendEvents).run()
  db.delete(holdings).run()
  db.delete(goals).run()
  db.delete(entries).run()
  db.delete(portfolios).run()
})

function seedPortfolio(name = "Source Portfolio") {
  const p = db
    .insert(portfolios)
    .values({
      name,
      color: "#1E40AF",
      targetMonthlyContribution: 300,
    })
    .returning()
    .get()
  db.insert(entries)
    .values({
      portfolioId: p.id,
      year: 2025,
      month: 1,
      day: 31,
      invested: 300,
      value: 320.5,
      note: "",
    })
    .run()
  const h = db
    .insert(holdings)
    .values({
      portfolioId: p.id,
      name: "Test ETF",
      type: "etf",
      isin: "IE00BK5BQT80",
    })
    .returning()
    .get()
  db.insert(dividendEvents)
    .values({
      portfolioId: p.id,
      holdingId: h.id,
      paidDate: "2025-03-15",
      amount: 10,
      kind: "dividend",
      tax: 2,
      note: "",
    })
    .run()
  return p
}

describe("GET /api/portfolios/[id]/export", () => {
  it("INT-TRANSFER-001 — returns 200 + correct headers", async () => {
    const p = seedPortfolio("Hauptdepot")
    const req = new NextRequest(
      `http://localhost/api/portfolios/${p.id}/export`
    )
    const res = await EXPORT(req, params(p.id))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    const disposition = res.headers.get("Content-Disposition") ?? ""
    expect(disposition).toMatch(
      /^attachment; filename="simvest-portfolio-hauptdepot-\d{4}-\d{2}-\d{2}\.json"$/
    )
    const file = (await res.json()) as TransferPortfolioFile
    expect(file.kind).toBe("simvest.portfolio")
    expect(file.version).toBe(1)
    expect(file.portfolio.name).toBe("Hauptdepot")
    expect(file.entries).toHaveLength(1)
    expect(file.holdings).toHaveLength(1)
    expect(file.incomeEvents).toHaveLength(1)
  })

  it("INT-TRANSFER-002 — 404 on unknown id", async () => {
    const req = new NextRequest("http://localhost/api/portfolios/99999/export")
    const res = await EXPORT(req, params(99999))
    expect(res.status).toBe(404)
  })

  it("INT-TRANSFER-003 — 400 on non-numeric id", async () => {
    const req = new NextRequest("http://localhost/api/portfolios/abc/export")
    const res = await EXPORT(req, params("abc"))
    expect(res.status).toBe(400)
  })
})

describe("POST /api/portfolios/import/preview", () => {
  it("INT-TRANSFER-004 — happy path returns counts and resolvedName", async () => {
    const p = seedPortfolio()
    const exportReq = new NextRequest(
      `http://localhost/api/portfolios/${p.id}/export`
    )
    const exportRes = await EXPORT(exportReq, params(p.id))
    const file = (await exportRes.json()) as TransferPortfolioFile

    const res = await PREVIEW(
      jsonReq(
        { payload: file },
        "http://localhost/api/portfolios/import/preview"
      )
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      preview: {
        resolvedName: string
        collidedWithExistingName: boolean
        counts: Record<string, number>
      }
    }
    expect(body.preview.resolvedName).toBe("Source Portfolio (imported)")
    expect(body.preview.collidedWithExistingName).toBe(true)
    expect(body.preview.counts.entries).toBe(1)
    expect(body.preview.counts.holdings).toBe(1)
    expect(body.preview.counts.dividends).toBe(1)
  })

  it("INT-TRANSFER-005 — 400 on malformed payload", async () => {
    const res = await PREVIEW(
      jsonReq(
        { payload: { kind: "broker.csv" } },
        "http://localhost/api/portfolios/import/preview"
      )
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Not a Simvest portfolio export/)
  })

  it("INT-TRANSFER-006 — 400 when payload key is missing", async () => {
    const res = await PREVIEW(
      jsonReq({}, "http://localhost/api/portfolios/import/preview")
    )
    expect(res.status).toBe(400)
  })
})

describe("POST /api/portfolios/import", () => {
  it("INT-TRANSFER-007 — happy path creates a new portfolio and 201s", async () => {
    const p = seedPortfolio()
    const exportReq = new NextRequest(
      `http://localhost/api/portfolios/${p.id}/export`
    )
    const file = (await (
      await EXPORT(exportReq, params(p.id))
    ).json()) as TransferPortfolioFile

    const res = await IMPORT(
      jsonReq(
        { payload: file, overrideName: "Restored" },
        "http://localhost/api/portfolios/import"
      )
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      portfolio: { id: number; name: string; entries: unknown[] }
      summary: { entriesCreated: number; holdingsCreated: number }
    }
    expect(body.portfolio.name).toBe("Restored")
    expect(body.portfolio.entries).toHaveLength(1)
    expect(body.summary.entriesCreated).toBe(1)
    expect(body.summary.holdingsCreated).toBe(1)

    // DB now has two portfolios — original + restored.
    const counts = db.select({ c: count() }).from(portfolios).get()
    expect(counts?.c).toBe(2)
  })

  it("INT-TRANSFER-008 — nulls sourceBroker / sourceTransactionId on every income event", async () => {
    // Hand-roll a file that explicitly carries no source info — the wire
    // format already drops it; the restore must keep it null in the DB.
    const file: TransferPortfolioFile = {
      version: 1,
      kind: "simvest.portfolio",
      exportedAt: "2026-01-01T00:00:00Z",
      sourceAppVersion: "0.0.1",
      portfolio: {
        name: "Provenance Test",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
        startingValue: 0,
        startingDate: null,
        createdAt: 1700000000000,
      },
      entries: [],
      holdings: [
        {
          holdingRef: 0,
          name: "H1",
          type: "etf",
          isin: null,
          createdAt: 1700000000000,
        },
      ],
      incomeEvents: [
        {
          holdingRef: 0,
          paidDate: "2025-03-15",
          amount: 10,
          kind: "dividend",
          tax: 0,
          note: "",
          createdAt: 1710000000000,
        },
      ],
      goals: [],
    }
    const res = await IMPORT(
      jsonReq({ payload: file }, "http://localhost/api/portfolios/import")
    )
    expect(res.status).toBe(201)
    const events = db.select().from(dividendEvents).all()
    expect(events).toHaveLength(1)
    expect(events[0].sourceBroker).toBe(null)
    expect(events[0].sourceTransactionId).toBe(null)
  })

  it("INT-TRANSFER-009 — auto-suffixes name on collision", async () => {
    const p = seedPortfolio("Collision Test")
    const exportReq = new NextRequest(
      `http://localhost/api/portfolios/${p.id}/export`
    )
    const file = (await (
      await EXPORT(exportReq, params(p.id))
    ).json()) as TransferPortfolioFile

    // Import once → first collision → " (imported)"
    const res1 = await IMPORT(
      jsonReq({ payload: file }, "http://localhost/api/portfolios/import")
    )
    expect(res1.status).toBe(201)
    const body1 = (await res1.json()) as { portfolio: { name: string } }
    expect(body1.portfolio.name).toBe("Collision Test (imported)")

    // Import twice → second collision → " (imported 2)"
    const res2 = await IMPORT(
      jsonReq({ payload: file }, "http://localhost/api/portfolios/import")
    )
    expect(res2.status).toBe(201)
    const body2 = (await res2.json()) as { portfolio: { name: string } }
    expect(body2.portfolio.name).toBe("Collision Test (imported 2)")
  })

  it("INT-TRANSFER-010 — overrideName: empty string is rejected as 400", async () => {
    const p = seedPortfolio()
    const file = (await (
      await EXPORT(
        new NextRequest(`http://localhost/api/portfolios/${p.id}/export`),
        params(p.id)
      )
    ).json()) as TransferPortfolioFile

    const res = await IMPORT(
      jsonReq(
        { payload: file, overrideName: "   " },
        "http://localhost/api/portfolios/import"
      )
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/empty/i)
  })

  it("INT-TRANSFER-011 — preview surfaces a combined-goals warning when the file's meta carries the count", async () => {
    // Build a synthetic file with meta.combinedGoalsExcluded = 2.
    const file: TransferPortfolioFile = {
      version: 1,
      kind: "simvest.portfolio",
      exportedAt: "2026-01-01T00:00:00Z",
      sourceAppVersion: "0.0.1",
      portfolio: {
        name: "WithMeta",
        color: "#1E40AF",
        targetMonthlyContribution: 0,
        startingValue: 0,
        startingDate: null,
        createdAt: 1700000000000,
      },
      entries: [],
      holdings: [],
      incomeEvents: [],
      goals: [],
      meta: { combinedGoalsExcluded: 2 },
    }
    const res = await PREVIEW(
      jsonReq(
        { payload: file },
        "http://localhost/api/portfolios/import/preview"
      )
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { preview: { warnings: string[] } }
    expect(body.preview.warnings).toHaveLength(1)
    expect(body.preview.warnings[0]).toMatch(/2 combined goals were excluded/)
  })
})
