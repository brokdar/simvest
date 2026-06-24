import "server-only"
import { eq, like } from "drizzle-orm"
import { db } from "@/lib/db"
import { portfolioRowToDTO } from "@/lib/db/mappers"
import {
  portfolios as portfoliosT,
  entries as entriesT,
  holdings as holdingsT,
  dividendEvents as eventsT,
  goals as goalsT,
} from "@/lib/db/schema"
import type { PortfolioDTO } from "@/lib/types"
import type { TransferPortfolioFile, RestoreSummary } from "./types"

/**
 * Apply a (already-validated) transfer bundle as a brand-new portfolio.
 * Always creates — never merges. Name collisions are resolved by suffixing
 * " (imported)" (then " (imported N)" up to 99). `sourceBroker` and
 * `sourceTransactionId` are NULLed on every income event because the
 * partial unique index `dividend_events_source_idx` is global; preserving
 * them would collide with the source instance's own data on a same-instance
 * re-import.
 *
 * The function is **synchronous** by design — better-sqlite3 is synchronous
 * (CLAUDE.md: "`db.transaction(fn)` runs immediately") and any future
 * `await` introduced inside the transaction callback would commit before
 * the awaited promise resolves, defeating rollback-on-throw. Callers must
 * have already awaited `ensureSeeded()` (the two route handlers do).
 *
 * Name resolution runs **inside** the transaction so the read-then-write
 * is atomic: the user can confirm "Foo (imported)" in the preview step
 * without the commit step silently bumping the suffix because another
 * writer raced in between.
 */
export function restorePortfolio(
  file: TransferPortfolioFile,
  opts: { overrideName?: string } = {}
): { portfolio: PortfolioDTO; summary: RestoreSummary } {
  const desired = (opts.overrideName ?? file.portfolio.name).trim()
  if (desired.length === 0) {
    throw new Error("Portfolio name cannot be empty.")
  }

  let result: { portfolio: PortfolioDTO; summary: RestoreSummary } | null = null
  db.transaction((tx) => {
    // Atomically pick a non-colliding name. The SELECT here lives in the
    // same transaction as the INSERT below, so no concurrent writer can
    // race in between (better-sqlite3 serializes writes).
    const existingNames = tx
      .select({ name: portfoliosT.name })
      .from(portfoliosT)
      .where(like(portfoliosT.name, `${desired}%`))
      .all()
      .map((r) => r.name)
    const resolvedName = pickUniqueName(desired, new Set(existingNames))

    const newPortfolio = tx
      .insert(portfoliosT)
      .values({
        name: resolvedName,
        color: file.portfolio.color,
        targetMonthlyContribution: file.portfolio.targetMonthlyContribution,
        startingValue: file.portfolio.startingValue,
        startingDate: file.portfolio.startingDate,
        createdAt: file.portfolio.createdAt,
      })
      .returning()
      .get()
    const pid = newPortfolio.id

    // Holdings — inserted in file order so we can map holdingRef → new id
    // for the income events below. ISIN-less holdings round-trip via this
    // index, not via any natural key.
    const holdingIdByRef = new Map<number, number>()
    for (const h of file.holdings) {
      const row = tx
        .insert(holdingsT)
        .values({
          portfolioId: pid,
          name: h.name,
          type: h.type,
          isin: h.isin,
          createdAt: h.createdAt,
        })
        .returning()
        .get()
      holdingIdByRef.set(h.holdingRef, row.id)
    }

    const insertedEntries =
      file.entries.length > 0
        ? tx
            .insert(entriesT)
            .values(
              file.entries.map((e) => ({
                portfolioId: pid,
                year: e.year,
                month: e.month,
                day: e.day,
                invested: e.invested,
                value: e.value,
                note: e.note,
              }))
            )
            .returning()
            .all()
        : []

    let dividends = 0
    let interest = 0
    if (file.incomeEvents.length > 0) {
      tx.insert(eventsT)
        .values(
          file.incomeEvents.map((ev) => {
            if (ev.kind === "dividend") dividends++
            else interest++
            return {
              portfolioId: pid,
              holdingId:
                ev.holdingRef === null
                  ? null
                  : (holdingIdByRef.get(ev.holdingRef) ?? null),
              paidDate: ev.paidDate,
              amount: ev.amount,
              kind: ev.kind,
              tax: ev.tax,
              // Source provenance is intentionally dropped — see file header.
              sourceBroker: null,
              sourceTransactionId: null,
              note: ev.note,
              createdAt: ev.createdAt,
            }
          })
        )
        .run()
    }

    if (file.goals.length > 0) {
      tx.insert(goalsT)
        .values(
          file.goals.map((g) => ({
            name: g.name,
            color: g.color,
            kind: g.kind,
            scope: "portfolio" as const,
            portfolioId: pid,
            target: g.target,
            targetYear: g.targetYear,
            swr: g.swr,
            yieldAssumed: g.yieldAssumed,
            createdAt: g.createdAt,
          }))
        )
        .run()
    }

    const summary: RestoreSummary = {
      newPortfolioId: pid,
      resolvedName,
      entriesCreated: file.entries.length,
      holdingsCreated: file.holdings.length,
      dividendsCreated: dividends,
      interestCreated: interest,
      goalsCreated: file.goals.length,
    }
    result = {
      portfolio: portfolioRowToDTO(newPortfolio, insertedEntries),
      summary,
    }
  })

  if (!result) {
    throw new Error("Restore transaction did not produce a result.")
  }
  return result
}

