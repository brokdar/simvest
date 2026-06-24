import { describe, it, expect } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import fs from "node:fs"
import path from "node:path"
import * as schema from "@/lib/db/schema"

// Each test creates a fresh in-memory DB to avoid cross-test contamination
function freshDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

const migrationsFolder = path.resolve(process.cwd(), "drizzle")

// Known hashes from the migration files (discovered by running migrate() and inspecting __drizzle_migrations)
const HASH_0000 =
  "76864105bfa293c58865c295ff2025d50af36fc59ca99e24d80809fbb2fdf1bc"
const HASH_0001 =
  "9e45bf64eb3f1091f8eb71dea2642e8855f0d60dd8cff5b8728b3cef2823ea64"
const HASH_0002 =
  "a81df2bd9055d4ce77aa677c669a15073f60fa010e680145fedc089a247c0681"
const HASH_0003 =
  "13feeaba9b9cab43628031cb987b571a2fbde9923522b3bda4ac44a6fc7abb08"
const HASH_0004 =
  "d70161d60c6072890230c25b42c2265af457421d7e644a4203cbf8ba88aa9576"
const HASH_0005 =
  "4e5f143bfbbb4699034a54b256f28e7b84801656859352cbbedcf0474d2acff2"
const HASH_0006 =
  "0022a9bb793b53715ff5a4b349ec2a5fd71cde0e9357879f3706ba7cf99d62ff"
const HASH_0007 =
  "b901def1219ca9343d38263f0527d76f9e72d37d408a4d8da8a390ed07e77958"
const HASH_0008 =
  "86b41141e947871f7a513c6409425869ad4a315a642eaf49a1d63c59b92b1924"
const HASH_0009 =
  "7202cd5407c8014b7aaf791ef0bd5ca57bc91950a5d5bae3bd5377992f1d9446"
const HASH_0010 =
  "1600895fb6ca84e713de51ca32a8b751c5e847c5e073d0e7935ff479645aa12d"

