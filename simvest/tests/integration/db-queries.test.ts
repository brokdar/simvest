import { describe, it, expect, beforeAll } from "vitest"
import { db } from "@/lib/db"
import { portfolios, entries, goals, settings } from "@/lib/db/schema"
import {
  getPortfolios,
  getGoals,
  getSettings,
  getInitialData,
  labelFor,
} from "@/lib/db/queries"

// The fork isolation (pool: "forks") gives each test file a fresh process.
// ensureSeeded() is called by every query function, so no explicit setup needed.
// Where direct DB manipulation is needed, we call ensureSeeded first via getPortfolios
// to ensure the seed has run, then manipulate state.

describe("DB Queries Integration Tests", () => {
  // Ensure the DB is seeded before any test runs
  beforeAll(async () => {
    // Trigger seed via the first query
    await getPortfolios()
  })

  // ─── getPortfolios ────────────────────────────────────────────────────────

  describe("getPortfolios", () => {
    it("INT-QUERIES-001 — getPortfolios returns empty array on fresh DB", async () => {
      const result = await getPortfolios()
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it("INT-QUERIES-002 — getPortfolios: manually inserted portfolio with entries is returned", async () => {
      const ins = db
        .insert(portfolios)
        .values({
          name: "Test Portfolio",
          color: "#1E40AF",
          targetMonthlyContribution: 500,
        })
        .run()
      const portfolioId = Number(ins.lastInsertRowid)
      db.insert(entries)
        .values({
          portfolioId,
          year: 2024,
          month: 1,
          day: 15,
          invested: 500,
          value: 520,
          note: "",
        })
        .run()
      db.insert(entries)
        .values({
          portfolioId,
          year: 2024,
          month: 2,
          day: 15,
          invested: 500,
          value: 1040,
          note: "",
        })
        .run()

      const result = await getPortfolios()
      const portfolio = result.find((p) => p.name === "Test Portfolio")
      expect(portfolio).toBeDefined()
      expect(portfolio!.entries).toHaveLength(2)
    })

    it("INT-QUERIES-003 — getPortfolios: entries are ordered by year asc, month asc", async () => {
      const result = await getPortfolios()
      const portfolio = result.find((p) => p.name === "Test Portfolio")
      expect(portfolio).toBeDefined()
      const ents = portfolio!.entries
      expect(ents.length).toBeGreaterThanOrEqual(2)
      // Each consecutive entry's (year * 12 + month) must be greater than the previous
      for (let i = 1; i < ents.length; i++) {
        const prev = ents[i - 1].year * 12 + ents[i - 1].month
        const curr = ents[i].year * 12 + ents[i].month
        expect(curr).toBeGreaterThan(prev)
      }
    })

    it("INT-QUERIES-004 — getPortfolios: entry DTO shape is complete", async () => {
      const result = await getPortfolios()
      const portfolio = result.find((p) => p.name === "Test Portfolio")
      expect(portfolio).toBeDefined()
      const entry = portfolio!.entries[0]

      // Has all required keys
      expect(entry).toHaveProperty("id")
      expect(entry).toHaveProperty("year")
      expect(entry).toHaveProperty("month")
      expect(entry).toHaveProperty("day")
      expect(entry).toHaveProperty("label")
      expect(entry).toHaveProperty("invested")
      expect(entry).toHaveProperty("value")
      expect(entry).toHaveProperty("note")
      expect(entry).not.toHaveProperty("dividends")

      // label is correctly derived from year and month
      expect(entry.label).toBe(labelFor(entry.year, entry.month))

      // invested, value are integers
      expect(Number.isInteger(entry.invested)).toBe(true)
      expect(Number.isInteger(entry.value)).toBe(true)

      // note is a string (possibly empty)
      expect(typeof entry.note).toBe("string")
    })

    it("INT-QUERIES-005 — getPortfolios: portfolios ordered by id ascending", async () => {
      // Insert two extra portfolios to verify ordering
      db.insert(portfolios)
        .values({
          name: "Z Portfolio",
          color: "#fff",
          targetMonthlyContribution: 0,
        })
        .run()
      db.insert(portfolios)
        .values({
          name: "A Portfolio",
          color: "#fff",
          targetMonthlyContribution: 0,
        })
        .run()

      const result = await getPortfolios()
      expect(result.length).toBeGreaterThanOrEqual(2)

      // IDs must be in strictly ascending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i].id).toBeGreaterThan(result[i - 1].id)
      }
    })

    it("INT-QUERIES-006 — getPortfolios: portfolio with no entries returns empty entries array", async () => {
      // Insert a fresh portfolio with no entries
      db.insert(portfolios)
        .values({
          name: "Empty Portfolio",
          color: "#000",
          targetMonthlyContribution: 0,
        })
        .run()

      const result = await getPortfolios()
      const emptyPortfolio = result.find((p) => p.name === "Empty Portfolio")
      expect(emptyPortfolio).toBeDefined()
      expect(emptyPortfolio?.entries).toEqual([])
    })

    it("INT-QUERIES-014 — getPortfolios: reflects immediately after manual insert", async () => {
      // Count current portfolios before inserting
      const before = await getPortfolios()
      const beforeCount = before.length

      // Insert a new portfolio manually
      db.insert(portfolios)
        .values({
          name: "Fresh Portfolio",
          color: "#123456",
          targetMonthlyContribution: 100,
        })
        .run()

      const result = await getPortfolios()
      expect(result).toHaveLength(beforeCount + 1)

      const fresh = result.find((p) => p.name === "Fresh Portfolio")
      expect(fresh).toBeDefined()
      expect(fresh?.entries).toEqual([])
    })
  })

  // ─── getGoals ─────────────────────────────────────────────────────────────

  describe("getGoals", () => {
    it("INT-QUERIES-007 — getGoals returns empty array on fresh DB", async () => {
      const result = await getGoals()
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })

    it("INT-QUERIES-008 — getGoals: returned shape matches GoalDTO", async () => {
      db.insert(goals)
        .values({
          name: "Test Goal",
          targetYear: 2040,
          color: "#1E40AF",
          kind: "annual_income",
          scope: "combined",
          target: 36000,
          swr: 4.0,
        })
        .run()

      const result = await getGoals()
      const goal = result.find((g) => g.name === "Test Goal")
      expect(goal).toBeDefined()

      expect(goal).toHaveProperty("id")
      expect(goal).toHaveProperty("name")
      expect(goal).toHaveProperty("kind")
      expect(goal).toHaveProperty("scope")
      expect(goal).toHaveProperty("target")
      expect(goal).toHaveProperty("targetYear")
      expect(goal).toHaveProperty("color")
      expect(goal).toHaveProperty("swr")

      expect(typeof goal!.id).toBe("number")
      expect(goal!.id).toBeGreaterThan(0)
      expect(typeof goal!.color).toBe("string")
      expect(goal!.color.length).toBeGreaterThan(0)
      expect(goal!.kind).toBe("annual_income")
      expect(goal!.scope).toBe("combined")
      expect(goal!.target).toBe(36000)
    })

    it("INT-QUERIES-009 — getGoals: results ordered by id ascending", async () => {
      // Insert an additional goal
      db.insert(goals)
        .values({
          name: "Extra Goal",
          target: 50000,
          targetYear: 2045,
          color: "#aaaaaa",
        })
        .run()

      const result = await getGoals()
      expect(result.length).toBeGreaterThanOrEqual(2)

      for (let i = 1; i < result.length; i++) {
        expect(result[i].id).toBeGreaterThan(result[i - 1].id)
      }
    })
  })

  // ─── getSettings ──────────────────────────────────────────────────────────

  describe("getSettings", () => {
    it("INT-QUERIES-010 — getSettings returns singleton row with correct defaults", async () => {
      const s = await getSettings()
      expect(s.id).toBe(1)
      expect(s.inflation).toBe(2.4)
      expect(s.conservativeReturn).toBe(4.0)
      expect(s.optimisticReturn).toBe(10.0)
      expect(s.monthlySaving).toBe(1250)
      expect(s.horizonYears).toBe(20)
    })

    it("INT-QUERIES-011 — getSettings is idempotent: calling twice returns same row", async () => {
      const a = await getSettings()
      const b = await getSettings()

      expect(a).toEqual(b)

      const rows = db.select().from(settings).all()
      expect(rows).toHaveLength(1)
    })

    it("INT-QUERIES-012 — getSettings: creates row when settings table is empty", async () => {
      // Delete the settings row
      db.delete(settings).run()

      const s = await getSettings()
      expect(s.id).toBe(1)
      // All defaults are present
      expect(typeof s.inflation).toBe("number")
      expect(typeof s.conservativeReturn).toBe("number")
      expect(typeof s.optimisticReturn).toBe("number")
      expect(typeof s.monthlySaving).toBe("number")
      expect(typeof s.horizonYears).toBe("number")

      // Calling again returns the same row without creating a duplicate
      const s2 = await getSettings()
      expect(s2).toEqual(s)
    })
  })

  // ─── getInitialData ───────────────────────────────────────────────────────

  describe("getInitialData", () => {
    it("INT-QUERIES-013 — getInitialData returns all three domains", async () => {
      const data = await getInitialData()
      expect(Array.isArray(data.portfolios)).toBe(true)
      expect(Array.isArray(data.goals)).toBe(true)
      expect(data.settings).toBeDefined()
      expect(data.settings.id).toBe(1)
    })
  })

  // ─── Negative paths ───────────────────────────────────────────────────────

  describe("Negative / error paths", () => {
    it("INT-QUERIES — getGoals on empty goals table returns [] without throwing", async () => {
      // Truncate goals
      db.delete(goals).run()
      const result = await getGoals()
      expect(result).toEqual([])
    })
  })
})
