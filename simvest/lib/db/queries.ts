import "server-only"
import { and, asc, eq } from "drizzle-orm"
import { db } from "./index"
import {
  portfolios,
  entries,
  goals,
  settings,
  holdings,
  dividendEvents,
} from "./schema"
import { ensureSeeded } from "./seed"
import { portfolioRowToDTO } from "./mappers"
import type {
  GoalDTO,
  GoalKind,
  GoalScope,
  PortfolioDTO,
  HoldingDTO,
  HoldingType,
  IncomeEventDTO,
  IncomeKind,
  SettingsDTO,
  DividendBasis,
  EntryDTO,
} from "@/lib/types"
import { labelFor } from "@/lib/types"
import { todayISO } from "@/lib/dates"

export type {
  EntryDTO,
  GoalDTO,
  GoalKind,
  GoalScope,
  PortfolioDTO,
  HoldingDTO,
  IncomeEventDTO,
  IncomeKind,
  SettingsDTO,
} from "@/lib/types"
export { labelFor } from "@/lib/types"

export async function getPortfolios(): Promise<PortfolioDTO[]> {
  await ensureSeeded()
  const ps = db.select().from(portfolios).orderBy(asc(portfolios.id)).all()
  const allEntries = db
    .select()
    .from(entries)
    .orderBy(asc(entries.portfolioId), asc(entries.year), asc(entries.month))
    .all()
  const byPortfolio = new Map<number, typeof allEntries>()
  for (const e of allEntries) {
    const list = byPortfolio.get(e.portfolioId)
    if (list) list.push(e)
    else byPortfolio.set(e.portfolioId, [e])
  }
  return ps.map((p) => portfolioRowToDTO(p, byPortfolio.get(p.id) ?? []))
}

export async function getGoals(): Promise<GoalDTO[]> {
  await ensureSeeded()
  const rows = db.select().from(goals).orderBy(asc(goals.id)).all()
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    kind: g.kind as GoalKind,
    scope: g.scope as GoalScope,
    portfolioId: g.portfolioId,
    target: g.target,
    targetYear: g.targetYear,
    swr: g.swr,
    yieldAssumed: g.yieldAssumed,
  }))
}

export async function getSettings(): Promise<SettingsDTO> {
  await ensureSeeded()
  let row = db.select().from(settings).where(eq(settings.id, 1)).get()
  if (!row) {
    row = db.insert(settings).values({ id: 1 }).returning().get()
  }
  return {
    id: row.id,
    inflation: row.inflation,
    conservativeReturn: row.conservativeReturn,
    optimisticReturn: row.optimisticReturn,
    monthlySaving: row.monthlySaving,
    horizonYears: row.horizonYears,
    defaultEntryDay: row.defaultEntryDay,
    defaultSwr: row.defaultSwr,
    dividendBasis: row.dividendBasis as DividendBasis,
    locale: row.locale,
  }
}

export async function getAllHoldings(): Promise<HoldingDTO[]> {
  await ensureSeeded()
  return db
    .select()
    .from(holdings)
    .orderBy(asc(holdings.portfolioId), asc(holdings.id))
    .all()
    .map((h) => ({
      id: h.id,
      portfolioId: h.portfolioId,
      name: h.name,
      type: h.type as HoldingType,
      isin: h.isin,
    }))
}

export async function getHoldingByIsin(
  portfolioId: number,
  isin: string
): Promise<HoldingDTO | undefined> {
  await ensureSeeded()
  const row = db
    .select()
    .from(holdings)
    .where(and(eq(holdings.portfolioId, portfolioId), eq(holdings.isin, isin)))
    .get()
  if (!row) return undefined
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    name: row.name,
    type: row.type as HoldingType,
    isin: row.isin,
  }
}

export async function getEntriesByMonth(
  portfolioId: number
): Promise<Map<string, EntryDTO>> {
  await ensureSeeded()
  const rows = db
    .select()
    .from(entries)
    .where(eq(entries.portfolioId, portfolioId))
    .all()
  const out = new Map<string, EntryDTO>()
  for (const e of rows) {
    out.set(`${e.year}-${e.month}`, {
      id: e.id,
      year: e.year,
      month: e.month,
      day: e.day,
      label: labelFor(e.year, e.month),
      invested: e.invested,
      value: e.value,
      note: e.note,
    })
  }
  return out
}

export async function getAllIncomeEvents(): Promise<IncomeEventDTO[]> {
  await ensureSeeded()
  const rows = db
    .select({
      id: dividendEvents.id,
      portfolioId: dividendEvents.portfolioId,
      holdingId: dividendEvents.holdingId,
      holdingName: holdings.name,
      holdingType: holdings.type,
      holdingIsin: holdings.isin,
      paidDate: dividendEvents.paidDate,
      amount: dividendEvents.amount,
      kind: dividendEvents.kind,
      tax: dividendEvents.tax,
      sourceBroker: dividendEvents.sourceBroker,
      sourceTransactionId: dividendEvents.sourceTransactionId,
      note: dividendEvents.note,
    })
    .from(dividendEvents)
    .leftJoin(holdings, eq(dividendEvents.holdingId, holdings.id))
    .orderBy(asc(dividendEvents.portfolioId), asc(dividendEvents.paidDate))
    .all()

  return rows.map((r) => ({
    id: r.id,
    portfolioId: r.portfolioId,
    holdingId: r.holdingId,
    holdingName: r.holdingName,
    holdingType: r.holdingType ? (r.holdingType as HoldingType) : null,
    holdingIsin: r.holdingIsin,
    paidDate: r.paidDate,
    amount: Math.round(r.amount * 100) / 100,
    kind: r.kind as IncomeKind,
    tax: Math.round(r.tax * 100) / 100,
    sourceBroker: r.sourceBroker,
    sourceTransactionId: r.sourceTransactionId,
    note: r.note,
  }))
}

export async function getInitialData() {
  const [portfolios, goals, settings, holdings, incomeEvents, selectedId] =
    await Promise.all([
      getPortfolios(),
      getGoals(),
      getSettings(),
      getAllHoldings(),
      getAllIncomeEvents(),
      readSelectedPortfolioCookie(),
    ])
  // SSR-anchored "today" so client and server agree on the trailing-12mo
  // cutoff. Consumers should treat it as the cutoff for any date math that
  // would otherwise call `new Date()` in render.
  const today = todayISO()
  return {
    portfolios,
    goals,
    settings,
    holdings,
    incomeEvents,
    selectedPortfolioId: selectedId,
    today,
  }
}

/**
 * The `simvest.selectedPortfolio` cookie is written by `DataProvider` on
 * change. Reading it here lets SSR render the user's chosen portfolio on
 * first paint — no Combined→user-picked flicker, no hydration mismatch.
 *
 * Tolerates being called outside a Next.js request scope (e.g. from
 * integration tests that import this module directly) by swallowing the
 * "cookies was called outside a request scope" runtime error and falling
 * back to `undefined` — equivalent to a request with no cookie set.
 */
async function readSelectedPortfolioCookie(): Promise<number | undefined> {
  try {
    const { cookies } = await import("next/headers")
    const store = await cookies()
    const raw = store.get("simvest.selectedPortfolio")?.value
    if (raw == null) return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  } catch {
    return undefined
  }
}
