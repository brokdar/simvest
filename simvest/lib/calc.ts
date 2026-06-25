import type {
  EntryDTO,
  PortfolioDTO,
  IncomeEventDTO,
  IncomeKind,
  IncomePeriodDTO,
  IncomeSliceDTO,
  IncomeCadence,
  GoalDTO,
  SettingsDTO,
  DividendBasis,
} from "@/lib/types"
import { COMBINED_PORTFOLIO_ID, labelFor } from "@/lib/types"

export type KPIs = {
  value: number
  invested: number
  gain: number
  gainPct: number
  cagr: number
}

const COMBINED_ID = COMBINED_PORTFOLIO_ID

/** Round a money amount to two decimals (cents precision). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Most recently recorded portfolio value, skipping entries that carry only
 * a deposit but no recorded value (e.g. broker-imported future-month rows).
 * Both the Overview subtitle / split share and the Portfolio switcher
 * dropdown sub-text rely on this — using `entries.at(-1)` directly silently
 * shows €0,00 or "—" next to a fully populated portfolio whenever the latest
 * row hasn't been valued yet.
 */
export function lastValuedEntry(entries: EntryDTO[]): EntryDTO | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].value !== null) return entries[i]
  }
  return null
}

/** Per-combined-month data-coverage flags, parallel to the combined entries. */
export type MonthCoverage = {
  /** `${year}-${month}` — matches the combined entry at the same index. */
  key: string
  /** Portfolios that recorded a fresh (non-null) value this month. */
  reported: number
  /** Started portfolios whose value was carried forward, not freshly reported. */
  carried: number
  /** Portfolios that have reported a value at or before this month. */
  started: number
  /** True when at least one started portfolio's value is carried-forward. */
  estimated: boolean
}

/** A portfolio whose latest value predates the combined timeline's last month. */
export type StaleContributor = {
  id: number
  name: string
  color: string
  /** Year/month of the portfolio's most recent recorded value. */
  lastYear: number
  lastMonth: number
}

export type CombinedAggregation = {
  portfolio: PortfolioDTO
  /** Coverage flags aligned 1:1 with `portfolio.entries`. */
  coverage: MonthCoverage[]
  /** Portfolios being carried forward because they stopped reporting. */
  stale: StaleContributor[]
}

/**
 * Combine portfolios into the synthetic "Combined" portfolio AND report how
 * complete the data behind each combined month is.
 *
 * Combined value uses last-observation-carried-forward (LOCF): a portfolio
 * worth X at month M is assumed to still hold X in later months until it
 * reports again. This is the honest combined value — without it, a portfolio
 * that simply stops recording month-end values drags the combined line (and
 * every KPI/CAGR/projection derived from it) toward zero, which reads as a
 * crash instead of "data is missing". Leading gaps (a portfolio that hasn't
 * started yet) contribute nothing; only started portfolios are carried.
 *
 * `coverage` lets the UI shade carried-forward months, and `stale` lets it
 * name the portfolios that have gone quiet.
 */
