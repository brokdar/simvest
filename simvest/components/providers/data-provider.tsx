"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  IncomeEventDTO,
  IncomeEventPatch,
  IncomeKind,
  GoalDTO,
  HoldingDTO,
  HoldingPatch,
  HoldingType,
  PortfolioDTO,
  PortfolioPatch,
  SettingsDTO as Settings,
} from "@/lib/types"
import type { ImportApplied, ImportDecisions } from "@/lib/import/types"
import type { RestoreSummary, TransferPreview } from "@/lib/transfer/types"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"
import {
  aggregatePortfoliosWithCoverage,
  type GoalEvaluation,
  type MonthCoverage,
  type StaleContributor,
} from "@/lib/calc"
import { createGoalEvaluator, type GoalEvaluator } from "@/lib/goal-evaluator"
import { LocaleSync } from "@/components/providers/locale-sync"
import * as mutations from "@/lib/mutations"
import type { MutationDeps } from "@/lib/mutations"
import {
  createFetchAdapter,
  type FetchAdapter,
} from "@/lib/mutations/fetch-adapter"

export type ImportResult = ImportApplied

type Initial = {
  portfolios: PortfolioDTO[]
  goals: GoalDTO[]
  settings: Settings
  holdings: HoldingDTO[]
  incomeEvents: IncomeEventDTO[]
  /**
   * Selected portfolio id resolved on the server from the
   * `simvest.selectedPortfolio` cookie. Sent across the SSR boundary so the
   * provider's `useState` initializer can use the same value on both server
   * and client — no hydration mismatch, no Combined→user-picked flicker.
   *
   * Missing/invalid cookies fall back to `COMBINED_PORTFOLIO_ID`.
   */
  selectedPortfolioId?: number
  /**
   * SSR-anchored "today" ISO date. Threaded through so date math
   * (trailing-12mo cutoffs, sparkline buckets) uses the same anchor on
   * server and client — no hydration mismatch when the request straddles
   * a day boundary.
   */
  today?: string
}

type DataActions = {
  setSelectedPortfolio: (id: number) => void
  upsertEntry: (
    portfolioId: number,
    entry: {
      year: number
      month: number
      day: number
      invested: number
      value: number | null
      note: string
    }
  ) => Promise<void>
  deleteEntry: (portfolioId: number, entryId: number) => Promise<void>
  applyPastedEntries: (
    portfolioId: number,
    rows: Array<{
      year: number
      month: number
      day: number
      invested: number
      value: number | null
      note: string
    }>
  ) => Promise<{ added: number; updated: number; skipped: number }>
  updateSettings: (patch: Partial<Settings>) => void
  updatePortfolio: (id: number, patch: PortfolioPatch) => void
  addPortfolio: (input: {
    name: string
    color?: string
    targetMonthlyContribution?: number
    startingValue?: number
    startingDate?: string | null
  }) => Promise<PortfolioDTO>
  deletePortfolio: (id: number) => Promise<void>
  reloadPortfolios: () => Promise<void>
  reloadGoals: () => Promise<void>
  reloadHoldings: () => Promise<void>
  reloadIncomeEvents: () => Promise<void>
  addGoal: (
    goal: Omit<GoalDTO, "id" | "color"> & { color?: string }
  ) => Promise<GoalDTO>
  updateGoal: (id: number, patch: Partial<Omit<GoalDTO, "id">>) => Promise<void>
  deleteGoal: (id: number) => Promise<void>
  addHolding: (input: {
    portfolioId: number
    name: string
    type: HoldingType
    isin?: string | null
  }) => Promise<HoldingDTO>
  updateHolding: (id: number, patch: HoldingPatch) => Promise<void>
  deleteHolding: (id: number) => Promise<void>
  addIncomeEvent: (input: {
    kind: IncomeKind
    portfolioId?: number
    holdingId: number | null
    paidDate: string
    amount: number
    tax?: number
    note?: string
  }) => Promise<IncomeEventDTO>
  updateIncomeEvent: (id: number, patch: IncomeEventPatch) => Promise<void>
  deleteIncomeEvent: (id: number) => Promise<void>
  importBrokerData: (input: {
    broker: string
    portfolioId: number
    csv: string
    decisions: ImportDecisions
  }) => Promise<ImportResult>
  importPortfolioPreview: (payload: unknown) => Promise<TransferPreview>
  importPortfolio: (input: {
    payload: unknown
    overrideName?: string
  }) => Promise<{ portfolio: PortfolioDTO; summary: RestoreSummary }>
}

