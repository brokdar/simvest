import type { Dispatch, SetStateAction } from "react"
import type {
  EntryDTO,
  GoalDTO,
  HoldingDTO,
  HoldingPatch,
  HoldingType,
  IncomeEventDTO,
  IncomeEventPatch,
  IncomeKind,
  PortfolioDTO,
  SettingsDTO,
} from "@/lib/types"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"
import type { ImportApplied, ImportDecisions } from "@/lib/import/types"
import type { RestoreSummary, TransferPreview } from "@/lib/transfer/types"
import type { FetchAdapter } from "./mutations/fetch-adapter"

export type MutationDeps = {
  fetch: FetchAdapter
  /**
   * Read-only accessors used by optimistic deletes to snapshot the affected
   * record (and only that record) before mutating. Provider backs these by
   * refs that track the latest state so callbacks stay referentially stable.
   */
  getPortfolios: () => PortfolioDTO[]
  getGoals: () => GoalDTO[]
  getHoldings: () => HoldingDTO[]
  getIncomeEvents: () => IncomeEventDTO[]
  setPortfolios: Dispatch<SetStateAction<PortfolioDTO[]>>
  setGoals: Dispatch<SetStateAction<GoalDTO[]>>
  setHoldings: Dispatch<SetStateAction<HoldingDTO[]>>
  setIncomeEvents: Dispatch<SetStateAction<IncomeEventDTO[]>>
  setSelectedPortfolio: Dispatch<SetStateAction<number>>
}

// ── Entries ──────────────────────────────────────────────────────────────

export async function upsertEntry(
  deps: MutationDeps,
  portfolioId: number,
  entry: {
    year: number
    month: number
    day: number
    invested: number
    value: number | null
    note: string
  }
): Promise<void> {
  const saved = await deps.fetch.request<EntryDTO>(
    "POST",
    `/api/portfolios/${portfolioId}/entries`,
    { body: entry }
  )
  deps.setPortfolios((prev) =>
    prev.map((p) => {
      if (p.id !== portfolioId) return p
      const idx = p.entries.findIndex(
        (e) => e.year === saved.year && e.month === saved.month
      )
      const next = [...p.entries]
      if (idx >= 0) {
        next[idx] = saved
      } else {
        next.push(saved)
        next.sort((a, b) => a.year - b.year || a.month - b.month)
      }
      return { ...p, entries: next }
    })
  )
}

/** Bulk upsert from the paste importer — POSTs all rows in one batch and
 * merges the saved entries into local state with a single re-sort. */
export async function applyPastedEntries(
  deps: MutationDeps,
  portfolioId: number,
  rows: Array<{
    year: number
    month: number
    day: number
    invested: number
    value: number | null
    note: string
  }>
): Promise<{ added: number; updated: number; skipped: number }> {
  const res = await deps.fetch.request<{
    entries: EntryDTO[]
    counts: { added: number; updated: number; skipped: number }
  }>("POST", `/api/portfolios/${portfolioId}/entries/bulk`, {
    body: { entries: rows },
  })

  deps.setPortfolios((prev) =>
    prev.map((p) => {
      if (p.id !== portfolioId) return p
      const next = [...p.entries]
      for (const saved of res.entries) {
        const idx = next.findIndex(
          (e) => e.year === saved.year && e.month === saved.month
        )
        if (idx >= 0) next[idx] = saved
        else next.push(saved)
      }
      next.sort((a, b) => a.year - b.year || a.month - b.month)
      return { ...p, entries: next }
    })
  )
  return res.counts
}

export async function deleteEntry(
  deps: MutationDeps,
  portfolioId: number,
  entryId: number
): Promise<void> {
  const portfolio = deps.getPortfolios().find((p) => p.id === portfolioId)
  const removed = portfolio?.entries.find((e) => e.id === entryId)
  deps.setPortfolios((prev) =>
    prev.map((p) =>
      p.id !== portfolioId
        ? p
        : { ...p, entries: p.entries.filter((e) => e.id !== entryId) }
    )
  )
  try {
    await deps.fetch.request<{ ok: true }>("DELETE", `/api/entries/${entryId}`)
  } catch (err) {
    if (removed) {
      const restored = removed
      deps.setPortfolios((prev) =>
        prev.map((p) =>
          p.id !== portfolioId
            ? p
            : {
                ...p,
                entries: [...p.entries, restored].sort(
                  (a, b) => a.year - b.year || a.month - b.month
                ),
              }
        )
      )
    }
    throw err
  }
}

// ── Portfolios ───────────────────────────────────────────────────────────

export async function addPortfolio(
  deps: MutationDeps,
  input: {
    name: string
    color?: string
    targetMonthlyContribution?: number
    startingValue?: number
    startingDate?: string | null
  }
): Promise<PortfolioDTO> {
  const created = await deps.fetch.request<PortfolioDTO>(
    "POST",
    "/api/portfolios",
    {
      body: input,
    }
  )
  deps.setPortfolios((prev) => [...prev, created])
  return created
}

