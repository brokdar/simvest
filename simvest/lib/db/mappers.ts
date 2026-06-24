import "server-only"
import { labelFor, type PortfolioDTO } from "@/lib/types"
import type { Entry, Portfolio } from "./schema"

/**
 * Canonical row → DTO mapping for portfolios. Lives here (not inside
 * `queries.ts`) so the import route can reuse the exact same shape — any
 * future schema addition (`currency`, `inflationOverride`, …) only needs to
 * land in one place rather than drift across call sites.
 *
 * Callers pass already-fetched entry rows so the mapper stays pure and
 * cheap to call inside a `db.transaction(...)` block without re-querying.
 * Entries are sorted by `(year, month)` to match the DTO contract — the
 * caller is free to pre-sort if their query already does, the sort is
 * idempotent.
 */
export function portfolioRowToDTO(
  p: Portfolio,
  entryRows: Entry[]
): PortfolioDTO {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    targetMonthlyContribution: p.targetMonthlyContribution,
    startingValue: p.startingValue,
    startingDate: p.startingDate,
    entries: entryRows
      .slice()
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map((e) => ({
        id: e.id,
        year: e.year,
        month: e.month,
        day: e.day,
        label: labelFor(e.year, e.month),
        invested: e.invested,
        value: e.value,
        note: e.note,
      })),
  }
}
