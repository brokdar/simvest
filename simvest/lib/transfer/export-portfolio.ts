import "server-only"
import { and, asc, count, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ensureSeeded } from "@/lib/db/seed"
import {
  portfolios as portfoliosT,
  entries as entriesT,
  holdings as holdingsT,
  dividendEvents as eventsT,
  goals as goalsT,
} from "@/lib/db/schema"
import { round2 } from "@/lib/calc"
import type { GoalKind, HoldingType, IncomeKind } from "@/lib/types"
import {
  TRANSFER_FILE_KIND,
  TRANSFER_FILE_VERSION,
  type TransferPortfolioFile,
} from "./types"
import pkg from "../../package.json"

export type ExportResult =
  | { ok: true; file: TransferPortfolioFile }
  | { ok: false; status: 404; error: string }

/**
 * Build the v1 transfer bundle for a single portfolio. Combined goals are
 * intentionally excluded — the destination instance has its own combined
 * scope and would either merge or reject them; both options are worse than
 * leaving them out and surfacing a warning in the preview.
 *
 * Monetary fields are rounded to cents at the boundary so the file doesn't
 * carry float drift across instances. `entries.value` is preserved as null
 * verbatim (null means "user hasn't recorded a month-end value yet" — not 0).
 */
export async function exportPortfolio(
  portfolioId: number
): Promise<ExportResult> {
  await ensureSeeded()

  const p = db
    .select()
    .from(portfoliosT)
    .where(eq(portfoliosT.id, portfolioId))
    .get()
  if (!p) return { ok: false, status: 404, error: "portfolio not found" }

  const entryRows = db
    .select()
    .from(entriesT)
    .where(eq(entriesT.portfolioId, portfolioId))
    .orderBy(asc(entriesT.year), asc(entriesT.month))
    .all()

  const holdingRows = db
    .select()
    .from(holdingsT)
    .where(eq(holdingsT.portfolioId, portfolioId))
    .orderBy(asc(holdingsT.createdAt), asc(holdingsT.id))
    .all()

  const eventRows = db
    .select()
    .from(eventsT)
    .where(eq(eventsT.portfolioId, portfolioId))
    .orderBy(asc(eventsT.paidDate), asc(eventsT.id))
    .all()

  // Only portfolio-scoped goals travel. Combined goals are surfaced as a
  // count for the preview warning, never exported.
  const portfolioGoalRows = db
    .select()
    .from(goalsT)
    .where(
      and(eq(goalsT.scope, "portfolio"), eq(goalsT.portfolioId, portfolioId))
    )
    .orderBy(asc(goalsT.createdAt), asc(goalsT.id))
    .all()

  // Count-only — feeds `meta.combinedGoalsExcluded` so the importing
  // instance can surface a warning. Use `count()` rather than `.all().length`
  // to skip materializing rows we only need a tally of.
  const combinedGoalsExcluded =
    db
      .select({ n: count() })
      .from(goalsT)
      .where(eq(goalsT.scope, "combined"))
      .get()?.n ?? 0

  const holdingIdxById = new Map<number, number>()
  holdingRows.forEach((h, i) => holdingIdxById.set(h.id, i))

  const file: TransferPortfolioFile = {
    version: TRANSFER_FILE_VERSION,
    kind: TRANSFER_FILE_KIND,
    exportedAt: new Date().toISOString(),
    sourceAppVersion: (pkg as { version?: string }).version ?? "0.0.0",
    portfolio: {
      name: p.name,
      color: p.color,
      targetMonthlyContribution: round2(p.targetMonthlyContribution),
      startingValue: round2(p.startingValue),
      startingDate: p.startingDate,
      createdAt: p.createdAt,
    },
    entries: entryRows.map((e) => ({
      year: e.year,
      month: e.month,
      day: e.day,
      invested: round2(e.invested),
      value: e.value === null ? null : round2(e.value),
      note: e.note,
    })),
    holdings: holdingRows.map((h, i) => ({
      holdingRef: i,
      name: h.name,
      type: h.type as HoldingType,
      isin: h.isin,
      createdAt: h.createdAt,
    })),
    incomeEvents: eventRows.map((ev) => ({
      holdingRef:
        ev.holdingId === null
          ? null
          : (holdingIdxById.get(ev.holdingId) ?? null),
      paidDate: ev.paidDate,
      amount: round2(ev.amount),
      kind: ev.kind as IncomeKind,
      tax: round2(ev.tax),
      note: ev.note,
      createdAt: ev.createdAt,
    })),
    goals: portfolioGoalRows.map((g) => ({
      name: g.name,
      color: g.color,
      kind: g.kind as GoalKind,
      targetYear: g.targetYear,
      target: round2(g.target),
      swr: g.swr,
      yieldAssumed: g.yieldAssumed,
      createdAt: g.createdAt,
    })),
    ...(combinedGoalsExcluded > 0 ? { meta: { combinedGoalsExcluded } } : {}),
  }

  return { ok: true, file }
}
