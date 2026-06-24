import { describe, it, expect, beforeAll } from "vitest"
import { NextRequest } from "next/server"
import { GET, PATCH } from "@/app/api/settings/route"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ensureSeeded } from "@/lib/db/seed"

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  await ensureSeeded()
})

describe("GET /api/settings", () => {
  it("INT-SETTINGS-001 — GET returns the singleton settings row with all defaults", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("id")
    expect(body).toHaveProperty("inflation")
    expect(body).toHaveProperty("conservativeReturn")
    expect(body).toHaveProperty("optimisticReturn")
    expect(body).toHaveProperty("monthlySaving")
    expect(body).toHaveProperty("horizonYears")
    expect(body.id).toBe(1)
    expect(body.inflation).toBe(2.4)
    expect(body.conservativeReturn).toBe(4)
    expect(body.optimisticReturn).toBe(10)
    expect(body.monthlySaving).toBe(1250)
    expect(body.horizonYears).toBe(20)
    expect(body.defaultEntryDay).toBe("last")
  })

  it("INT-SETTINGS-002 — GET auto-creates settings row when table is empty", async () => {
    db.delete(settings).run()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(1)
    expect(body.inflation).toBe(2.4)
    expect(body.conservativeReturn).toBe(4)
    expect(body.optimisticReturn).toBe(10)
    expect(body.monthlySaving).toBe(1250)
    expect(body.horizonYears).toBe(20)
    const rows = db.select().from(settings).all()
    expect(rows).toHaveLength(1)
  })

  it("INT-SETTINGS-003 — GET calling twice returns same data, still one row", async () => {
    const res1 = await GET()
    const body1 = await res1.json()
    const res2 = await GET()
    const body2 = await res2.json()
    expect(body1.id).toBe(1)
    expect(body2.id).toBe(1)
    const rows = db.select().from(settings).all()
    expect(rows).toHaveLength(1)
  })
})