/**
 * Suffix-bump a desired name until it isn't in `existing`. Pure function —
 * the SELECT that builds `existing` lives at the call site so the same
 * helper can serve both the preview path (read-only against `db`) and the
 * commit path (inside the txn against `tx`).
 *
 * Caps at " (imported 99)" then falls back to a timestamp (effectively
 * never reached for a single-user app).
 */
function pickUniqueName(desired: string, existing: Set<string>): string {
  if (!existing.has(desired)) return desired
  for (let i = 1; i <= 99; i++) {
    const candidate =
      i === 1 ? `${desired} (imported)` : `${desired} (imported ${i})`
    if (!existing.has(candidate)) return candidate
  }
  return `${desired} (imported ${Date.now()})`
}

/**
 * Preview-only helper. Same resolution rule as the commit path, but reads
 * are unsynchronized — the answer is advisory. The commit endpoint repeats
 * the resolution atomically inside its own transaction, so a race here
 * cannot produce a duplicate name; the worst case is a "Renamed…" hint
 * that the commit then re-renames once more (still surfaced via the
 * summary card's `resolvedName`).
 *
 * The `collidedWithExistingName` flag therefore describes the *preview's*
 * read of the world, not the eventual commit outcome — for a single-user
 * app the divergence window is theoretical. If we ever ship a multi-user
 * mode, surface the final `resolvedName` back to the dialog after commit
 * (or move the hint to the summary card) so the user never sees a
 * "Renamed…" prediction that turns out to be wrong.
 */
export function previewResolvedName(desired: string): {
  resolvedName: string
  collidedWithExistingName: boolean
} {
  const trimmed = desired.trim()
  const exact = db
    .select({ name: portfoliosT.name })
    .from(portfoliosT)
    .where(eq(portfoliosT.name, trimmed))
    .get()
  if (!exact) {
    return { resolvedName: trimmed, collidedWithExistingName: false }
  }
  const existing = db
    .select({ name: portfoliosT.name })
    .from(portfoliosT)
    .where(like(portfoliosT.name, `${trimmed}%`))
    .all()
    .map((r) => r.name)
  const resolved = pickUniqueName(trimmed, new Set(existing))
  return { resolvedName: resolved, collidedWithExistingName: true }
}