export function aggregatePortfoliosWithCoverage(
  list: PortfolioDTO[]
): CombinedAggregation {
  const combinedContribution = list.reduce(
    (sum, p) => sum + p.targetMonthlyContribution,
    0
  )
  if (!list.length) {
    return {
      portfolio: {
        id: COMBINED_ID,
        name: "Combined",
        color: "#1F2937",
        targetMonthlyContribution: 0,
        startingValue: 0,
        startingDate: null,
        entries: [],
      },
      coverage: [],
      stale: [],
    }
  }

  // Union every portfolio's entries by (year, month). `invested` is a flow, so
  // we sum it only for portfolios that actually have an entry that month;
  // `fresh` records which portfolios reported a real value, by portfolio index.
  type MonthAgg = {
    year: number
    month: number
    invested: number
    days: number[]
    fresh: Map<number, number>
  }
  const months = new Map<string, MonthAgg>()
  for (let pi = 0; pi < list.length; pi++) {
    for (const e of list[pi].entries) {
      const key = `${e.year}-${e.month}`
      let m = months.get(key)
      if (!m) {
        m = {
          year: e.year,
          month: e.month,
          invested: 0,
          days: [],
          fresh: new Map(),
        }
        months.set(key, m)
      }
      m.invested += e.invested
      m.days.push(e.day)
      if (e.value !== null) m.fresh.set(pi, e.value)
    }
  }

  const ordered = [...months.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month
  )

  // Walk the timeline, carrying each portfolio's last recorded value forward.
  const lastKnown = new Array<number | null>(list.length).fill(null)
  const entries: EntryDTO[] = []
  const coverage: MonthCoverage[] = []

  for (const m of ordered) {
    for (const [pi, v] of m.fresh) lastKnown[pi] = v

    let started = 0
    let sum = 0
    for (let pi = 0; pi < list.length; pi++) {
      const lk = lastKnown[pi]
      if (lk !== null) {
        sum += lk
        started++
      }
    }
    const reported = m.fresh.size
    const carried = started - reported

    entries.push({
      id: -1,
      year: m.year,
      month: m.month,
      // Latest day among contributing portfolios anchors the combined row.
      day: Math.max(...m.days),
      label: labelFor(m.year, m.month),
      invested: m.invested,
      // null only until *some* portfolio has ever reported a value at or
      // before this month — keeps the leading "no data anywhere" gap breaking
      // the chart line rather than plotting a fake zero.
      value: started > 0 ? round2(sum) : null,
      note: "",
    })
    coverage.push({
      key: `${m.year}-${m.month}`,
      reported,
      carried,
      started,
      estimated: carried > 0,
    })
  }

  const combinedStartingValue = list.reduce((s, p) => s + p.startingValue, 0)
  const startingDates = list
    .map((p) => p.startingDate)
    .filter((d): d is string => d !== null)
  const combinedStartingDate =
    startingDates.length > 0 ? startingDates.sort()[0] : null

  // A portfolio is "stale" when its newest valued entry predates the combined
  // timeline's last month — i.e. its balance is being carried forward.
  const latest = ordered[ordered.length - 1]
  const stale: StaleContributor[] = []
  for (const p of list) {
    let ly = -1
    let lm = -1
    for (let i = p.entries.length - 1; i >= 0; i--) {
      if (p.entries[i].value !== null) {
        ly = p.entries[i].year
        lm = p.entries[i].month
        break
      }
    }
    if (ly === -1) continue // never reported a value — absent, not carried
    if (ly < latest.year || (ly === latest.year && lm < latest.month)) {
      stale.push({
        id: p.id,
        name: p.name,
        color: p.color,
        lastYear: ly,
        lastMonth: lm,
      })
    }
  }

  return {
    portfolio: {
      id: COMBINED_ID,
      name: "Combined",
      color: "#1F2937",
      targetMonthlyContribution: combinedContribution,
      startingValue: combinedStartingValue,
      startingDate: combinedStartingDate,
      entries,
    },
    coverage,
    stale,
  }
}

export function aggregatePortfolios(list: PortfolioDTO[]): PortfolioDTO {
  return aggregatePortfoliosWithCoverage(list).portfolio
}

/** Latest entry value that's actually set, or null if no entry has one. */
export function latestKnownValue(entries: EntryDTO[]): number | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].value !== null) return entries[i].value
  }
  return null
}

export function computeKPIs(portfolio: PortfolioDTO): KPIs {
  const entries = portfolio.entries
  const startingValue = portfolio.startingValue ?? 0
  if (!entries.length) {
    return { value: 0, invested: 0, gain: 0, gainPct: 0, cagr: 0 }
  }
  // Use the latest entry that has a recorded value. Imported months without
  // a user-entered value are skipped so KPIs reflect the last known reality.
  const value = latestKnownValue(entries) ?? startingValue
  // cost basis = starting balance + all tracked contributions
  const contributions = entries.reduce((s, e) => s + e.invested, 0)
  const invested = startingValue + contributions
  const gain = value - invested
  const gainPct = invested > 0 ? (gain / invested) * 100 : 0

  // Use actual elapsed time when startingDate is known; fall back to entry count.
  let years: number
  if (portfolio.startingDate) {
    const [sy, sm] = portfolio.startingDate.split("-").map(Number)
    const last = entries[entries.length - 1]
    const months = (last.year - sy) * 12 + (last.month - sm)
    years = Math.max(months, 1) / 12
  } else {
    years = entries.length / 12
  }

  const cagr =
    invested > 0
      ? (Math.pow(Math.max(value, 1) / invested, 1 / years) - 1) * 100
      : 0
  return { value, invested, gain, gainPct, cagr }
}

