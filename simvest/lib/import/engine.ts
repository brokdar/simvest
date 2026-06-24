import "server-only"

import { createHash } from "node:crypto"
import { and, eq, isNotNull, inArray } from "drizzle-orm"
import { db as defaultDb } from "@/lib/db"
import {
  dividendEvents,
  entries as entriesTable,
  holdings,
  portfolios,
} from "@/lib/db/schema"
import { round2 } from "@/lib/calc"
import { daysInMonth } from "@/lib/dates"
import { getParser, isKnownBroker } from "./registry"
import type {
  BrokerId,
  BrokerParseResult,
  BrokerParser,
  ImportApplied,
  ImportDecisions,
  ImportPreview,
  ImportPreviewHolding,
  ImportPreviewIncome,
  ImportPreviewMonth,
} from "./types"

const PARSE_CACHE_TTL_MS = 30 * 60 * 1000
const MAX_PREVIEW_INCOME = 2000

/**
 * Narrow contract the engine relies on — only the Drizzle methods the engine
 * actually calls, not the full `db` shape. Tests pass a real Drizzle client
 * (a `:memory:` one) that trivially satisfies this. If we ever swap the
 * driver (libsql / postgres-js / etc.), the engine's surface — and the test
 * doubles needed — stay limited to this set.
 */
export type EngineDb = Pick<
  typeof defaultDb,
  "select" | "insert" | "update" | "delete" | "transaction"
>

export type PreviewResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; status: number; error: string }

export type ApplyResult =
  | { ok: true; applied: ImportApplied }
  | { ok: false; status: number; error: string }

export type ImportEngine = {
  previewImport(input: {
    broker: unknown
    portfolioId: unknown
    csv: unknown
  }): PreviewResult
  applyImport(input: {
    broker: unknown
    portfolioId: unknown
    csv: unknown
    decisions: unknown
  }): ApplyResult
}

type Context = {
  broker: BrokerId
  portfolioId: number
  parser: BrokerParser
  existingByMonth: Map<string, typeof entriesTable.$inferSelect>
  holdingsByIsin: Map<
    string,
    { id: number; isin: string | null; name: string; type: string }
  >
}

type LoadResult =
  | { ok: true; ctx: Context }
  | { ok: false; status: number; error: string }

type ParseCacheEntry = { parsed: BrokerParseResult; expiresAt: number }

declare global {
  var __simvestParseCache: Map<string, ParseCacheEntry> | undefined
}

