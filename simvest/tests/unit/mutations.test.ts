import { describe, it, expect, beforeEach } from "vitest"
import * as mutations from "@/lib/mutations"
import type { MutationDeps } from "@/lib/mutations"
import { TestFetchAdapter } from "@/lib/mutations/test-adapter"
import type {
  EntryDTO,
  GoalDTO,
  HoldingDTO,
  IncomeEventDTO,
  PortfolioDTO,
} from "@/lib/types"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"

type RecordingSetters = {
  portfolios: PortfolioDTO[]
  goals: GoalDTO[]
  holdings: HoldingDTO[]
  incomeEvents: IncomeEventDTO[]
  selectedPortfolio: number
}

function makeDeps(
  initial: Partial<RecordingSetters> = {},
  adapter: TestFetchAdapter = new TestFetchAdapter()
) {
  const state: RecordingSetters = {
    portfolios: initial.portfolios ?? [],
    goals: initial.goals ?? [],
    holdings: initial.holdings ?? [],
    incomeEvents: initial.incomeEvents ?? [],
    selectedPortfolio: initial.selectedPortfolio ?? COMBINED_PORTFOLIO_ID,
  }
  const deps: MutationDeps = {
    fetch: adapter,
    getPortfolios: () => state.portfolios,
    getGoals: () => state.goals,
    getHoldings: () => state.holdings,
    getIncomeEvents: () => state.incomeEvents,
    setPortfolios: (v) => {
      state.portfolios = typeof v === "function" ? v(state.portfolios) : v
    },
    setGoals: (v) => {
      state.goals = typeof v === "function" ? v(state.goals) : v
    },
    setHoldings: (v) => {
      state.holdings = typeof v === "function" ? v(state.holdings) : v
    },
    setIncomeEvents: (v) => {
      state.incomeEvents = typeof v === "function" ? v(state.incomeEvents) : v
    },
    setSelectedPortfolio: (v) => {
      state.selectedPortfolio =
        typeof v === "function" ? v(state.selectedPortfolio) : v
    },
  }
  return { deps, state, adapter }
}

function makePortfolio(
  id: number,
  overrides: Partial<PortfolioDTO> = {}
): PortfolioDTO {
  return {
    id,
    name: `P${id}`,
    color: "#000",
    targetMonthlyContribution: 0,
    startingValue: 0,
    startingDate: null,
    entries: [],
    ...overrides,
  }
}

function makeEntry(
  year: number,
  month: number,
  overrides: Partial<EntryDTO> = {}
): EntryDTO {
  return {
    id: year * 100 + month,
    year,
    month,
    day: 1,
    label: `${year}-${month}`,
    invested: 100,
    value: 100,
    note: "",
    ...overrides,
  }
}

function makeGoal(id: number, overrides: Partial<GoalDTO> = {}): GoalDTO {
  return {
    id,
    name: `G${id}`,
    color: "#000",
    target: 100000,
    targetYear: 2040,
    kind: "portfolio_value",
    scope: "combined",
    portfolioId: null,
    swr: 4,
    yieldAssumed: null,
    ...overrides,
  }
}

function makeHolding(
  id: number,
  overrides: Partial<HoldingDTO> = {}
): HoldingDTO {
  return {
    id,
    portfolioId: 1,
    name: `H${id}`,
    type: "stock",
    isin: null,
    ...overrides,
  }
}

function makeIncomeEvent(
  id: number,
  overrides: Partial<IncomeEventDTO> = {}
): IncomeEventDTO {
  return {
    id,
    kind: "dividend",
    portfolioId: 1,
    holdingId: 1,
    holdingName: "H1",
    holdingType: "stock",
    holdingIsin: null,
    paidDate: "2024-01-15",
    amount: 10,
    tax: 0,
    note: "",
    sourceBroker: null,
    sourceTransactionId: null,
    ...overrides,
  }
}

