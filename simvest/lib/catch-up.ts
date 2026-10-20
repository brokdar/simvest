import { lastValuedEntry } from "@/lib/calc"
import { resolveEntryDay } from "@/lib/dates"
import type { BatchEntryInput } from "@/lib/mutations"
import type { EntryDTO, PortfolioDTO } from "@/lib/types"

/**
 * The monthly catch-up (W2): every account on one screen with one value field,
 * saved as one batch. Pure helpers — the panel in
 * `components/entries-grid/catch-up-panel.tsx` renders them.
 */

export type MonthRef = { year: number; month: number }

export type CatchUpRow = {
  portfolio: PortfolioDTO
  /** Latest entry with a recorded value — "Last logged …". */
  lastValued: EntryDTO | null
  /** The entry already saved for the target month, if any. */
  existing: EntryDTO | null
  /** What "Added this month" starts at: the saved figure, else the plan. */
  defaultInvested: number
  /** What the value field starts at: the saved value, else empty. */
  defaultValue: number | null
  /** Day of month the entry is written for (Settings → entry day). */
  day: number
}

/** ISO date (YYYY-MM-DD) → its month. */
export function monthOf(isoDate: string): MonthRef {
  return {
    year: Number(isoDate.slice(0, 4)),
    month: Number(isoDate.slice(5, 7)),
  }
}

export function catchUpRows(
  portfolios: PortfolioDTO[],
  target: MonthRef,
  defaultEntryDay: string
): CatchUpRow[] {
  const day = resolveEntryDay(defaultEntryDay, target.year, target.month)
  return portfolios.map((p) => {
    const existing =
      p.entries.find(
        (e) => e.year === target.year && e.month === target.month
      ) ?? null
    return {
      portfolio: p,
      lastValued: lastValuedEntry(p.entries) ?? null,
      existing,
      defaultInvested: existing?.invested ?? p.targetMonthlyContribution,
      defaultValue: existing?.value ?? null,
      day: existing?.day ?? day,
    }
  })
}

/** What the user typed for one account; a missing key means "untouched". */
export type CatchUpInput = {
  value?: number | null
  invested?: number | null
}

/**
 * The rows worth sending: an account with a value typed in, skipping any that
 * would write exactly what is already saved. An empty value means "skip this
 * account" — never "write €0".
 */
export function buildCatchUpBatch(
  rows: CatchUpRow[],
  inputs: Record<number, CatchUpInput | undefined>,
  target: MonthRef
): BatchEntryInput[] {
  const out: BatchEntryInput[] = []
  for (const r of rows) {
    const input = inputs[r.portfolio.id]
    const value = input?.value !== undefined ? input.value : r.defaultValue
    if (value === null) continue
    // A cleared "Added" field means nothing went in this month.
    const invested =
      input?.invested !== undefined ? (input.invested ?? 0) : r.defaultInvested
    if (
      r.existing &&
      r.existing.value === value &&
      r.existing.invested === invested
    ) {
      continue
    }
    out.push({
      portfolioId: r.portfolio.id,
      year: target.year,
      month: target.month,
      day: r.day,
      invested,
      value,
      note: r.existing?.note ?? "",
    })
  }
  return out
}

/** An account that hasn't had a value for more than this month. */
export type CatchUpGap = {
  /** Accounts at least two months behind, most behind first. */
  accounts: Array<{ id: number; name: string; months: number }>
  /** The first month the most-behind account is missing — where to start. */
  firstMissing: MonthRef
  /** "Trade Republic is 6 months behind." / "… are behind — up to 6 months." */
  text: string
}

/**
 * Which accounts are several months behind `current` (P7 catch-up). The
 * form logs one month at a time, so it names how far back the gap goes and
 * where to start. One month behind is just this month's chore — not a gap.
 */
export function catchUpGap(
  rows: CatchUpRow[],
  current: MonthRef
): CatchUpGap | null {
  const cur = current.year * 12 + current.month - 1
  const accounts = rows
    .filter((r) => r.lastValued)
    .map((r) => ({
      id: r.portfolio.id,
      name: r.portfolio.name,
      months: cur - (r.lastValued!.year * 12 + r.lastValued!.month - 1),
    }))
    .filter((a) => a.months >= 2)
    .sort((a, b) => b.months - a.months || a.name.localeCompare(b.name))
  if (accounts.length === 0) return null
  const start = cur - accounts[0].months + 1
  const firstMissing = { year: Math.floor(start / 12), month: (start % 12) + 1 }
  const text =
    accounts.length === 1
      ? `${accounts[0].name} is ${accounts[0].months} months behind.`
      : `${accounts
          .slice(0, -1)
          .map((a) => a.name)
          .join(
            ", "
          )} and ${accounts.at(-1)!.name} are behind — up to ${accounts[0].months} months.`
  return { accounts, firstMissing, text }
}