// Defaults used when the data record is too thin to estimate a return from
// actuals. Both express a roughly 7%/yr long-run equity assumption — the
// short-record fallback is annual (returned directly); the per-month fallback
// applies inside the averaging loop and gets compounded with `Math.pow(…, 12)`.
const DEFAULT_ANNUAL_RETURN_PCT = 7
const DEFAULT_MONTHLY_RETURN_FRACTION = 0.006

/** Whether a return figure was estimated from actuals or fell back to the 7%
 * long-run assumption — lets the UI honestly label "Derived" vs "Assumed". */
export type ReturnEstimate = {
  value: number
  source: "derived" | "assumed"
}

/**
 * Annualized historical return plus its provenance. `assumed` when the record
 * is too thin to estimate from actuals — fewer than 6 entries, or no month has
 * both endpoints with a positive effective base; `derived` otherwise.
 */
export function historicalAnnualReturnWithSource(
  entries: EntryDTO[]
): ReturnEstimate {
  if (entries.length < 6) {
    return { value: DEFAULT_ANNUAL_RETURN_PCT, source: "assumed" }
  }
  let sumR = 0
  let count = 0
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1].value
    const curr = entries[i].value
    // Skip months where either endpoint is missing — we can't compute a
    // monthly return without both endpoints.
    if (prev === null || curr === null) continue
    const inv = entries[i].invested
    const eff = prev + inv * 0.5
    if (eff <= 0) continue
    const r = (curr - prev - inv) / eff
    sumR += r
    count++
  }
  const monthly = count ? sumR / count : DEFAULT_MONTHLY_RETURN_FRACTION
  return {
    value: (Math.pow(1 + monthly, 12) - 1) * 100,
    source: count ? "derived" : "assumed",
  }
}

export function historicalAnnualReturn(entries: EntryDTO[]): number {
  return historicalAnnualReturnWithSource(entries).value
}

export type ProjectionPoint = {
  month: number
  value: number
  invested: number
  real: number
}

export function projectFuture(args: {
  startValue: number
  monthlySaving: number
  years: number
  annualReturn: number
  inflation?: number
}): ProjectionPoint[] {
  const { startValue, monthlySaving, years, annualReturn, inflation = 0 } = args
  const months = Math.round(years * 12)
  const r = annualReturn / 100 / 12
  const out: ProjectionPoint[] = []
  let v = startValue
  let invested = startValue
  for (let i = 1; i <= months; i++) {
    v = v * (1 + r) + monthlySaving
    invested += monthlySaving
    const real = inflation ? v / Math.pow(1 + inflation / 100 / 12, i) : v
    out.push({ month: i, value: v, invested, real })
  }
  return out
}

export function requiredMonthlyInvestment(args: {
  goalValue: number
  startValue: number
  years: number
  annualReturn: number
}): number {
  const { goalValue, startValue, years, annualReturn } = args
  const n = years * 12
  const r = annualReturn / 100 / 12
  const pow = Math.pow(1 + r, n)
  if (r === 0) return Math.max(0, (goalValue - startValue) / n)
  const pmt = ((goalValue - startValue * pow) * r) / (pow - 1)
  return Math.max(0, pmt)
}

// Legacy re-export — prefer importing from `@/lib/types` going forward.
export { COMBINED_PORTFOLIO_ID } from "@/lib/types"

/**
 * Resolve an event's amount in the requested basis. Gross = `amount` (the CSV
 * gross or the user's entered amount). Net = `amount + tax` (tax is stored
 * negative or 0).
 */
export function eventAmount(
  e: IncomeEventDTO,
  basis: DividendBasis = "gross"
): number {
  return basis === "gross" ? e.amount : e.amount + e.tax
}

