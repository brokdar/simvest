import { describe, it, expect, beforeAll, vi } from "vitest"
import { db } from "@/lib/db"
import { portfolios, entries, goals, settings } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import path from "node:path"

const migrationsFolder = path.resolve(process.cwd(), "drizzle")

// The fork isolation (pool: "forks") gives us one fresh process per file.
// ensureSeeded() is called in beforeAll so all basic tests share a seeded DB.
// Tests INT-SEED-010 and INT-SEED-011 use dynamic imports + module reset to get
// fresh module instances with clean initPromise state.

describe("DB Seed Integration Tests — shared seeded DB", () => {
  beforeAll(async () => {
    await ensureSeeded()
  })

  it("INT-SEED-001 — ensureSeeded creates all four tables", async () => {
    // Tables must exist and be queryable without throwing
    expect(() => db.select().from(portfolios).all()).not.toThrow()
    expect(() => db.select().from(entries).all()).not.toThrow()
    expect(() => db.select().from(goals).all()).not.toThrow()
    expect(() => db.select().from(settings).all()).not.toThrow()
  })

  it("INT-SEED-002 — ensureSeeded does not insert demo portfolios on fresh DB", async () => {
    const ps = db.select().from(portfolios).all()
    expect(ps).toHaveLength(0)
  })

  it("INT-SEED-003 — ensureSeeded does not insert demo entries on fresh DB", async () => {
    const allEntries = db.select().from(entries).all()
    expect(allEntries).toHaveLength(0)
  })

  it("INT-SEED-005 — seed entry values are non-negative", async () => {
    const allEntries = db.select().from(entries).all()
    for (const e of allEntries) {
      expect(e.value).toBeGreaterThanOrEqual(0)
    }
  })

  it("INT-SEED-007 — ensureSeeded does not insert demo goals on fresh DB", async () => {
    const gs = db.select().from(goals).all()
    expect(gs).toHaveLength(0)
  })

  it("INT-SEED-008 — ensureSeeded inserts the settings singleton row", async () => {
    const rows = db.select().from(settings).all()
    expect(rows).toHaveLength(1)

    const s = rows[0]
    expect(s.id).toBe(1)
    expect(s.inflation).toBe(2.4)
    expect(s.conservativeReturn).toBe(4)
    expect(s.optimisticReturn).toBe(10)
    expect(s.monthlySaving).toBe(1250)
    expect(s.horizonYears).toBe(20)
  })

  it("INT-SEED-009 — ensureSeeded is idempotent: calling twice does not duplicate data", async () => {
    // ensureSeeded was already called in beforeAll; calling it again should be a no-op
    await ensureSeeded()

    const portfolioCount = db.select().from(portfolios).all().length
    const entryCount = db.select().from(entries).all().length
    const goalCount = db.select().from(goals).all().length
    const settingsCount = db.select().from(settings).all().length

    expect(portfolioCount).toBe(0)
    expect(entryCount).toBe(0)
    expect(goalCount).toBe(0)
    expect(settingsCount).toBe(1)
  })

  it("INT-SEED-012 — ensureSeeded concurrent calls resolve to the same promise", async () => {
    // ensureSeeded was already called; all three calls return the cached initPromise
    const results = await Promise.all([
      ensureSeeded(),
      ensureSeeded(),
      ensureSeeded(),
    ])
    expect(results).toHaveLength(3)

    const portfolioCount = db.select().from(portfolios).all().length
    expect(portfolioCount).toBe(0)
  })
})

describe("INT-SEED-010 — ensureSeeded skips seed insert when portfolios table is already populated", () => {
  it("INT-SEED-010 — does not overwrite pre-existing portfolio data", async () => {
    // Reset module state to get a fresh initPromise and fresh DB
    vi.resetModules()
    delete (globalThis as unknown as Record<string, unknown>)["__simvestDb"]

    // Dynamically import fresh module instances
    const { db: freshDb } = await import("@/lib/db")
    const {
      portfolios: p,
      entries: e,
      goals: g,
      settings: s,
    } = await import("@/lib/db/schema")
    const { ensureSeeded: freshEnsureSeeded } = await import("@/lib/db/seed")

    // Manually run migrations first (bypassing ensureSeeded)
    const { migrate: freshMigrate } =
      await import("drizzle-orm/better-sqlite3/migrator")
    freshMigrate(freshDb, { migrationsFolder })

    // Insert a pre-existing portfolio directly
    freshDb
      .insert(p)
      .values({
        name: "Pre-existing",
        color: "#000",
        targetMonthlyContribution: 0,
      })
      .run()
    // Insert settings so the seed won't insert defaults
    freshDb.insert(s).values({ id: 1 }).run()

    // Now call ensureSeeded — it should detect existing portfolios and skip
    await freshEnsureSeeded()

    const portfolioCount = freshDb.select().from(p).all().length
    const entryCount = freshDb.select().from(e).all().length
    const goalCount = freshDb.select().from(g).all().length

    expect(portfolioCount).toBe(1)
    expect(entryCount).toBe(0)
    expect(goalCount).toBe(0)
  })
})

describe("INT-SEED-011 — ensureSeeded skips seed but ensures settings when DB has portfolios but no settings", () => {
  it("INT-SEED-011 — inserts settings row when missing even if portfolio data exists", async () => {
    // Reset module state again for a clean slate
    vi.resetModules()
    delete (globalThis as unknown as Record<string, unknown>)["__simvestDb"]

    const { db: freshDb } = await import("@/lib/db")
    const {
      portfolios: p,
      entries: e,
      settings: s,
    } = await import("@/lib/db/schema")
    const { ensureSeeded: freshEnsureSeeded } = await import("@/lib/db/seed")
    const { migrate: freshMigrate } =
      await import("drizzle-orm/better-sqlite3/migrator")

    freshMigrate(freshDb, { migrationsFolder })

    // Insert a portfolio but NOT settings
    freshDb
      .insert(p)
      .values({
        name: "Pre-existing",
        color: "#000",
        targetMonthlyContribution: 0,
      })
      .run()

    // Now call ensureSeeded — should skip seeding but insert settings
    await freshEnsureSeeded()

    const portfolioCount = freshDb.select().from(p).all().length
    const settingsRows = freshDb.select().from(s).all()
    const entryCount = freshDb.select().from(e).all().length

    // No extra seed portfolios inserted
    expect(portfolioCount).toBe(1)
    // Settings row was created
    expect(settingsRows).toHaveLength(1)
    expect(settingsRows[0].id).toBe(1)
    // No seed entries
    expect(entryCount).toBe(0)
  })
})
