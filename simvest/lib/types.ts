import { fmtMonth } from "@/lib/dates"

export type EntryDTO = {
  id: number
  year: number
  month: number
  day: number
  label: string
  invested: number
  /** Month-end portfolio value. `null` means the user hasn't recorded one
   *  yet (e.g. a broker-imported month before manual valuation). Consumers
   *  must treat null as "missing data", not 0. */
  value: number | null
  note: string
}

export type PortfolioDTO = {
  id: number
  name: string
  color: string
  targetMonthlyContribution: number
  /** False until the user writes a contribution (even 0). Lets the UI tell
   *  "never set" from a deliberate EUR 0. */
  contributionSet: boolean
  startingValue: number
  startingDate: string | null
  entries: EntryDTO[]
}

export type GoalKind =
  | "portfolio_value"
  | "annual_income"
  | "dividend_annual"
  | "dividend_monthly"

export type GoalScope = "combined" | "portfolio"

export const GOAL_KINDS: GoalKind[] = [
  "portfolio_value",
  "annual_income",
  "dividend_annual",
  "dividend_monthly",
]

export const GOAL_SCOPES: GoalScope[] = ["combined", "portfolio"]

export type GoalDTO = {
  id: number
  name: string
  color: string
  kind: GoalKind
  scope: GoalScope
  portfolioId: number | null
  target: number
  targetYear: number
  swr: number | null
  yieldAssumed: number | null
  /**
   * Expected annual return % for this goal's projection. Null = use the
   * scope's own historical return (or the 7% assumption without history).
   */
  returnAssumed: number | null
}

export type DividendBasis = "net" | "gross"

/**
 * C9: what net / gross mean, in words — the toggle and every "(net)" label
 * say "after tax" / "before tax" so nobody has to know the jargon.
 */
export const BASIS_LABEL: Record<DividendBasis, string> = {
  net: "after tax",
  gross: "before tax",
}

export const DIVIDEND_BASES: DividendBasis[] = ["net", "gross"]

export type SettingsDTO = {
  id: number
  inflation: number
  conservativeReturn: number
  optimisticReturn: number
  monthlySaving: number
  horizonYears: number
  defaultEntryDay: string
  defaultSwr: number
  dividendBasis: DividendBasis
  /**
   * BCP-47 locale tag (e.g. "en-US", "de-DE") that drives both money input
   * parsing (which decimal separator the user types) and money display
   * formatting. `null` = "auto" — resolve against `navigator.language` on
   * the client. Set explicitly via the Number format control in Settings.
   */
  locale: string | null
}

export type HoldingType = "stock" | "etf" | "bond" | "other"

export const HOLDING_TYPES: HoldingType[] = ["stock", "etf", "bond", "other"]

export type HoldingDTO = {
  id: number
  portfolioId: number
  name: string
  type: HoldingType
  isin: string | null
}

export type IncomeKind = "dividend" | "interest"

export const INCOME_KINDS: IncomeKind[] = ["dividend", "interest"]

export type IncomeEventDTO = {
  id: number
  portfolioId: number
  // null when kind === 'interest' (broker-paid interest with no holding)
  holdingId: number | null
  holdingName: string | null
  holdingType: HoldingType | null
  holdingIsin: string | null
  paidDate: string
  kind: IncomeKind
  amount: number
  tax: number
  note: string
  sourceBroker: string | null
  sourceTransactionId: string | null
}

export type PortfolioPatch = Partial<
  Pick<
    PortfolioDTO,
    | "name"
    | "color"
    | "targetMonthlyContribution"
    | "startingValue"
    | "startingDate"
  >
>

export type HoldingPatch = Partial<Pick<HoldingDTO, "name" | "type" | "isin">>

export type IncomeEventPatch = Partial<
  Pick<
    IncomeEventDTO,
    "paidDate" | "amount" | "tax" | "note" | "holdingId" | "kind"
  >
>

/**
 * Sentinel id used for the aggregated "Combined" virtual portfolio.
 * Real portfolios have positive ids from SQLite autoincrement; 0 is unused there.
 */
export const COMBINED_PORTFOLIO_ID = 0

export function isCombinedId(id: number): boolean {
  return id === COMBINED_PORTFOLIO_ID
}

/**
 * ISO 6166 ISIN format: two-letter country code, nine alphanumerics,
 * one check digit. Shared between the parser, the holdings API, and
 * the holding editor so a single edit changes validation everywhere.
 */
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/

/**
 * Pick a usable default portfolio id when an editor opens. Falls back
 * to the first real portfolio when the caller is showing the combined
 * sentinel (which is not a real portfolio).
 */
export function resolveDefaultPortfolio(
  defaultId: number | undefined,
  fallback: number
): number {
  if (defaultId != null && defaultId !== COMBINED_PORTFOLIO_ID) return defaultId
  return fallback
}

export type IncomePeriodDTO = {
  year: number
  month: number
  label: string
  total: number
  cumulative: number
  breakdown: { holdingId: number | null; holdingName: string; amount: number }[]
}

export type IncomeSliceDTO = {
  holdingId: number | null
  name: string
  type: HoldingType | null
  total: number
  pct: number
}

export type IncomeCadence =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semi-annual"
  | "annual"
  | "irregular"
  | "single"

/**
 * C10: "one data point" and "pays on no fixed schedule" are different
 * things, so they get different words — the old "Irregular" covered both.
 */
export const CADENCE_LABEL: Record<IncomeCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  "semi-annual": "Twice a year",
  annual: "Yearly",
  irregular: "No fixed schedule",
  single: "Just one so far",
}

/** One sentence per cadence, for the chip's tooltip. */
export const CADENCE_HINT: Record<IncomeCadence, string> = {
  daily: "Pays out (almost) every day — typical for interest.",
  weekly: "Pays out about once a week.",
  monthly: "Pays out about once a month.",
  quarterly: "Pays out about every three months.",
  "semi-annual": "Pays out about every six months.",
  annual: "Pays out about once a year.",
  irregular:
    "Payouts so far don’t follow a regular rhythm — the gaps between them vary a lot.",
  single:
    "Only one payout recorded so far — the rhythm shows once there’s a second.",
}

export const INCOME_HOLDING_PARAM = "holding"

/**
 * The month label carried on every `EntryDTO.label` (and the API's `label`
 * field). Delegates to `fmtMonth`, so it is the one app-wide month format:
 * "Apr ’26". Nothing parses it back — `year` / `month` are the data.
 */
export function labelFor(year: number, month: number) {
  return fmtMonth(year, month)
}

/** What the About & data card shows a self-hoster (C12). */
export type AboutInfo = {
  version: string
  dbPath: string
  /** Main file plus its write-ahead log, in bytes; null for :memory:. */
  dbBytes: number | null
  counts: {
    portfolios: number
    entries: number
    holdings: number
    incomeEvents: number
    goals: number
  }
}