function scopeEvents(
  events: IncomeEventDTO[],
  portfolioId: number | undefined,
  kind: IncomeKind | "all"
): IncomeEventDTO[] {
  const out: IncomeEventDTO[] = []
  for (const e of events) {
    if (
      portfolioId !== undefined &&
      portfolioId !== COMBINED_ID &&
      e.portfolioId !== portfolioId
    )
      continue
    if (kind !== "all" && e.kind !== kind) continue
    out.push(e)
  }
  return out
}

/**
 * Total income cash received for a portfolio (or all portfolios when
 * portfolioId is the combined sentinel 0 / undefined).
 */
export function totalIncome(
  events: IncomeEventDTO[],
  portfolioId?: number,
  kind: IncomeKind | "all" = "dividend",
  basis: DividendBasis = "gross"
): number {
  const scoped = scopeEvents(events, portfolioId, kind)
  return scoped.reduce((s, e) => s + eventAmount(e, basis), 0)
}

/**
 * Income totals indexed by `${year}-${month}` for a portfolio (or all
 * portfolios). Used by month-aligned visualisations.
 */
export function incomeByMonth(
  events: IncomeEventDTO[],
  portfolioId?: number,
  kind: IncomeKind | "all" = "dividend",
  basis: DividendBasis = "gross"
): Map<string, number> {
  const out = new Map<string, number>()
  const scoped = scopeEvents(events, portfolioId, kind)
  for (const e of scoped) {
    const year = parseInt(e.paidDate.slice(0, 4), 10)
    const month = parseInt(e.paidDate.slice(5, 7), 10)
    const key = `${year}-${month}`
    out.set(key, (out.get(key) ?? 0) + eventAmount(e, basis))
  }
  return out
}

export function aggregateIncomeByPeriod(
  events: IncomeEventDTO[],
  kind: IncomeKind | "all" = "dividend",
  basis: DividendBasis = "gross"
): IncomePeriodDTO[] {
  const map = new Map<string, IncomePeriodDTO>()
  const scoped = scopeEvents(events, undefined, kind)

  for (const e of scoped) {
    const year = parseInt(e.paidDate.slice(0, 4))
    const month = parseInt(e.paidDate.slice(5, 7))
    const key = `${year}-${month}`
    const amt = eventAmount(e, basis)

    if (!map.has(key)) {
      map.set(key, {
        year,
        month,
        label: labelFor(year, month),
        total: 0,
        cumulative: 0,
        breakdown: [],
      })
    }

    const period = map.get(key)!
    period.total += amt

    const breakdownKey = e.holdingId
    const existing = period.breakdown.find((b) => b.holdingId === breakdownKey)
    const sourceName =
      e.kind === "interest" ? "Interest" : (e.holdingName ?? "—")
    if (existing) {
      existing.amount += amt
    } else {
      period.breakdown.push({
        holdingId: breakdownKey,
        holdingName: sourceName,
        amount: amt,
      })
    }
  }

  const sorted = [...map.values()].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  )

  let running = 0
  for (const p of sorted) {
    running += p.total
    p.cumulative = Math.round(running)
    p.total = Math.round(p.total)
    for (const b of p.breakdown) b.amount = Math.round(b.amount)
  }

  return sorted
}

/**
 * Trailing-12-month income, anchored to `now` (default today) — NOT to the
 * latest event in `events`. Anchoring to data would reward a user for ceasing
 * to record payouts.
 */
export function trailing12mIncome(
  events: IncomeEventDTO[],
  portfolioId?: number,
  kind: IncomeKind | "all" = "dividend",
  basis: DividendBasis = "gross",
  now: Date = new Date()
): number {
  const cutoff = new Date(now)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const scoped = scopeEvents(events, portfolioId, kind)
  return scoped
    .filter((e) => e.paidDate >= cutoffIso)
    .reduce((s, e) => s + eventAmount(e, basis), 0)
}

export type YieldEstimate = {
  value: number
  source: "override" | "derived" | "fallback"
}