export function createImportEngine(
  database: EngineDb = defaultDb
): ImportEngine {
  // Each engine carries its own cache. The default singleton pins the cache to
  // globalThis so it survives HMR; tests that build their own engine start fresh.
  const cache: Map<string, ParseCacheEntry> =
    database === defaultDb
      ? (globalThis.__simvestParseCache ??= new Map())
      : new Map()

  function parseWithCache(
    broker: string,
    csv: string,
    parser: BrokerParser
  ): BrokerParseResult {
    const key = createHash("sha256")
      .update(broker)
      .update("\0")
      .update(csv)
      .digest("hex")
    const now = Date.now()
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k)
    }
    const hit = cache.get(key)
    if (hit) {
      hit.expiresAt = now + PARSE_CACHE_TTL_MS
      return hit.parsed
    }
    const parsed = parser.parse(csv)
    cache.set(key, { parsed, expiresAt: now + PARSE_CACHE_TTL_MS })
    return parsed
  }

  function loadContext(input: {
    broker: unknown
    portfolioId: unknown
  }): LoadResult {
    const broker = String(input.broker ?? "")
    if (!isKnownBroker(broker)) {
      return { ok: false, status: 400, error: `Unknown broker "${broker}"` }
    }
    const portfolioId = Number(input.portfolioId)
    if (!Number.isFinite(portfolioId)) {
      return { ok: false, status: 400, error: "portfolioId is required" }
    }
    const portfolio = database
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, portfolioId))
      .get()
    if (!portfolio) {
      return { ok: false, status: 404, error: "portfolio not found" }
    }

    const existing = database
      .select()
      .from(entriesTable)
      .where(eq(entriesTable.portfolioId, portfolioId))
      .all()
    const existingByMonth = new Map<string, typeof entriesTable.$inferSelect>()
    for (const e of existing) {
      existingByMonth.set(`${e.year}-${e.month}`, e)
    }

    const existingHoldings = database
      .select({
        id: holdings.id,
        isin: holdings.isin,
        name: holdings.name,
        type: holdings.type,
      })
      .from(holdings)
      .where(eq(holdings.portfolioId, portfolioId))
      .all()
    const holdingsByIsin = new Map<string, (typeof existingHoldings)[number]>()
    for (const h of existingHoldings) {
      if (h.isin) holdingsByIsin.set(h.isin, h)
    }

    return {
      ok: true,
      ctx: {
        broker: broker as BrokerId,
        portfolioId,
        parser: getParser(broker as BrokerId),
        existingByMonth,
        holdingsByIsin,
      },
    }
  }

  function loadImportedTransactionIds(
    broker: string,
    candidateIds: string[]
  ): Set<string> {
    if (candidateIds.length === 0) return new Set()
    const rows = database
      .select({ sourceTransactionId: dividendEvents.sourceTransactionId })
      .from(dividendEvents)
      .where(
        and(
          eq(dividendEvents.sourceBroker, broker),
          isNotNull(dividendEvents.sourceTransactionId),
          inArray(dividendEvents.sourceTransactionId, candidateIds)
        )
      )
      .all()
    const out = new Set<string>()
    for (const r of rows) {
      if (r.sourceTransactionId) out.add(r.sourceTransactionId)
    }
    return out
  }

  function previewImport(input: {
    broker: unknown
    portfolioId: unknown
    csv: unknown
  }): PreviewResult {
    const loaded = loadContext(input)
    if (!loaded.ok) return loaded
    const ctx = loaded.ctx

    const csv = typeof input.csv === "string" ? input.csv : ""
    if (!csv.trim()) {
      return { ok: false, status: 400, error: "csv is required" }
    }

    const parsed = parseWithCache(ctx.broker, csv, ctx.parser)

    if (
      parsed.errors.length &&
      parsed.monthsAggregated.length === 0 &&
      parsed.income.length === 0
    ) {
      return {
        ok: false,
        status: 400,
        error: parsed.errors.join("; "),
      }
    }

    const candidateIds = parsed.income.map((e) => e.sourceTransactionId)
    const importedIds = loadImportedTransactionIds(ctx.broker, candidateIds)

    const months: ImportPreviewMonth[] = parsed.monthsAggregated.map((m) => {
      const existing = ctx.existingByMonth.get(`${m.year}-${m.month}`)
      const deposits = round2(m.deposits)
      return {
        year: m.year,
        month: m.month,
        newInvested: deposits,
        currentInvested: existing ? Math.round(existing.invested) : 0,
        newValue: m.value != null ? round2(m.value) : null,
        currentValue:
          existing && existing.value != null ? existing.value : null,
        sourceTransactionIds: m.sourceTransactionIds,
        breakdown: { deposits },
      }
    })

    const warnings = [...parsed.warnings]
    let incomeList = parsed.income
    if (incomeList.length > MAX_PREVIEW_INCOME) {
      warnings.push(
        `Income events truncated to first ${MAX_PREVIEW_INCOME} of ${incomeList.length} — split the export into smaller files.`
      )
      incomeList = incomeList.slice(0, MAX_PREVIEW_INCOME)
    }

    const incomeEvents: ImportPreviewIncome[] = incomeList.map((e) => ({
      kind: e.kind,
      isin: e.isin,
      holdingName: e.holdingName,
      paidDate: e.paidDate,
      amount: round2(e.amount),
      tax: round2(e.tax),
      sourceTransactionId: e.sourceTransactionId,
      alreadyImported: importedIds.has(e.sourceTransactionId),
    }))

    const holdingsList: ImportPreviewHolding[] = parsed.holdingsCandidates.map(
      (h) => ({
        isin: h.isin,
        name: h.name,
        type: h.type,
        exists: ctx.holdingsByIsin.has(h.isin),
      })
    )

    return {
      ok: true,
      preview: {
        months,
        incomeEvents,
        holdings: holdingsList,
        warnings,
        errors: parsed.errors,
      },
    }
  }

  function applyImport(input: {
    broker: unknown
    portfolioId: unknown
    csv: unknown
    decisions: unknown
  }): ApplyResult {
    const loaded = loadContext(input)
    if (!loaded.ok) return loaded
    const ctx = loaded.ctx

    const csv = typeof input.csv === "string" ? input.csv : ""
    if (!csv.trim()) {
      return { ok: false, status: 400, error: "csv is required" }
    }

    const rawDecisions = input.decisions as ImportDecisions | undefined
    if (!rawDecisions || !Array.isArray(rawDecisions.months)) {
      return {
        ok: false,
        status: 400,
        error: "decisions.months is required",
      }
    }
    const decisions = rawDecisions

    const parsed = parseWithCache(ctx.broker, csv, ctx.parser)
    const warnings: string[] = [...parsed.warnings]

    const monthActions = new Map<string, "replace" | "skip">()
    for (const d of decisions.months) {
      monthActions.set(`${d.year}-${d.month}`, d.action)
    }

    const candidateIds = parsed.income.map((e) => e.sourceTransactionId)
    const importedIds = loadImportedTransactionIds(ctx.broker, candidateIds)

    let entriesUpserted = 0
    let holdingsCreated = 0
    let dividendsInserted = 0
    let interestInserted = 0
    let duplicatesSkipped = 0

    try {
      database.transaction((tx) => {
        for (const m of parsed.monthsAggregated) {
          const key = `${m.year}-${m.month}`
          const action = monthActions.get(key) ?? "skip"
          if (action !== "replace") continue
          const existing = ctx.existingByMonth.get(key)
          const invested = round2(m.deposits)
          // Only brokers that report a running balance (Bondora) carry a
          // value; Trade Republic leaves it null and the user backfills.
          const hasValue = m.value != null
          const value = hasValue ? round2(m.value as number) : null
          if (existing) {
            tx.update(entriesTable)
              .set(hasValue ? { invested, value } : { invested })
              .where(eq(entriesTable.id, existing.id))
              .run()
            entriesUpserted++
          } else {
            tx.insert(entriesTable)
              .values({
                portfolioId: ctx.portfolioId,
                year: m.year,
                month: m.month,
                day: daysInMonth(m.year, m.month),
                invested,
                value,
                note: "",
              })
              .run()
            entriesUpserted++
          }
        }

        if (decisions.importHoldings && parsed.holdingsCandidates.length > 0) {
          const toInsert = parsed.holdingsCandidates.filter(
            (h) => !ctx.holdingsByIsin.has(h.isin)
          )
          if (toInsert.length > 0) {
            const created = tx
              .insert(holdings)
              .values(
                toInsert.map((h) => ({
                  portfolioId: ctx.portfolioId,
                  name: h.name,
                  type: h.type,
                  isin: h.isin,
                }))
              )
              .returning()
              .all()
            for (const row of created) {
              if (row.isin) ctx.holdingsByIsin.set(row.isin, row)
            }
            holdingsCreated = created.length
          }
        }

        const dividendValues: (typeof dividendEvents.$inferInsert)[] = []
        const interestValues: (typeof dividendEvents.$inferInsert)[] = []
        const seenInBatch = new Set<string>()

        for (const e of parsed.income) {
          if (importedIds.has(e.sourceTransactionId)) {
            duplicatesSkipped++
            continue
          }
          if (seenInBatch.has(e.sourceTransactionId)) {
            duplicatesSkipped++
            continue
          }
          seenInBatch.add(e.sourceTransactionId)

          if (e.kind === "dividend") {
            if (!decisions.importDividends) continue
            const holding = e.isin ? ctx.holdingsByIsin.get(e.isin) : undefined
            if (!holding) {
              warnings.push(
                `Skipped dividend for ${e.holdingName ?? e.isin ?? "unknown"} on ${e.paidDate}: no matching holding in portfolio`
              )
              continue
            }
            dividendValues.push({
              holdingId: holding.id,
              portfolioId: ctx.portfolioId,
              paidDate: e.paidDate,
              amount: e.amount,
              kind: "dividend",
              tax: e.tax,
              sourceBroker: ctx.broker,
              sourceTransactionId: e.sourceTransactionId,
              note: "",
            })
          } else {
            if (!decisions.importInterest) continue
            interestValues.push({
              holdingId: null,
              portfolioId: ctx.portfolioId,
              paidDate: e.paidDate,
              amount: e.amount,
              kind: "interest",
              tax: e.tax,
              sourceBroker: ctx.broker,
              sourceTransactionId: e.sourceTransactionId,
              note: "",
            })
          }
        }

        if (dividendValues.length > 0) {
          const inserted = tx
            .insert(dividendEvents)
            .values(dividendValues)
            .onConflictDoNothing()
            .returning({ id: dividendEvents.id })
            .all()
          dividendsInserted = inserted.length
          duplicatesSkipped += dividendValues.length - inserted.length
        }
        if (interestValues.length > 0) {
          const inserted = tx
            .insert(dividendEvents)
            .values(interestValues)
            .onConflictDoNothing()
            .returning({ id: dividendEvents.id })
            .all()
          interestInserted = inserted.length
          duplicatesSkipped += interestValues.length - inserted.length
        }
      })
    } catch (err) {
      return {
        ok: false,
        status: 500,
        error:
          err instanceof Error
            ? `Import failed: ${err.message}`
            : "Import failed",
      }
    }

    return {
      ok: true,
      applied: {
        entriesUpserted,
        holdingsCreated,
        dividendsInserted,
        interestInserted,
        duplicatesSkipped,
        warnings,
      },
    }
  }

  return { previewImport, applyImport }
}

/**
 * The shared engine used by route handlers. Tests can build their own via
 * `createImportEngine(db)` to keep parse-cache state isolated per suite.
 */
export const importEngine: ImportEngine = createImportEngine()