export async function deletePortfolio(
  deps: MutationDeps,
  id: number
): Promise<void> {
  const removed = deps.getPortfolios().find((p) => p.id === id)
  deps.setPortfolios((prev) => prev.filter((p) => p.id !== id))
  deps.setSelectedPortfolio((curr) =>
    curr === id ? COMBINED_PORTFOLIO_ID : curr
  )
  try {
    await deps.fetch.request<{ ok: true }>("DELETE", `/api/portfolios/${id}`)
  } catch (err) {
    if (removed) {
      const restored = removed
      deps.setPortfolios((prev) =>
        [...prev, restored].sort((a, b) => a.id - b.id)
      )
    }
    throw err
  }
}

export async function reloadPortfolios(deps: MutationDeps): Promise<void> {
  const list = await deps.fetch.request<PortfolioDTO[]>(
    "GET",
    "/api/portfolios"
  )
  deps.setPortfolios(list)
}

// ── Goals ────────────────────────────────────────────────────────────────

export async function reloadGoals(deps: MutationDeps): Promise<void> {
  const list = await deps.fetch.request<GoalDTO[]>("GET", "/api/goals")
  deps.setGoals(list)
}

export async function addGoal(
  deps: MutationDeps,
  goal: Omit<GoalDTO, "id" | "color"> & { color?: string }
): Promise<GoalDTO> {
  const created = await deps.fetch.request<GoalDTO>("POST", "/api/goals", {
    body: goal,
  })
  deps.setGoals((prev) => [...prev, created])
  return created
}

export async function updateGoal(
  deps: MutationDeps,
  id: number,
  patch: Partial<Omit<GoalDTO, "id">>
): Promise<void> {
  const updated = await deps.fetch.request<GoalDTO>(
    "PATCH",
    `/api/goals/${id}`,
    {
      body: patch,
    }
  )
  deps.setGoals((prev) => prev.map((g) => (g.id === id ? updated : g)))
}

export async function deleteGoal(
  deps: MutationDeps,
  id: number
): Promise<void> {
  const removed = deps.getGoals().find((g) => g.id === id)
  deps.setGoals((prev) => prev.filter((g) => g.id !== id))
  try {
    await deps.fetch.request<{ ok: true }>("DELETE", `/api/goals/${id}`)
  } catch (err) {
    if (removed) {
      const restored = removed
      deps.setGoals((prev) => [...prev, restored].sort((a, b) => a.id - b.id))
    }
    throw err
  }
}

// ── Holdings ─────────────────────────────────────────────────────────────

export async function reloadHoldings(deps: MutationDeps): Promise<void> {
  const list = await deps.fetch.request<HoldingDTO[]>("GET", "/api/holdings")
  deps.setHoldings(list)
}

export async function addHolding(
  deps: MutationDeps,
  input: {
    portfolioId: number
    name: string
    type: HoldingType
    isin?: string | null
  }
): Promise<HoldingDTO> {
  const created = await deps.fetch.request<HoldingDTO>(
    "POST",
    "/api/holdings",
    {
      body: input,
    }
  )
  deps.setHoldings((prev) => [...prev, created])
  return created
}

export async function updateHolding(
  deps: MutationDeps,
  id: number,
  patch: HoldingPatch
): Promise<void> {
  const updated = await deps.fetch.request<HoldingDTO>(
    "PATCH",
    `/api/holdings/${id}`,
    { body: patch }
  )
  deps.setHoldings((prev) => prev.map((h) => (h.id === id ? updated : h)))
  // Cascade rename / type / isin into matching income events so views that
  // join on holdingId don't show a stale label until the next reload.
  deps.setIncomeEvents((prev) =>
    prev.map((d) =>
      d.holdingId === id
        ? {
            ...d,
            holdingName: updated.name,
            holdingType: updated.type,
            holdingIsin: updated.isin,
          }
        : d
    )
  )
}

export async function deleteHolding(
  deps: MutationDeps,
  id: number
): Promise<void> {
  const removedHolding = deps.getHoldings().find((h) => h.id === id)
  const removedEvents = deps.getIncomeEvents().filter((d) => d.holdingId === id)
  deps.setHoldings((prev) => prev.filter((h) => h.id !== id))
  deps.setIncomeEvents((prev) => prev.filter((d) => d.holdingId !== id))
  try {
    await deps.fetch.request<{ ok: true }>("DELETE", `/api/holdings/${id}`)
  } catch (err) {
    if (removedHolding) {
      const restoredHolding = removedHolding
      deps.setHoldings((prev) =>
        [...prev, restoredHolding].sort((a, b) => a.id - b.id)
      )
    }
    if (removedEvents.length > 0) {
      const restoredEvents = removedEvents
      deps.setIncomeEvents((prev) =>
        [...prev, ...restoredEvents].sort((a, b) => a.id - b.id)
      )
    }
    throw err
  }
}

// ── Income events ────────────────────────────────────────────────────────