describe("mutations — entries", () => {
  let setup: ReturnType<typeof makeDeps>

  beforeEach(() => {
    setup = makeDeps({
      portfolios: [
        makePortfolio(1, { entries: [makeEntry(2024, 1, { id: 10 })] }),
      ],
    })
  })

  it("UNIT-MUT-001 — upsertEntry POSTs and inserts the returned row in order", async () => {
    const saved = makeEntry(2024, 3, { id: 12, invested: 200 })
    setup.adapter.ok(saved)

    await mutations.upsertEntry(setup.deps, 1, {
      year: 2024,
      month: 3,
      day: 15,
      invested: 200,
      value: null,
      note: "",
    })

    expect(setup.adapter.requests[0]).toMatchObject({
      method: "POST",
      url: "/api/portfolios/1/entries",
    })
    expect(setup.state.portfolios[0].entries.map((e) => e.month)).toEqual([
      1, 3,
    ])
  })

  it("UNIT-MUT-002 — upsertEntry replaces an existing entry by (year, month)", async () => {
    const saved = makeEntry(2024, 1, { id: 10, invested: 999 })
    setup.adapter.ok(saved)

    await mutations.upsertEntry(setup.deps, 1, {
      year: 2024,
      month: 1,
      day: 28,
      invested: 999,
      value: 999,
      note: "",
    })

    expect(setup.state.portfolios[0].entries).toHaveLength(1)
    expect(setup.state.portfolios[0].entries[0].invested).toBe(999)
  })

  it("UNIT-MUT-003 — deleteEntry applies optimistically then DELETEs", async () => {
    setup.adapter.okEmpty()

    await mutations.deleteEntry(setup.deps, 1, 10)

    expect(setup.state.portfolios[0].entries).toHaveLength(0)
    expect(setup.adapter.requests[0]).toMatchObject({
      method: "DELETE",
      url: "/api/entries/10",
    })
  })

  it("UNIT-MUT-004 — deleteEntry rolls back on server failure and rethrows", async () => {
    setup.adapter.error(500, "boom")

    await expect(mutations.deleteEntry(setup.deps, 1, 10)).rejects.toThrow(
      /boom/
    )
    expect(setup.state.portfolios[0].entries).toHaveLength(1)
  })
})

describe("mutations — portfolios", () => {
  it("UNIT-MUT-010 — addPortfolio POSTs and appends the created row", async () => {
    const { deps, state, adapter } = makeDeps()
    const created = makePortfolio(7, { name: "New" })
    adapter.ok(created)

    const out = await mutations.addPortfolio(deps, { name: "New" })

    expect(out).toEqual(created)
    expect(state.portfolios.map((p) => p.id)).toEqual([7])
    expect(adapter.requests[0]).toMatchObject({
      method: "POST",
      url: "/api/portfolios",
      body: { name: "New" },
    })
  })

  it("UNIT-MUT-011 — deletePortfolio resets selection when active portfolio is deleted", async () => {
    const { deps, state, adapter } = makeDeps({
      portfolios: [makePortfolio(1), makePortfolio(2)],
      selectedPortfolio: 1,
    })
    adapter.okEmpty()

    await mutations.deletePortfolio(deps, 1)

    expect(state.portfolios.map((p) => p.id)).toEqual([2])
    expect(state.selectedPortfolio).toBe(COMBINED_PORTFOLIO_ID)
  })

  it("UNIT-MUT-012 — deletePortfolio keeps selection when a different portfolio is deleted", async () => {
    const { deps, state, adapter } = makeDeps({
      portfolios: [makePortfolio(1), makePortfolio(2)],
      selectedPortfolio: 2,
    })
    adapter.okEmpty()

    await mutations.deletePortfolio(deps, 1)

    expect(state.selectedPortfolio).toBe(2)
  })

  it("UNIT-MUT-013 — deletePortfolio rolls back portfolios on server failure", async () => {
    const before = [makePortfolio(1), makePortfolio(2)]
    const { deps, state, adapter } = makeDeps({ portfolios: before })
    adapter.error(503, "DB unreachable")

    await expect(mutations.deletePortfolio(deps, 1)).rejects.toThrow(
      /DB unreachable/
    )
    expect(state.portfolios.map((p) => p.id)).toEqual([1, 2])
  })

  it("UNIT-MUT-014 — reloadPortfolios GETs and replaces state", async () => {
    const { deps, state, adapter } = makeDeps()
    adapter.ok([makePortfolio(9)])

    await mutations.reloadPortfolios(deps)

    expect(adapter.requests[0]).toMatchObject({
      method: "GET",
      url: "/api/portfolios",
    })
    expect(state.portfolios.map((p) => p.id)).toEqual([9])
  })
})