type DataContextValue = {
  portfolios: PortfolioDTO[]
  goals: GoalDTO[]
  settings: Settings
  holdings: HoldingDTO[]
  incomeEvents: IncomeEventDTO[]
  selectedPortfolio: number
  /**
   * Memoized aggregate across all portfolios. Pre-computed in the provider so
   * every consumer reads the same object reference until `portfolios` changes.
   */
  combinedPortfolio: PortfolioDTO
  /**
   * Per-month data-coverage flags aligned 1:1 with `combinedPortfolio.entries`.
   * Lets combined views shade months whose value is carried-forward.
   */
  combinedCoverage: MonthCoverage[]
  /**
   * Portfolios whose latest value predates the combined timeline's last month
   * (their balance is being carried forward). Drives the "stale data" notice.
   */
  combinedStale: StaleContributor[]
  /**
   * The portfolio currently selected for views — either combined or a real
   * portfolio. Falls back to combined when the selection is stale.
   */
  activePortfolio: PortfolioDTO
  /**
   * Per-goal evaluation indexed by goal id. Pre-computed in the provider so
   * KPI tiles, chart overlays, and milestone strips share a single evaluation
   * pass per render instead of each calling `evaluateGoal()` in `.map()`.
   */
  goalEvals: Record<number, GoalEvaluation>
  /**
   * Memoized evaluator with `portfolios`, `incomeEvents`, `settings`, and
   * `effectiveMonthlySaving` already bound. Editors and the planning workspace
   * call `goalEvaluator.evaluate(formDraft)` / `.estimateYield(...)` instead
   * of recomputing scoped KPIs + yields inline.
   */
  goalEvaluator: GoalEvaluator
  /** Sum-of-contributions for combined; the portfolio's own contribution otherwise. */
  effectiveMonthlySaving: (id: number) => number
  /** SSR-anchored "today" ISO date — see Initial.today. */
  today: string
} & DataActions

const DataContext = createContext<DataContextValue | null>(null)
// Actions live in a sibling context with a stable value object so consumers
// that only mutate (HeaderShell editor triggers, editor onSave callbacks) do
// not re-render when state changes.
const DataActionsContext = createContext<DataActions | null>(null)

const SELECTED_KEY = "simvest.selectedPortfolio"

const defaultFetchAdapter = createFetchAdapter()