/**
 * Resolve a dividend yield % to use for portfolio-target math. Prefers the
 * user override if set, else derives from trailing-12m / portfolio value,
 * else falls back to 2.5% with a `fallback` label so the UI can disclose it.
 */
export function estimatedYield(args: {
  events: IncomeEventDTO[]
  portfolioValue: number
  override?: number | null
  portfolioId?: number
  basis?: DividendBasis
  now?: Date
}): YieldEstimate {
  const { events, portfolioValue, override, portfolioId, basis, now } = args
  if (override != null && override > 0) {
    return { value: override, source: "override" }
  }
  if (portfolioValue > 0) {
    const t12 = trailing12mIncome(
      events,
      portfolioId,
      "dividend",
      basis ?? "gross",
      now
    )
    if (t12 > 0) {
      return { value: (t12 / portfolioValue) * 100, source: "derived" }
    }
  }
  return { value: 2.5, source: "fallback" }
}

export type GoalEvaluation = {
  currentValue: number
  targetValue: number
  /** Inflation-adjusted target value in target-year money. Equals `target` for non-inflated goals. */
  inflatedTargetValue: number
  portfolioTargetValue: number
  pct: number
  projectedYear: number | null
  onTrack: boolean
  requiredMonthly: number
  expectedReturn: number
  /** Whether `expectedReturn` was derived from the scope's return history or
   * fell back to the 7% assumption. */
  expectedReturnSource: "derived" | "assumed"
  monthlySaving: number
  scopedKpiValue: number
  swrUsed?: number
  yieldUsed?: YieldEstimate
}

export type GoalEvaluationContext = {
  portfolios: PortfolioDTO[]
  incomeEvents: IncomeEventDTO[]
  settings: SettingsDTO
  monthlySaving: number
  now?: Date
}

const MAX_PROJECTION_MONTHS = 40 * 12

/**
 * Single source of truth for what every goal "looks like": current vs target
 * in the metric's units, the implied portfolio value, projection year, and
 * the required monthly contribution. Used by the goal strip, KPI tiles,
 * chart overlays, and solver workspace.
 *
 * Resolves scope first (combined vs single portfolio), uses scope-local
 * `historicalAnnualReturn` so per-portfolio goals don't inherit combined
 * volatility, and clamps `years` to avoid division cliffs on overdue goals.
 */