describe("mutations — goals", () => {
  it("UNIT-MUT-020 — addGoal POSTs and appends", async () => {
    const { deps, state, adapter } = makeDeps()
    adapter.ok(makeGoal(1))

    await mutations.addGoal(deps, {
      name: "G1",
      target: 1000,
      targetYear: 2030,
      kind: "portfolio_value",
      scope: "combined",
      portfolioId: null,
      swr: 4,
      yieldAssumed: null,
    })

    expect(state.goals).toHaveLength(1)
    expect(adapter.requests[0].url).toBe("/api/goals")
  })

  it("UNIT-MUT-021 — updateGoal PATCHes and replaces by id", async () => {
    const { deps, state, adapter } = makeDeps({
      goals: [makeGoal(1, { name: "old" }), makeGoal(2)],
    })
    adapter.ok(makeGoal(1, { name: "new" }))

    await mutations.updateGoal(deps, 1, { name: "new" })

    expect(state.goals[0].name).toBe("new")
    expect(state.goals[1].name).toBe("G2")
  })

  it("UNIT-MUT-022 — deleteGoal rolls back on failure", async () => {
    const { deps, state, adapter } = makeDeps({
      goals: [makeGoal(1), makeGoal(2)],
    })
    adapter.error(500, "boom")

    await expect(mutations.deleteGoal(deps, 1)).rejects.toThrow(/boom/)
    expect(state.goals.map((g) => g.id)).toEqual([1, 2])
  })

  it("UNIT-MUT-023 — deleteGoal rollback restores only the affected record, preserving concurrent updates", async () => {
    const { deps, state, adapter } = makeDeps({
      goals: [makeGoal(1), makeGoal(2)],
    })
    adapter.error(500, "boom")

    // Server failure is queued. Kick off the delete and, before its catch
    // runs, simulate a concurrent state update (e.g. a goal added via another
    // flow). Rollback must not clobber that goal.
    const pending = mutations.deleteGoal(deps, 1)
    deps.setGoals((prev) => [...prev, makeGoal(3)])
    await expect(pending).rejects.toThrow(/boom/)

    expect(state.goals.map((g) => g.id).sort()).toEqual([1, 2, 3])
  })
})

describe("mutations — holdings", () => {
  it("UNIT-MUT-030 — addHolding surfaces server .error message", async () => {
    const { deps, adapter } = makeDeps()
    adapter.error(400, "duplicate isin")

    await expect(
      mutations.addHolding(deps, {
        portfolioId: 1,
        name: "X",
        type: "stock",
      })
    ).rejects.toThrow(/duplicate isin/)
  })

  it("UNIT-MUT-031 — updateHolding cascades rename/type/isin into matching income events", async () => {
    const { deps, state, adapter } = makeDeps({
      holdings: [makeHolding(1, { name: "Old" })],
      incomeEvents: [
        makeIncomeEvent(100, { holdingId: 1, holdingName: "Old" }),
        makeIncomeEvent(101, { holdingId: 2, holdingName: "Other" }),
      ],
    })
    adapter.ok(makeHolding(1, { name: "New", type: "etf", isin: "US123" }))

    await mutations.updateHolding(deps, 1, { name: "New" })

    expect(state.holdings[0].name).toBe("New")
    expect(state.incomeEvents[0]).toMatchObject({
      holdingName: "New",
      holdingType: "etf",
      holdingIsin: "US123",
    })
    // Unrelated event left alone.
    expect(state.incomeEvents[1].holdingName).toBe("Other")
  })

  it("UNIT-MUT-032 — deleteHolding optimistically removes both holdings and its income events; rolls back both on failure", async () => {
    const { deps, state, adapter } = makeDeps({
      holdings: [makeHolding(1), makeHolding(2)],
      incomeEvents: [
        makeIncomeEvent(100, { holdingId: 1 }),
        makeIncomeEvent(101, { holdingId: 2 }),
      ],
    })
    adapter.error(500, "boom")

    await expect(mutations.deleteHolding(deps, 1)).rejects.toThrow(/boom/)

    expect(state.holdings.map((h) => h.id)).toEqual([1, 2])
    expect(state.incomeEvents.map((e) => e.id)).toEqual([100, 101])
  })
})