export async function reloadIncomeEvents(deps: MutationDeps): Promise<void> {
  const list = await deps.fetch.request<IncomeEventDTO[]>(
    "GET",
    "/api/income-events"
  )
  deps.setIncomeEvents(list)
}

export async function addIncomeEvent(
  deps: MutationDeps,
  input: {
    kind: IncomeKind
    portfolioId?: number
    holdingId: number | null
    paidDate: string
    amount: number
    tax?: number
    note?: string
  }
): Promise<IncomeEventDTO> {
  const created = await deps.fetch.request<IncomeEventDTO>(
    "POST",
    "/api/income-events",
    { body: input }
  )
  deps.setIncomeEvents((prev) => [...prev, created])
  return created
}

export async function updateIncomeEvent(
  deps: MutationDeps,
  id: number,
  patch: IncomeEventPatch
): Promise<void> {
  const updated = await deps.fetch.request<IncomeEventDTO>(
    "PATCH",
    `/api/income-events/${id}`,
    { body: patch }
  )
  deps.setIncomeEvents((prev) => prev.map((d) => (d.id === id ? updated : d)))
}

export async function deleteIncomeEvent(
  deps: MutationDeps,
  id: number
): Promise<void> {
  const removed = deps.getIncomeEvents().find((d) => d.id === id)
  deps.setIncomeEvents((prev) => prev.filter((d) => d.id !== id))
  try {
    await deps.fetch.request<{ ok: true }>("DELETE", `/api/income-events/${id}`)
  } catch (err) {
    if (removed) {
      const restored = removed
      deps.setIncomeEvents((prev) =>
        [...prev, restored].sort((a, b) => a.id - b.id)
      )
    }
    throw err
  }
}

// ── Settings (non-debounced wire write) ─────────────────────────────────

/**
 * Fire-and-forget settings PATCH for the debounced flusher in the provider.
 * `keepalive: true` lets the request survive a `pagehide`. Errors are
 * intentionally swallowed — the UI state is the source of truth client-side.
 */
export function flushSettings(
  deps: MutationDeps,
  body: Partial<SettingsDTO>
): void {
  deps.fetch
    .request<SettingsDTO>("PATCH", "/api/settings", { body, keepalive: true })
    .catch(() => {})
}

export function flushPortfolioPatch(
  deps: MutationDeps,
  id: number,
  body: Record<string, unknown>
): void {
  deps.fetch
    .request<PortfolioDTO>("PATCH", `/api/portfolios/${id}`, {
      body,
      keepalive: true,
    })
    .catch(() => {})
}

// ── Broker import ───────────────────────────────────────────────────────

export async function importBrokerData(
  deps: MutationDeps,
  input: {
    broker: string
    portfolioId: number
    csv: string
    decisions: ImportDecisions
  }
): Promise<ImportApplied> {
  const result = await deps.fetch.request<{ applied: ImportApplied }>(
    "POST",
    "/api/import/commit",
    { body: input }
  )
  await Promise.all([
    reloadPortfolios(deps),
    reloadHoldings(deps),
    reloadIncomeEvents(deps),
  ])
  return result.applied
}

// ── Portfolio transfer (export / import) ────────────────────────────────

export async function importPortfolioPreview(
  deps: MutationDeps,
  payload: unknown
): Promise<TransferPreview> {
  const res = await deps.fetch.request<{ preview: TransferPreview }>(
    "POST",
    "/api/portfolios/import/preview",
    { body: { payload } }
  )
  return res.preview
}

/**
 * Commit a previewed transfer bundle. On success the new portfolio is
 * appended to `portfolios`; the provider switches the selected portfolio
 * to the imported one before this returns (see `data-provider.tsx`).
 *
 * Holdings + income events + goals are reloaded *in the background* so
 * the dialog's summary card can render the instant the POST returns — the
 * three round-trips of trailing GETs no longer block the visible state
 * transition. Reload errors are swallowed because the user has no
 * remediation step (the next implicit reload re-fetches anyway).
 *
 * Trade-off: a 500 on `/api/income-events` here is silent — views remain
 * subtly stale until the next implicit reload. Acceptable today because
 * (a) the source-of-truth POST already succeeded, and (b) there is no
 * telemetry seam to route the rejection through. If telemetry lands,
 * replace the `.catch(() => {})` with a logger call so these rejections
 * stop being invisible.
 */
export async function importPortfolio(
  deps: MutationDeps,
  input: { payload: unknown; overrideName?: string }
): Promise<{ portfolio: PortfolioDTO; summary: RestoreSummary }> {
  const res = await deps.fetch.request<{
    portfolio: PortfolioDTO
    summary: RestoreSummary
  }>("POST", "/api/portfolios/import", { body: input })
  deps.setPortfolios((prev) => [...prev, res.portfolio])
  void Promise.all([
    reloadHoldings(deps),
    reloadIncomeEvents(deps),
    reloadGoals(deps),
  ]).catch(() => {})
  return res
}