export function evaluateGoal(
  goal: GoalDTO,
  ctx: GoalEvaluationContext
): GoalEvaluation {
  const now = ctx.now ?? new Date()
  const currentYear = now.getFullYear()
  const basis = ctx.settings.dividendBasis

  const scoped =
    goal.scope === "portfolio" && goal.portfolioId != null
      ? (ctx.portfolios.find((p) => p.id === goal.portfolioId) ??
        aggregatePortfolios(ctx.portfolios))
      : aggregatePortfolios(ctx.portfolios)

  const K = computeKPIs(scoped)
  const expected = historicalAnnualReturnWithSource(scoped.entries)
  const expectedReturn = expected.value
  const years = Math.max(goal.targetYear - currentYear, 1 / 12)
  const scopedPortfolioId =
    goal.scope === "portfolio" ? (goal.portfolioId ?? undefined) : undefined

  let currentValue: number
  let targetValue: number
  let inflatedTargetValue: number
  let portfolioTargetValue: number
  let swrUsed: number | undefined
  let yieldUsed: YieldEstimate | undefined

  switch (goal.kind) {
    case "portfolio_value": {
      currentValue = K.value
      targetValue = goal.target
      inflatedTargetValue = goal.target
      portfolioTargetValue = goal.target
      break
    }
    case "annual_income": {
      const swr = goal.swr ?? ctx.settings.defaultSwr
      swrUsed = swr
      const infl = ctx.settings.inflation
      const inflatedTarget =
        goal.target * Math.pow(1 + infl / 100, Math.max(years, 0))
      currentValue = K.value * (swr / 100)
      targetValue = goal.target
      inflatedTargetValue = inflatedTarget
      portfolioTargetValue = inflatedTarget / (swr / 100)
      break
    }
    case "dividend_annual": {
      const y = estimatedYield({
        events: ctx.incomeEvents,
        portfolioValue: K.value,
        override: goal.yieldAssumed,
        portfolioId: scopedPortfolioId,
        basis,
        now,
      })
      yieldUsed = y
      currentValue = trailing12mIncome(
        ctx.incomeEvents,
        scopedPortfolioId,
        "dividend",
        basis,
        now
      )
      targetValue = goal.target
      inflatedTargetValue = goal.target
      portfolioTargetValue = goal.target / (y.value / 100)
      break
    }
    case "dividend_monthly": {
      const y = estimatedYield({
        events: ctx.incomeEvents,
        portfolioValue: K.value,
        override: goal.yieldAssumed,
        portfolioId: scopedPortfolioId,
        basis,
        now,
      })
      yieldUsed = y
      const t12 = trailing12mIncome(
        ctx.incomeEvents,
        scopedPortfolioId,
        "dividend",
        basis,
        now
      )
      currentValue = t12 / 12
      targetValue = goal.target
      inflatedTargetValue = goal.target
      portfolioTargetValue = (goal.target * 12) / (y.value / 100)
      break
    }
  }

  const pct = targetValue > 0 ? currentValue / targetValue : 0

  const requiredMonthly = requiredMonthlyInvestment({
    goalValue: portfolioTargetValue,
    startValue: K.value,
    years,
    annualReturn: expectedReturn,
  })

  let projectedYear: number | null = null
  if (K.value >= portfolioTargetValue) {
    projectedYear = currentYear
  } else {
    const r = expectedReturn / 100 / 12
    let v = K.value
    for (let m = 1; m <= MAX_PROJECTION_MONTHS; m++) {
      v = v * (1 + r) + ctx.monthlySaving
      if (v >= portfolioTargetValue) {
        projectedYear = currentYear + m / 12
        break
      }
    }
  }

  const onTrack =
    projectedYear !== null
      ? projectedYear <= goal.targetYear
      : currentValue >= targetValue

  return {
    currentValue,
    targetValue,
    inflatedTargetValue,
    portfolioTargetValue,
    pct,
    projectedYear,
    onTrack,
    requiredMonthly,
    expectedReturn,
    expectedReturnSource: expected.source,
    monthlySaving: ctx.monthlySaving,
    scopedKpiValue: K.value,
    swrUsed,
    yieldUsed,
  }
}

/**
 * Filter events to a single calendar month. Shared between the bar chart, the
 * heatmap, and the per-month detail popover so the filter logic lives in one
 * place.
 */
export function filterEventsByMonth(
  events: IncomeEventDTO[],
  year: number,
  month: number
): IncomeEventDTO[] {
  const out: IncomeEventDTO[] = []
  for (const e of events) {
    const ey = parseInt(e.paidDate.slice(0, 4), 10)
    const em = parseInt(e.paidDate.slice(5, 7), 10)
    if (ey === year && em === month) out.push(e)
  }
  return out
}

/**
 * Aggregate income events for a single (year, month) into one row per holding
 * (interest events rolled to a synthetic `holdingId: null` row). Sorted desc
 * by amount; ties broken by holdingId so output is deterministic for tests.
 */
export function aggregateIncomeByHoldingMonth(
  events: IncomeEventDTO[],
  year: number,
  month: number,
  basis: DividendBasis = "gross"
): Array<{
  holdingId: number | null
  holdingName: string
  kind: IncomeKind
  amount: number
  count: number
}> {
  const map = new Map<
    string,
    {
      holdingId: number | null
      holdingName: string
      kind: IncomeKind
      amount: number
      count: number
    }
  >()
  for (const e of events) {
    const ey = parseInt(e.paidDate.slice(0, 4), 10)
    const em = parseInt(e.paidDate.slice(5, 7), 10)
    if (ey !== year || em !== month) continue
    const key =
      e.kind === "interest" ? "interest" : `holding:${e.holdingId ?? "null"}`
    const row = map.get(key)
    const amt = eventAmount(e, basis)
    if (row) {
      row.amount += amt
      row.count += 1
    } else {
      map.set(key, {
        holdingId: e.kind === "interest" ? null : e.holdingId,
        holdingName:
          e.kind === "interest" ? "Interest" : (e.holdingName ?? "—"),
        kind: e.kind,
        amount: amt,
        count: 1,
      })
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount
    const aid = a.holdingId ?? Number.POSITIVE_INFINITY
    const bid = b.holdingId ?? Number.POSITIVE_INFINITY
    return aid - bid
  })
}