describe("mutations — income events", () => {
  it("UNIT-MUT-040 — addIncomeEvent appends", async () => {
    const { deps, state, adapter } = makeDeps()
    adapter.ok(makeIncomeEvent(100))

    await mutations.addIncomeEvent(deps, {
      kind: "dividend",
      portfolioId: 1,
      holdingId: 1,
      paidDate: "2024-01-15",
      amount: 10,
    })

    expect(state.incomeEvents).toHaveLength(1)
  })

  it("UNIT-MUT-041 — deleteIncomeEvent rolls back on failure", async () => {
    const { deps, state, adapter } = makeDeps({
      incomeEvents: [makeIncomeEvent(100), makeIncomeEvent(101)],
    })
    adapter.error(500, "boom")

    await expect(mutations.deleteIncomeEvent(deps, 100)).rejects.toThrow(/boom/)
    expect(state.incomeEvents.map((e) => e.id)).toEqual([100, 101])
  })
})

describe("mutations — settings + portfolio debounce flushes", () => {
  it("UNIT-MUT-050 — flushSettings sends a keepalive PATCH and swallows failures", async () => {
    const { deps, adapter } = makeDeps()
    adapter.error(500, "transient")

    // fire-and-forget — must not throw even though the adapter rejects
    mutations.flushSettings(deps, { inflation: 3 })

    // Allow the swallowed-rejection microtask to settle.
    await new Promise((r) => setTimeout(r, 0))

    expect(adapter.requests[0]).toMatchObject({
      method: "PATCH",
      url: "/api/settings",
      body: { inflation: 3 },
      keepalive: true,
    })
  })

  it("UNIT-MUT-051 — flushPortfolioPatch targets the per-id URL with keepalive", async () => {
    const { deps, adapter } = makeDeps()
    adapter.okEmpty()

    mutations.flushPortfolioPatch(deps, 7, { name: "Renamed" })
    await new Promise((r) => setTimeout(r, 0))

    expect(adapter.requests[0]).toMatchObject({
      method: "PATCH",
      url: "/api/portfolios/7",
      body: { name: "Renamed" },
      keepalive: true,
    })
  })
})

describe("mutations — broker import", () => {
  it("UNIT-MUT-060 — importBrokerData POSTs, reloads portfolios/holdings/income events, returns applied", async () => {
    const { deps, state, adapter } = makeDeps()
    adapter
      .ok({
        applied: {
          entriesUpserted: 2,
          holdingsCreated: 1,
          dividendsInserted: 0,
          interestInserted: 0,
          duplicatesSkipped: 0,
          warnings: [],
        },
      })
      .ok([makePortfolio(1)])
      .ok([makeHolding(1)])
      .ok([makeIncomeEvent(100)])

    const applied = await mutations.importBrokerData(deps, {
      broker: "trade_republic",
      portfolioId: 1,
      csv: "csv",
      decisions: {
        months: [],
        importDividends: true,
        importInterest: true,
        importHoldings: true,
      },
    })

    expect(applied.entriesUpserted).toBe(2)
    expect(adapter.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST /api/import/commit",
      "GET /api/portfolios",
      "GET /api/holdings",
      "GET /api/income-events",
    ])
    expect(state.portfolios).toHaveLength(1)
    expect(state.holdings).toHaveLength(1)
    expect(state.incomeEvents).toHaveLength(1)
  })

  it("UNIT-MUT-061 — importBrokerData surfaces server .error message on commit failure", async () => {
    const { deps, adapter } = makeDeps()
    adapter.error(400, "decisions.months is required")

    await expect(
      mutations.importBrokerData(deps, {
        broker: "trade_republic",
        portfolioId: 1,
        csv: "csv",
        decisions: {
          months: [],
          importDividends: true,
          importInterest: true,
          importHoldings: true,
        },
      })
    ).rejects.toThrow(/decisions\.months is required/)
  })
})