export function DataProvider({
  initial,
  children,
  fetchAdapter = defaultFetchAdapter,
}: {
  initial: Initial
  children: React.ReactNode
  /**
   * Wire adapter for outbound HTTP. Defaults to the prod `window.fetch`
   * wrapper; tests pass a recording adapter via `TestDataProvider`.
   */
  fetchAdapter?: FetchAdapter
}) {
  const [portfolios, setPortfolios] = useState<PortfolioDTO[]>(
    initial.portfolios
  )
  const [goals, setGoals] = useState<GoalDTO[]>(initial.goals)
  const [settings, setSettings] = useState<Settings>(initial.settings)
  const [holdings, setHoldings] = useState<HoldingDTO[]>(initial.holdings)
  const [incomeEvents, setIncomeEvents] = useState<IncomeEventDTO[]>(
    initial.incomeEvents
  )

  const [selectedPortfolio, setSelectedPortfolioState] = useState<number>(
    initial.selectedPortfolioId ?? COMBINED_PORTFOLIO_ID
  )

  // SSR-anchored "today" — initial.today is set on the server; fall back to
  // the current date for any caller that constructs a DataProvider without
  // it (tests, etc.). Stored once on first mount so subsequent renders
  // remain deterministic; long-running clients may drift across midnight but
  // a full reload re-anchors.
  const [today] = useState<string>(
    () => initial.today ?? new Date().toISOString().slice(0, 10)
  )

  // Mirror collections into refs so mutations can read the latest state
  // (e.g. snapshot the record being deleted for optimistic rollback) without
  // breaking `deps` referential stability or re-memoizing `actions` on every
  // collection change. Sync happens in an effect (post-commit) — mutations
  // only fire from event handlers, which also run post-commit, so the refs
  // always see the same snapshot the user is looking at.
  //
  // Caveat: two mutations fired synchronously in the same event-loop tick
  // see the same ref value. React batches the setState calls between them,
  // so the second mutation's `deps.getPortfolios()` returns the pre-tick
  // snapshot. In practice every editor fires one mutation per click; if a
  // future flow needs sequential mutations within a tick, `await` between
  // them so React can flush the commit + effect.
  const portfoliosRef = useRef(portfolios)
  const goalsRef = useRef(goals)
  const holdingsRef = useRef(holdings)
  const incomeEventsRef = useRef(incomeEvents)
  useEffect(() => {
    portfoliosRef.current = portfolios
  }, [portfolios])
  useEffect(() => {
    goalsRef.current = goals
  }, [goals])
  useEffect(() => {
    holdingsRef.current = holdings
  }, [holdings])
  useEffect(() => {
    incomeEventsRef.current = incomeEvents
  }, [incomeEvents])

  // `useState`'s setter is stable by React contract; the adapter is stable by
  // the caller's contract (the prod default never changes; `TestDataProvider`
  // creates one adapter per mount). The deps bundle therefore has stable
  // identity across renders — every passthrough callback below can list it
  // as a dep without thrashing.
  const deps = useMemo<MutationDeps>(
    () => ({
      fetch: fetchAdapter,
      getPortfolios: () => portfoliosRef.current,
      getGoals: () => goalsRef.current,
      getHoldings: () => holdingsRef.current,
      getIncomeEvents: () => incomeEventsRef.current,
      setPortfolios,
      setGoals,
      setHoldings,
      setIncomeEvents,
      setSelectedPortfolio: setSelectedPortfolioState,
    }),
    [fetchAdapter]
  )

  const setSelectedPortfolio = useCallback((id: number) => {
    setSelectedPortfolioState(id)
    try {
      localStorage.setItem(SELECTED_KEY, String(id))
    } catch {
      // ignore quota / SSR
    }
    try {
      document.cookie = `${SELECTED_KEY}=${id}; path=/; max-age=31536000; SameSite=Lax`
    } catch {
      // ignore — SSR guard
    }
  }, [])

  const reloadPortfolios = useCallback(
    () => mutations.reloadPortfolios(deps),
    [deps]
  )
  const reloadGoals = useCallback(() => mutations.reloadGoals(deps), [deps])
  const reloadHoldings = useCallback(
    () => mutations.reloadHoldings(deps),
    [deps]
  )
  const reloadIncomeEvents = useCallback(
    () => mutations.reloadIncomeEvents(deps),
    [deps]
  )

  const upsertEntry = useCallback<DataActions["upsertEntry"]>(
    (portfolioId, entry) => mutations.upsertEntry(deps, portfolioId, entry),
    [deps]
  )
  const deleteEntry = useCallback<DataActions["deleteEntry"]>(
    (portfolioId, entryId) => mutations.deleteEntry(deps, portfolioId, entryId),
    [deps]
  )
  const applyPastedEntries = useCallback<DataActions["applyPastedEntries"]>(
    (portfolioId, rows) =>
      mutations.applyPastedEntries(deps, portfolioId, rows),
    [deps]
  )

  // ── Debounced settings PATCH ──────────────────────────────────────────
  // The 400 ms debounce coalesces slider drags into one wire call; the
  // pagehide listener flushes any pending patch via keepalive so a navigation
  // mid-drag doesn't lose the last tick.
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSettingsPatch = useRef<Partial<Settings>>({})

  const flushSettingsPatch = useCallback(() => {
    const body = pendingSettingsPatch.current
    pendingSettingsPatch.current = {}
    if (settingsTimer.current) {
      clearTimeout(settingsTimer.current)
      settingsTimer.current = null
    }
    if (Object.keys(body).length === 0) return
    mutations.flushSettings(deps, body)
  }, [deps])

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch }))
      pendingSettingsPatch.current = {
        ...pendingSettingsPatch.current,
        ...patch,
      }
      if (settingsTimer.current) clearTimeout(settingsTimer.current)
      settingsTimer.current = setTimeout(flushSettingsPatch, 400)
    },
    [flushSettingsPatch]
  )

  // ── Debounced per-portfolio PATCH ─────────────────────────────────────
  const portfolioTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  )
  const pendingPortfolioPatches = useRef<Map<number, PortfolioPatch>>(new Map())

  const flushPortfolioPatch = useCallback(
    (id: number) => {
      const body = pendingPortfolioPatches.current.get(id)
      pendingPortfolioPatches.current.delete(id)
      const t = portfolioTimers.current.get(id)
      if (t) {
        clearTimeout(t)
        portfolioTimers.current.delete(id)
      }
      if (!body) return
      mutations.flushPortfolioPatch(deps, id, body)
    },
    [deps]
  )

  const updatePortfolio = useCallback(
    (id: number, patch: PortfolioPatch) => {
      setPortfolios((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      )
      const merged = {
        ...(pendingPortfolioPatches.current.get(id) ?? {}),
        ...patch,
      }
      pendingPortfolioPatches.current.set(id, merged)

      const existing = portfolioTimers.current.get(id)
      if (existing) clearTimeout(existing)
      portfolioTimers.current.set(
        id,
        setTimeout(() => flushPortfolioPatch(id), 400)
      )
    },
    [flushPortfolioPatch]
  )

  useEffect(() => {
    const flushAll = () => {
      flushSettingsPatch()
      for (const id of pendingPortfolioPatches.current.keys()) {
        flushPortfolioPatch(id)
      }
    }
    window.addEventListener("pagehide", flushAll)
    return () => window.removeEventListener("pagehide", flushAll)
  }, [flushSettingsPatch, flushPortfolioPatch])

  // ── Wire passthroughs for the remaining 16 mutations ──────────────────
  const addPortfolio = useCallback<DataActions["addPortfolio"]>(
    (input) => mutations.addPortfolio(deps, input),
    [deps]
  )
  const deletePortfolio = useCallback<DataActions["deletePortfolio"]>(
    (id) => mutations.deletePortfolio(deps, id),
    [deps]
  )
  const addGoal = useCallback<DataActions["addGoal"]>(
    (goal) => mutations.addGoal(deps, goal),
    [deps]
  )
  const updateGoal = useCallback<DataActions["updateGoal"]>(
    (id, patch) => mutations.updateGoal(deps, id, patch),
    [deps]
  )
  const deleteGoal = useCallback<DataActions["deleteGoal"]>(
    (id) => mutations.deleteGoal(deps, id),
    [deps]
  )
  const addHolding = useCallback<DataActions["addHolding"]>(
    (input) => mutations.addHolding(deps, input),
    [deps]
  )
  const updateHolding = useCallback<DataActions["updateHolding"]>(
    (id, patch) => mutations.updateHolding(deps, id, patch),
    [deps]
  )
  const deleteHolding = useCallback<DataActions["deleteHolding"]>(
    (id) => mutations.deleteHolding(deps, id),
    [deps]
  )
  const addIncomeEvent = useCallback<DataActions["addIncomeEvent"]>(
    (input) => mutations.addIncomeEvent(deps, input),
    [deps]
  )
  const updateIncomeEvent = useCallback<DataActions["updateIncomeEvent"]>(
    (id, patch) => mutations.updateIncomeEvent(deps, id, patch),
    [deps]
  )
  const deleteIncomeEvent = useCallback<DataActions["deleteIncomeEvent"]>(
    (id) => mutations.deleteIncomeEvent(deps, id),
    [deps]
  )
  const importBrokerData = useCallback<DataActions["importBrokerData"]>(
    (input) => mutations.importBrokerData(deps, input),
    [deps]
  )
  const importPortfolioPreview = useCallback<
    DataActions["importPortfolioPreview"]
  >((payload) => mutations.importPortfolioPreview(deps, payload), [deps])
  const importPortfolio = useCallback<DataActions["importPortfolio"]>(
    async (input) => {
      const res = await mutations.importPortfolio(deps, input)
      // Switch active portfolio to the imported one. setSelectedPortfolio
      // writes both the cookie and localStorage so SSR on the next reload
      // also sees the new selection.
      setSelectedPortfolio(res.portfolio.id)
      return res
    },
    [deps, setSelectedPortfolio]
  )

  // ── Derived state ────────────────────────────────────────────────────
  const combinedAgg = useMemo(
    () => aggregatePortfoliosWithCoverage(portfolios),
    [portfolios]
  )
  const combinedPortfolio = combinedAgg.portfolio
  const combinedCoverage = combinedAgg.coverage
  const combinedStale = combinedAgg.stale

  const activePortfolio = useMemo<PortfolioDTO>(() => {
    if (selectedPortfolio === COMBINED_PORTFOLIO_ID) return combinedPortfolio
    return (
      portfolios.find((p) => p.id === selectedPortfolio) ??
      portfolios[0] ??
      combinedPortfolio
    )
  }, [portfolios, selectedPortfolio, combinedPortfolio])

  const effectiveMonthlySaving = useCallback(
    (id: number) => {
      if (id === COMBINED_PORTFOLIO_ID) {
        return portfolios.reduce((s, p) => s + p.targetMonthlyContribution, 0)
      }
      const p = portfolios.find((x) => x.id === id)
      return p?.targetMonthlyContribution ?? 0
    },
    [portfolios]
  )

  const goalEvaluator = useMemo<GoalEvaluator>(
    () =>
      createGoalEvaluator({
        portfolios,
        incomeEvents,
        settings,
        monthlySaving: effectiveMonthlySaving,
      }),
    [portfolios, incomeEvents, settings, effectiveMonthlySaving]
  )

  const goalEvals = useMemo<Record<number, GoalEvaluation>>(() => {
    const out: Record<number, GoalEvaluation> = {}
    for (const g of goals) {
      out[g.id] = goalEvaluator.evaluate(g)
    }
    return out
  }, [goals, goalEvaluator])

  const actions = useMemo<DataActions>(
    () => ({
      setSelectedPortfolio,
      upsertEntry,
      deleteEntry,
      applyPastedEntries,
      updateSettings,
      updatePortfolio,
      addPortfolio,
      deletePortfolio,
      reloadPortfolios,
      reloadGoals,
      reloadHoldings,
      reloadIncomeEvents,
      addGoal,
      updateGoal,
      deleteGoal,
      addHolding,
      updateHolding,
      deleteHolding,
      addIncomeEvent,
      updateIncomeEvent,
      deleteIncomeEvent,
      importBrokerData,
      importPortfolioPreview,
      importPortfolio,
    }),
    [
      setSelectedPortfolio,
      upsertEntry,
      deleteEntry,
      applyPastedEntries,
      updateSettings,
      updatePortfolio,
      addPortfolio,
      deletePortfolio,
      reloadPortfolios,
      reloadGoals,
      reloadHoldings,
      reloadIncomeEvents,
      addGoal,
      updateGoal,
      deleteGoal,
      addHolding,
      updateHolding,
      deleteHolding,
      addIncomeEvent,
      updateIncomeEvent,
      deleteIncomeEvent,
      importBrokerData,
      importPortfolioPreview,
      importPortfolio,
    ]
  )

  const value = useMemo<DataContextValue>(
    () => ({
      portfolios,
      goals,
      settings,
      holdings,
      incomeEvents,
      selectedPortfolio,
      combinedPortfolio,
      combinedCoverage,
      combinedStale,
      activePortfolio,
      goalEvals,
      goalEvaluator,
      effectiveMonthlySaving,
      today,
      ...actions,
    }),
    [
      portfolios,
      goals,
      settings,
      holdings,
      incomeEvents,
      selectedPortfolio,
      combinedPortfolio,
      combinedCoverage,
      combinedStale,
      activePortfolio,
      goalEvals,
      goalEvaluator,
      effectiveMonthlySaving,
      today,
      actions,
    ]
  )

  return (
    <DataContext.Provider value={value}>
      <DataActionsContext.Provider value={actions}>
        <LocaleSync />
        {children}
      </DataActionsContext.Provider>
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error("useData must be used inside DataProvider")
  return ctx
}

/**
 * Narrow hook for components that only need to mutate state (e.g., editors,
 * toolbar buttons). The returned object has stable identity across renders,
 * so consumers do not re-render when collections change.
 */
export function useDataActions() {
  const ctx = useContext(DataActionsContext)
  if (!ctx) throw new Error("useDataActions must be used inside DataProvider")
  return ctx
}

/**
 * Convenience hook returning the memoized goal evaluator. Editors and the
 * planning workspace call this instead of pulling `portfolios`,
 * `incomeEvents`, `settings`, and `effectiveMonthlySaving` independently.
 * Identity is stable until any of those inputs changes.
 */
export function useGoalEvaluator(): GoalEvaluator {
  return useData().goalEvaluator
}

/**
 * Test factory — wraps `DataProvider` with sensible defaults so that
 * component tests can render any view without spinning up the DB. Pass
 * `fetchAdapter` to swap in a recording adapter from `lib/mutations/test-adapter`.
 */
export function TestDataProvider({
  children,
  fetchAdapter,
  ...overrides
}: Partial<Initial> & {
  children: React.ReactNode
  fetchAdapter?: FetchAdapter
}) {
  const seed: Initial = {
    portfolios: [],
    goals: [],
    holdings: [],
    incomeEvents: [],
    settings: {
      id: 1,
      inflation: 2.4,
      conservativeReturn: 4,
      optimisticReturn: 10,
      monthlySaving: 1250,
      horizonYears: 20,
      defaultEntryDay: "last",
      defaultSwr: 4,
      dividendBasis: "net",
      locale: null,
    },
    ...overrides,
  }
  return (
    <DataProvider initial={seed} fetchAdapter={fetchAdapter}>
      {children}
    </DataProvider>
  )
}