export type MonthSourceBucket = {
  year: number
  month: number
  /** `${year}-MM` — zero-padded month, matches the chart's bar keys. */
  key: string
  label: string
  total: number
  /**
   * Per-source amounts for the month, biggest first. `id` is the holding id
   * for dividends and the literal `"interest"` for interest — the same id
   * space the donut and per-holding table use, so a source maps to one color
   * everywhere.
   */
  sources: Array<{ id: number | "interest"; name: string; amount: number }>
}

/**
 * Per-month, per-source income breakdown across the whole event set — the data
 * a stacked-by-holding bar chart needs. Unlike `aggregateIncomeByHoldingMonth`
 * (single month) this spans every month present, sorted chronologically. No
 * top-N grouping is applied here; callers fold the long tail into "Others"
 * using a shared color map so grouping stays a presentation concern.
 */
export function aggregateIncomeByMonthSource(
  events: IncomeEventDTO[],
  basis: DividendBasis = "gross"
): MonthSourceBucket[] {
  const months = new Map<
    string,
    {
      year: number
      month: number
      sources: Map<
        number | "interest",
        { id: number | "interest"; name: string; amount: number }
      >
    }
  >()
  for (const e of events) {
    const year = parseInt(e.paidDate.slice(0, 4), 10)
    const month = parseInt(e.paidDate.slice(5, 7), 10)
    const key = `${year}-${String(month).padStart(2, "0")}`
    let bucket = months.get(key)
    if (!bucket) {
      bucket = { year, month, sources: new Map() }
      months.set(key, bucket)
    }
    const id: number | "interest" =
      e.kind === "interest" ? "interest" : (e.holdingId ?? -1)
    const name = e.kind === "interest" ? "Interest" : (e.holdingName ?? "—")
    const src = bucket.sources.get(id)
    const amt = eventAmount(e, basis)
    if (src) src.amount += amt
    else bucket.sources.set(id, { id, name, amount: amt })
  }
  return [...months.entries()]
    .map(([key, b]) => {
      const sources = [...b.sources.values()].sort(
        (a, c) => c.amount - a.amount
      )
      return {
        year: b.year,
        month: b.month,
        key,
        label: labelFor(b.year, b.month),
        total: sources.reduce((s, x) => s + x.amount, 0),
        sources,
      }
    })
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
}

/**
 * Infer payout cadence from the median day-gap between consecutive `paidDate`
 * values. Buckets: <45 monthly, <135 quarterly, <270 semi-annual, <540 annual,
 * else irregular. Returns "irregular" when fewer than 2 events exist.
 */
export function inferCadence(events: IncomeEventDTO[]): IncomeCadence {
  if (events.length < 2) return "irregular"
  const sorted = [...events].sort((a, b) => (a.paidDate < b.paidDate ? -1 : 1))
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = Date.parse(sorted[i - 1].paidDate)
    const curr = Date.parse(sorted[i].paidDate)
    const days = (curr - prev) / 86_400_000
    if (days > 0) gaps.push(days)
  }
  if (gaps.length === 0) return "irregular"
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const median =
    gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid]
  if (median < 45) return "monthly"
  if (median < 135) return "quarterly"
  if (median < 270) return "semi-annual"
  if (median < 540) return "annual"
  return "irregular"
}

/**
 * Top-N contributors by aggregated amount. Returns the leaders plus a synthetic
 * "Rest" row whose pct rolls up everything outside the top N. `topPct` is the
 * combined share of the named leaders.
 */