describe("DB Migrations Integration Tests", () => {
  describe("INT-MIGRATIONS-001 — migrate() applies both migrations without throwing", () => {
    it("INT-MIGRATIONS-001 — migrate() does not throw on a fresh DB", () => {
      const { db, sqlite } = freshDb()
      expect(() => migrate(db, { migrationsFolder })).not.toThrow()
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-002 — __drizzle_migrations table exists after migration", () => {
    it("INT-MIGRATIONS-002 — __drizzle_migrations table is present in sqlite_master", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const row = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
        )
        .get() as { name: string } | undefined
      expect(row).toBeDefined()
      expect(row?.name).toBe("__drizzle_migrations")
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-003 — __drizzle_migrations contains exactly eleven entries", () => {
    it("INT-MIGRATIONS-003 — exactly eleven migration rows recorded", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const row = sqlite
        .prepare("SELECT COUNT(*) as c FROM __drizzle_migrations")
        .get() as { c: number }
      expect(row.c).toBe(11)
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-004 — __drizzle_migrations entries match expected hashes", () => {
    it("INT-MIGRATIONS-004 — migration hashes and created_at are correct", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const rows = sqlite
        .prepare("SELECT * FROM __drizzle_migrations ORDER BY created_at")
        .all() as Array<{ hash: string; created_at: number }>
      expect(rows).toHaveLength(11)
      expect(rows[0].hash).toBe(HASH_0000)
      expect(rows[1].hash).toBe(HASH_0001)
      expect(rows[2].hash).toBe(HASH_0002)
      expect(rows[3].hash).toBe(HASH_0003)
      expect(rows[4].hash).toBe(HASH_0004)
      expect(rows[5].hash).toBe(HASH_0005)
      expect(rows[6].hash).toBe(HASH_0006)
      expect(rows[7].hash).toBe(HASH_0007)
      expect(rows[8].hash).toBe(HASH_0008)
      expect(rows[9].hash).toBe(HASH_0009)
      expect(rows[10].hash).toBe(HASH_0010)
      for (const r of rows) expect(r.created_at).toBeTruthy()
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-005 — portfolios table exists with correct columns", () => {
    it("INT-MIGRATIONS-005 — portfolios table has expected columns from 0000_init", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const cols = sqlite
        .prepare("PRAGMA table_info(portfolios)")
        .all() as Array<{
        cid: number
        name: string
        type: string
        notnull: number
        dflt_value: string | null
        pk: number
      }>

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]))

      expect(byName["id"]).toBeDefined()
      expect(byName["id"].type).toBe("INTEGER")
      expect(byName["id"].pk).toBe(1)
      expect(byName["id"].notnull).toBe(1)

      expect(byName["name"]).toBeDefined()
      expect(byName["name"].type).toBe("TEXT")
      expect(byName["name"].notnull).toBe(1)

      expect(byName["color"]).toBeDefined()
      expect(byName["color"].type).toBe("TEXT")
      expect(byName["color"].notnull).toBe(1)
      expect(byName["color"].dflt_value).toBe("'#1E40AF'")

      expect(byName["created_at"]).toBeDefined()
      expect(byName["created_at"].type).toBe("INTEGER")
      expect(byName["created_at"].notnull).toBe(1)
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-006 — target_monthly_contribution column exists on portfolios", () => {
    it("INT-MIGRATIONS-006 — target_monthly_contribution added by 0001 migration", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const cols = sqlite
        .prepare("PRAGMA table_info(portfolios)")
        .all() as Array<{
        name: string
        type: string
        notnull: number
        dflt_value: string | null
      }>

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]))
      const tmc = byName["target_monthly_contribution"]

      expect(tmc).toBeDefined()
      expect(tmc.type).toBe("REAL")
      expect(tmc.notnull).toBe(1)
      expect(tmc.dflt_value).toBe("0")
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-007 — entries table exists with correct columns", () => {
    it("INT-MIGRATIONS-007 — entries table has all expected columns with correct types", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const cols = sqlite.prepare("PRAGMA table_info(entries)").all() as Array<{
        name: string
        type: string
        notnull: number
        dflt_value: string | null
      }>

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]))

      expect(byName["id"]).toBeDefined()
      expect(byName["portfolio_id"]).toBeDefined()
      expect(byName["portfolio_id"].type).toBe("INTEGER")
      expect(byName["portfolio_id"].notnull).toBe(1)

      expect(byName["year"]).toBeDefined()
      expect(byName["month"]).toBeDefined()

      expect(byName["invested"]).toBeDefined()
      expect(byName["invested"].type).toBe("REAL")
      expect(byName["invested"].notnull).toBe(1)
      expect(byName["invested"].dflt_value).toBe("0")

      expect(byName["value"]).toBeDefined()
      expect(byName["value"].type).toBe("REAL")
      // Migration 0009 made value nullable — unset means "user hasn't
      // recorded a month-end portfolio value yet".
      expect(byName["value"].notnull).toBe(0)
      expect(byName["value"].dflt_value).toBeNull()

      // Migration 0004 dropped `dividends` from entries.
      expect(byName["dividends"]).toBeUndefined()

      expect(byName["note"]).toBeDefined()
      expect(byName["note"].type).toBe("TEXT")
      expect(byName["note"].notnull).toBe(1)
      expect(byName["note"].dflt_value).toBe("''")

      expect(byName["day"]).toBeDefined()
      expect(byName["day"].type).toBe("INTEGER")
      expect(byName["day"].notnull).toBe(1)
      expect(byName["day"].dflt_value).toBe("0")
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-008 — entries unique index exists", () => {
    it("INT-MIGRATIONS-008 — entries_portfolio_year_month_idx is present and unique", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const indexes = sqlite
        .prepare("PRAGMA index_list(entries)")
        .all() as Array<{ name: string; unique: number }>

      const idx = indexes.find(
        (i) => i.name === "entries_portfolio_year_month_idx"
      )
      expect(idx).toBeDefined()
      expect(idx?.unique).toBe(1)
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-009 — entries unique index covers (portfolio_id, year, month)", () => {
    it("INT-MIGRATIONS-009 — index columns are portfolio_id, year, month in that order", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const idxCols = sqlite
        .prepare("PRAGMA index_info(entries_portfolio_year_month_idx)")
        .all() as Array<{ seqno: number; cid: number; name: string }>

      expect(idxCols).toHaveLength(3)
      expect(idxCols[0].name).toBe("portfolio_id")
      expect(idxCols[1].name).toBe("year")
      expect(idxCols[2].name).toBe("month")
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-010 — entries foreign key references portfolios with cascade delete", () => {
    it("INT-MIGRATIONS-010 — FK from portfolio_id to portfolios.id has ON DELETE CASCADE", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const fks = sqlite
        .prepare("PRAGMA foreign_key_list(entries)")
        .all() as Array<{
        id: number
        seq: number
        table: string
        from: string
        to: string
        on_update: string
        on_delete: string
      }>

      expect(fks).toHaveLength(1)
      expect(fks[0].from).toBe("portfolio_id")
      expect(fks[0].table).toBe("portfolios")
      expect(fks[0].to).toBe("id")
      expect(fks[0].on_delete).toBe("CASCADE")
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-011 — goals table exists with correct columns", () => {
    it("INT-MIGRATIONS-011 — goals table has expected columns", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const cols = sqlite.prepare("PRAGMA table_info(goals)").all() as Array<{
        name: string
        type: string
        notnull: number
        dflt_value: string | null
      }>

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]))

      expect(byName["id"]).toBeDefined()
      expect(byName["name"]).toBeDefined()

      // 0007 dropped annual_income; `target` is now the source of truth.
      expect(byName["annual_income"]).toBeUndefined()
      expect(byName["target"]).toBeDefined()
      expect(byName["target"].type).toBe("REAL")

      expect(byName["target_year"]).toBeDefined()
      expect(byName["target_year"].type).toBe("INTEGER")
      expect(byName["target_year"].notnull).toBe(1)

      expect(byName["color"]).toBeDefined()
      expect(byName["color"].dflt_value).toBe("'#1E40AF'")

      expect(byName["created_at"]).toBeDefined()
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-012 — settings table exists with correct columns and defaults", () => {
    it("INT-MIGRATIONS-012 — settings table has all columns with correct types and defaults", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const cols = sqlite
        .prepare("PRAGMA table_info(settings)")
        .all() as Array<{
        name: string
        type: string
        notnull: number
        dflt_value: string | null
        pk: number
      }>

      const byName = Object.fromEntries(cols.map((c) => [c.name, c]))

      expect(byName["id"]).toBeDefined()
      expect(byName["id"].type).toBe("INTEGER")
      expect(byName["id"].pk).toBe(1)

      expect(byName["inflation"]).toBeDefined()
      expect(byName["inflation"].type).toBe("REAL")
      expect(byName["inflation"].dflt_value).toBe("2.4")
      expect(byName["inflation"].notnull).toBe(1)

      expect(byName["conservative_return"]).toBeDefined()
      expect(byName["conservative_return"].type).toBe("REAL")
      expect(byName["conservative_return"].dflt_value).toBe("4")
      expect(byName["conservative_return"].notnull).toBe(1)

      expect(byName["optimistic_return"]).toBeDefined()
      expect(byName["optimistic_return"].type).toBe("REAL")
      expect(byName["optimistic_return"].dflt_value).toBe("10")
      expect(byName["optimistic_return"].notnull).toBe(1)

      expect(byName["monthly_saving"]).toBeDefined()
      expect(byName["monthly_saving"].type).toBe("REAL")
      expect(byName["monthly_saving"].dflt_value).toBe("1250")
      expect(byName["monthly_saving"].notnull).toBe(1)

      expect(byName["horizon_years"]).toBeDefined()
      expect(byName["horizon_years"].type).toBe("INTEGER")
      expect(byName["horizon_years"].dflt_value).toBe("20")
      expect(byName["horizon_years"].notnull).toBe(1)

      expect(byName["default_entry_day"]).toBeDefined()
      expect(byName["default_entry_day"].type).toBe("TEXT")
      expect(byName["default_entry_day"].dflt_value).toBe("'last'")
      expect(byName["default_entry_day"].notnull).toBe(1)
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-013 — migrate() is idempotent: calling twice does not fail", () => {
    it("INT-MIGRATIONS-013 — second migrate() call does not throw or duplicate rows", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      expect(() => migrate(db, { migrationsFolder })).not.toThrow()
      const row = sqlite
        .prepare("SELECT COUNT(*) as c FROM __drizzle_migrations")
        .get() as { c: number }
      expect(row.c).toBe(11)
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-016 — 0010 adds nullable `locale` column to settings", () => {
    it("INT-MIGRATIONS-016 — settings.locale exists, is TEXT, and is nullable with no default", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const cols = sqlite
        .prepare("PRAGMA table_info(settings)")
        .all() as Array<{
        name: string
        type: string
        notnull: number
        dflt_value: string | null
      }>
      const byName = Object.fromEntries(cols.map((c) => [c.name, c]))
      expect(byName["locale"]).toBeDefined()
      expect(byName["locale"].type).toBe("TEXT")
      expect(byName["locale"].notnull).toBe(0)
      expect(byName["locale"].dflt_value).toBeNull()
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-015 — 0003 backfills entries.day to the last day of their calendar month", () => {
    it("INT-MIGRATIONS-015 — last-day-of-month backfill respects 30/31-day months and leap years", () => {
      // Build a DB that has only 0000–0002 applied, with seed data, then apply 0003.
      const { sqlite } = freshDb()
      const sqlPath = (file: string) =>
        path.resolve(migrationsFolder, `${file}.sql`)
      // Apply migrations 0000, 0001, 0002 by hand to control state.
      for (const tag of [
        "0000_init",
        "0001_add_target_monthly_contribution",
        "0002_add_holdings_dividends",
      ]) {
        const sql = fs.readFileSync(sqlPath(tag), "utf8")
        for (const statement of sql.split("--> statement-breakpoint")) {
          const trimmed = statement.trim()
          if (trimmed) sqlite.exec(trimmed)
        }
      }

      sqlite
        .prepare(
          "INSERT INTO portfolios (name, color, target_monthly_contribution, created_at) VALUES ('P', '#000', 0, 0)"
        )
        .run()
      const pid = (
        sqlite.prepare("SELECT id FROM portfolios").get() as { id: number }
      ).id
      const insert = sqlite.prepare(
        "INSERT INTO entries (portfolio_id, year, month, invested, value, dividends, note) VALUES (?, ?, ?, 0, 0, 0, '')"
      )
      const cases: Array<[number, number, number]> = [
        [2023, 1, 31], // Jan → 31
        [2023, 2, 28], // Feb non-leap → 28
        [2024, 2, 29], // Feb 2024 leap → 29
        [2000, 2, 29], // Feb 2000 (divisible by 400) → 29
        [2100, 2, 28], // Feb 2100 (div by 100 but not 400) → 28
        [2023, 4, 30], // Apr → 30
        [2023, 6, 30], // Jun → 30
        [2023, 9, 30], // Sep → 30
        [2023, 11, 30], // Nov → 30
        [2023, 12, 31], // Dec → 31
      ]
      for (const [y, m] of cases) insert.run(pid, y, m)

      // Apply migration 0003.
      const sql0003 = fs.readFileSync(
        sqlPath("0003_entry_day_and_default"),
        "utf8"
      )
      for (const statement of sql0003.split("--> statement-breakpoint")) {
        const trimmed = statement.trim()
        if (trimmed) sqlite.exec(trimmed)
      }

      const rows = sqlite
        .prepare("SELECT year, month, day FROM entries ORDER BY year, month")
        .all() as Array<{ year: number; month: number; day: number }>
      const byKey = Object.fromEntries(
        rows.map((r) => [`${r.year}-${r.month}`, r.day])
      )
      for (const [y, m, expected] of cases) {
        expect(byKey[`${y}-${m}`]).toBe(expected)
      }
      sqlite.close()
    })
  })

  describe("INT-MIGRATIONS-014 — all tables are registered in sqlite_master", () => {
    it("INT-MIGRATIONS-014 — sqlite_master contains entries, goals, portfolios, settings, holdings, dividend_events", () => {
      const { db, sqlite } = freshDb()
      migrate(db, { migrationsFolder })
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as Array<{ name: string }>

      const tableNames = tables.map((t) => t.name)
      expect(tableNames).toContain("entries")
      expect(tableNames).toContain("goals")
      expect(tableNames).toContain("portfolios")
      expect(tableNames).toContain("settings")
      expect(tableNames).toContain("holdings")
      expect(tableNames).toContain("dividend_events")
      expect(tableNames).toContain("__drizzle_migrations")
      sqlite.close()
    })
  })
})