describe("PATCH /api/settings", () => {
  it("INT-SETTINGS-004 — PATCH updates inflation", async () => {
    const res = await PATCH(patchReq({ inflation: 3.5 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inflation).toBe(3.5)
    // Other fields retain defaults
    expect(body.monthlySaving).toBe(1250)
    expect(body.horizonYears).toBe(20)
    const row = db.select().from(settings).where(eq(settings.id, 1)).get()
    expect(row?.inflation).toBe(3.5)
    // Reset
    db.update(settings).set({ inflation: 2.4 }).where(eq(settings.id, 1)).run()
  })

  it("INT-SETTINGS-005 — PATCH updates conservativeReturn", async () => {
    const res = await PATCH(patchReq({ conservativeReturn: 5.5 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conservativeReturn).toBe(5.5)
    expect(body.inflation).toBe(2.4)
    db.update(settings)
      .set({ conservativeReturn: 4.0 })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-006 — PATCH updates optimisticReturn", async () => {
    const res = await PATCH(patchReq({ optimisticReturn: 12 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.optimisticReturn).toBe(12)
    db.update(settings)
      .set({ optimisticReturn: 10 })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-007 — PATCH updates monthlySaving", async () => {
    const res = await PATCH(patchReq({ monthlySaving: 2000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.monthlySaving).toBe(2000)
    db.update(settings)
      .set({ monthlySaving: 1250 })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-008 — PATCH updates horizonYears", async () => {
    const res = await PATCH(patchReq({ horizonYears: 30 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.horizonYears).toBe(30)
    db.update(settings)
      .set({ horizonYears: 20 })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-009 — PATCH updates multiple fields at once", async () => {
    const res = await PATCH(
      patchReq({ inflation: 3.0, monthlySaving: 1500, horizonYears: 25 })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inflation).toBe(3.0)
    expect(body.monthlySaving).toBe(1500)
    expect(body.horizonYears).toBe(25)
    expect(body.conservativeReturn).toBe(4)
    expect(body.optimisticReturn).toBe(10)
    // Reset
    db.update(settings)
      .set({ inflation: 2.4, monthlySaving: 1250, horizonYears: 20 })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-010 — PATCH with empty body returns 400", async () => {
    const rowBefore = db.select().from(settings).where(eq(settings.id, 1)).get()
    const res = await PATCH(patchReq({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("no changes")
    const rowAfter = db.select().from(settings).where(eq(settings.id, 1)).get()
    expect(rowAfter?.inflation).toBe(rowBefore?.inflation)
  })

  it("INT-SETTINGS-011 — PATCH with only unknown fields returns 400", async () => {
    const rowBefore = db.select().from(settings).where(eq(settings.id, 1)).get()
    const res = await PATCH(
      patchReq({ unknownSetting: 42, anotherField: "ignored" })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("no changes")
    const rowAfter = db.select().from(settings).where(eq(settings.id, 1)).get()
    expect(rowAfter?.inflation).toBe(rowBefore?.inflation)
  })

  it("INT-SETTINGS-012 — PATCH with mix of valid and unknown fields applies only valid fields", async () => {
    const res = await PATCH(patchReq({ inflation: 2.8, badField: 999 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inflation).toBe(2.8)
    expect(body).not.toHaveProperty("badField")
    db.update(settings).set({ inflation: 2.4 }).where(eq(settings.id, 1)).run()
  })

  it("INT-SETTINGS-013 — PATCH is partial: unpatched fields retain previous values", async () => {
    // First patch inflation
    await PATCH(patchReq({ inflation: 3.5 }))
    // Second patch monthlySaving
    const res2 = await PATCH(patchReq({ monthlySaving: 2000 }))
    const body2 = await res2.json()
    expect(body2.inflation).toBe(3.5) // preserved from first patch
    expect(body2.monthlySaving).toBe(2000)
    // Reset
    db.update(settings)
      .set({ inflation: 2.4, monthlySaving: 1250 })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-014 — PATCH: settings row always has id=1 after update", async () => {
    const res = await PATCH(patchReq({ horizonYears: 15 }))
    const body = await res.json()
    expect(body.id).toBe(1)
    const rows = db.select().from(settings).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
    db.update(settings)
      .set({ horizonYears: 20 })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-015 — PATCH with null for a numeric field returns 400 with field-specific error", async () => {
    // The validator (`asFiniteNumber`) rejects null instead of letting it slip
    // through to the DB.
    const res = await PATCH(patchReq({ inflation: null }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/inflation/)
  })

  it("PATCH with inflation: undefined (serialised as absent) — key is missing, no change for that field", async () => {
    // JSON.stringify({ inflation: undefined }) → "{}" — treated as empty body → 400
    const res = await PATCH(patchReq({ inflation: undefined }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("no changes")
  })

  it("INT-SETTINGS-016 — PATCH defaultEntryDay='first' persists", async () => {
    const res = await PATCH(patchReq({ defaultEntryDay: "first" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.defaultEntryDay).toBe("first")
    db.update(settings)
      .set({ defaultEntryDay: "last" })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-017 — PATCH defaultEntryDay='last' persists", async () => {
    db.update(settings)
      .set({ defaultEntryDay: "first" })
      .where(eq(settings.id, 1))
      .run()
    const res = await PATCH(patchReq({ defaultEntryDay: "last" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.defaultEntryDay).toBe("last")
  })

  it("INT-SETTINGS-018 — PATCH defaultEntryDay numeric string persists", async () => {
    const res = await PATCH(patchReq({ defaultEntryDay: "15" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.defaultEntryDay).toBe("15")
    db.update(settings)
      .set({ defaultEntryDay: "last" })
      .where(eq(settings.id, 1))
      .run()
  })

  it("INT-SETTINGS-019 — PATCH rejects out-of-range numeric defaultEntryDay", async () => {
    const res = await PATCH(patchReq({ defaultEntryDay: "32" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/defaultEntryDay/)
  })

  it("INT-SETTINGS-020 — PATCH rejects non-integer numeric string defaultEntryDay", async () => {
    const res = await PATCH(patchReq({ defaultEntryDay: "15.5" }))
    expect(res.status).toBe(400)
  })

  it("INT-SETTINGS-021 — PATCH rejects unknown defaultEntryDay token", async () => {
    const res = await PATCH(patchReq({ defaultEntryDay: "middle" }))
    expect(res.status).toBe(400)
  })

  it("INT-SETTINGS-022 — PATCH rejects defaultEntryDay='0'", async () => {
    const res = await PATCH(patchReq({ defaultEntryDay: "0" }))
    expect(res.status).toBe(400)
  })

  it("INT-SETTINGS-023 — GET exposes locale field (defaults to null)", async () => {
    db.update(settings).set({ locale: null }).where(eq(settings.id, 1)).run()
    const res = await GET()
    const body = await res.json()
    expect(body).toHaveProperty("locale")
    expect(body.locale).toBeNull()
  })

  it("INT-SETTINGS-024 — PATCH persists a valid BCP-47 locale and canonicalizes it", async () => {
    // Non-canonical input — Intl.getCanonicalLocales upgrades to the
    // canonical region-cased form. Both `EN-us` and `en-US` should round-trip
    // to `en-US`.
    const res = await PATCH(patchReq({ locale: "EN-us" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.locale).toBe("en-US")
    db.update(settings).set({ locale: null }).where(eq(settings.id, 1)).run()
  })

  it("INT-SETTINGS-025 — PATCH accepts null (clears override → auto)", async () => {
    db.update(settings).set({ locale: "de-DE" }).where(eq(settings.id, 1)).run()
    const res = await PATCH(patchReq({ locale: null }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.locale).toBeNull()
  })

  it("INT-SETTINGS-026 — PATCH rejects an invalid BCP-47 locale", async () => {
    const res = await PATCH(patchReq({ locale: "not a locale!" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/locale/i)
  })

  it("INT-SETTINGS-027 — PATCH rejects syntactically-valid but unsupported tags", async () => {
    // `qqq-Latn` is well-formed BCP-47 (passes Intl.getCanonicalLocales)
    // but Intl.NumberFormat falls back to "en-US" for it. The route's
    // resolved-options sanity check should reject this rather than store
    // a setting that silently does nothing.
    const res = await PATCH(patchReq({ locale: "qqq-Latn" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not supported|locale/i)
  })

  it("INT-SETTINGS-028 — PATCH accepts a regional locale like en-GB", async () => {
    const res = await PATCH(patchReq({ locale: "en-GB" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.locale).toBe("en-GB")
    db.update(settings).set({ locale: null }).where(eq(settings.id, 1)).run()
  })
})