export function concentrationTop(
  events: IncomeEventDTO[],
  n: number,
  basis: DividendBasis = "gross"
): { topPct: number; leaders: Array<{ name: string; pct: number }> } {
  const slices = aggregateIncomeBySource(events, "all", basis)
  if (slices.length === 0) return { topPct: 0, leaders: [] }
  const head = slices.slice(0, n)
  const total = slices.reduce((s, sl) => s + sl.total, 0)
  const leaders = head.map((s) => ({
    name: s.name,
    pct: total > 0 ? (s.total / total) * 100 : 0,
  }))
  const topPct = leaders.reduce((s, l) => s + l.pct, 0)
  if (slices.length > n) {
    const restTotal = slices.slice(n).reduce((s, sl) => s + sl.total, 0)
    const restPct = total > 0 ? (restTotal / total) * 100 : 0
    leaders.push({ name: "Rest", pct: restPct })
  }
  return { topPct, leaders }
}

/**
 * Trailing-12 vs prior-12 income comparison, anchored on `now`. Both windows
 * are 365 days. Delta% guards against division by zero — clamps to 0 when the
 * prior window is empty.
 */
export function trailingYoYDelta(
  events: IncomeEventDTO[],
  portfolioId: number | undefined,
  kind: IncomeKind | "all",
  basis: DividendBasis = "gross",
  now: Date = new Date()
): { last12: number; prior12: number; deltaAbs: number; deltaPct: number } {
  const last12 = trailing12mIncome(events, portfolioId, kind, basis, now)
  const prior = new Date(now)
  prior.setFullYear(prior.getFullYear() - 1)
  const upper = prior.toISOString().slice(0, 10)
  const cutoff = new Date(prior)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const lower = cutoff.toISOString().slice(0, 10)
  const scoped = scopeEvents(events, portfolioId, kind)
  const prior12 = scoped
    .filter((e) => e.paidDate >= lower && e.paidDate < upper)
    .reduce((s, e) => s + eventAmount(e, basis), 0)
  const deltaAbs = last12 - prior12
  const deltaPct = prior12 > 0 ? (deltaAbs / prior12) * 100 : 0
  return { last12, prior12, deltaAbs, deltaPct }
}

/**
 * Bucket events into the trailing `months` calendar months ending on the
 * current month; returns one total per bucket for sparkline rendering.
 */
export function bucketEventsForSparkline(
  events: IncomeEventDTO[],
  months: number = 24,
  basis: DividendBasis = "gross",
  now: Date = new Date()
): number[] {
  const out = new Array(months).fill(0) as number[]
  const endYear = now.getFullYear()
  const endMonth = now.getMonth() + 1
  for (const e of events) {
    const y = parseInt(e.paidDate.slice(0, 4), 10)
    const m = parseInt(e.paidDate.slice(5, 7), 10)
    const offset = (endYear - y) * 12 + (endMonth - m)
    if (offset < 0 || offset >= months) continue
    const idx = months - 1 - offset
    out[idx] += eventAmount(e, basis)
  }
  return out
}

export function aggregateIncomeBySource(
  events: IncomeEventDTO[],
  kind: IncomeKind | "all" = "dividend",
  basis: DividendBasis = "gross"
): IncomeSliceDTO[] {
  const map = new Map<
    string,
    { rawTotal: number; slice: Omit<IncomeSliceDTO, "total" | "pct"> }
  >()
  const scoped = scopeEvents(events, undefined, kind)

  for (const e of scoped) {
    const key =
      e.kind === "interest" ? "interest" : `holding:${e.holdingId ?? "null"}`
    if (!map.has(key)) {
      map.set(key, {
        rawTotal: 0,
        slice: {
          holdingId: e.kind === "interest" ? null : e.holdingId,
          name: e.kind === "interest" ? "Interest" : (e.holdingName ?? "—"),
          type: e.holdingType,
        },
      })
    }
    map.get(key)!.rawTotal += eventAmount(e, basis)
  }

  const list = [...map.values()]
  const grandTotal = list.reduce((s, { rawTotal }) => s + rawTotal, 0)

  return list
    .map(({ slice, rawTotal }) => ({
      ...slice,
      total: Math.round(rawTotal),
      pct: grandTotal > 0 ? Math.round((rawTotal / grandTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
}
