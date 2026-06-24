"use client"

import { useMemo, useReducer, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Icon } from "@/components/icon"
import { useDataActions } from "@/components/providers/data-provider"
import { useResolvedLocale } from "@/components/use-resolved-locale"
import { fmtEUR } from "@/lib/format"
import { resolveEntryDay } from "@/lib/dates"
import {
  detectFormat,
  detectMapping,
  describeDateFormat,
  exampleForDateFormat,
  exampleForNumberLocale,
  parseEntries,
  splitRows,
  type ColumnMapping,
  type DateFormat,
  type FormatHints,
  type ParseContext,
  type ParsedRow,
} from "@/lib/parse-entries"
import type { PortfolioDTO, SettingsDTO } from "@/lib/types"
import { ActionButton, Section, StatsBar } from "./review-ui"

const EXAMPLE_PASTE = `2024-01\t\t1520
2024-02\t\t1645
2024-03\t\t1810`

const DEFAULT_HINTS: FormatHints = {
  numberLocale: "de-DE",
  dateFormat: "DMY-dot",
  hasHeader: true,
}

const DEFAULT_MAPPING: ColumnMapping = {
  date: 0,
  invested: 1,
  value: 2,
  note: 3,
}

const DATE_FORMATS: DateFormat[] = [
  "DMY-dot",
  "ISO-ym",
  "MY-slash",
  "DMY-slash",
]
const NUMBER_LOCALES = ["de-DE", "en-US"]

type State = {
  step: "paste" | "review" | "summary"
  rawText: string
  // null = use the auto-detected value; set = user override.
  headerOverride: boolean | null
  dateFormatOverride: DateFormat | null
  numberLocaleOverride: string | null
  // (year-month) keys the user toggled to skip.
  skipped: string[]
  counts: { added: number; updated: number; skipped: number } | null
}

type Action =
  | { type: "set-text"; text: string }
  | { type: "set-header"; value: boolean }
  | { type: "set-date-format"; value: DateFormat }
  | { type: "set-number-locale"; value: string }
  | { type: "set-skip"; key: string; skip: boolean }
  | { type: "to-review" }
  | { type: "back-to-paste" }
  | {
      type: "commit"
      counts: { added: number; updated: number; skipped: number }
    }
  | { type: "reset" }

const INITIAL: State = {
  step: "paste",
  rawText: "",
  headerOverride: null,
  dateFormatOverride: null,
  numberLocaleOverride: null,
  skipped: [],
  counts: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-text":
      return { ...state, rawText: action.text }
    case "set-header":
      return { ...state, headerOverride: action.value }
    case "set-date-format":
      return { ...state, dateFormatOverride: action.value }
    case "set-number-locale":
      return { ...state, numberLocaleOverride: action.value }
    case "set-skip": {
      const has = state.skipped.includes(action.key)
      if (action.skip === has) return state
      return {
        ...state,
        skipped: action.skip
          ? [...state.skipped, action.key]
          : state.skipped.filter((k) => k !== action.key),
      }
    }
    case "to-review":
      return { ...state, step: "review" }
    case "back-to-paste":
      return { ...state, step: "paste" }
    case "commit":
      return { ...state, step: "summary", counts: action.counts }
    case "reset":
      return INITIAL
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  portfolio: PortfolioDTO
  settings: SettingsDTO
}

const monthKey = (r: ParsedRow) => `${r.parsed!.year}-${r.parsed!.month}`

export function PasteImportFlow({
  open,
  onOpenChange,
  portfolio,
  settings,
}: Props) {
  const { locale } = useResolvedLocale()
  const { applyPastedEntries } = useDataActions()
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    rawText,
    headerOverride,
    dateFormatOverride,
    numberLocaleOverride,
    skipped,
  } = state

  const handleClose = () => {
    onOpenChange(false)
    setSubmitError(null)
    // Defer reset so the dialog can animate out without a flash.
    setTimeout(() => dispatch({ type: "reset" }), 200)
  }

  // The parse chain derives from rawText + overrides at render time — no effect,
  // no race. Parsing a paste is microsecond-cheap.
  const autoHints = useMemo<FormatHints>(
    () => (rawText.trim() ? detectFormat(rawText, locale) : DEFAULT_HINTS),
    [rawText, locale]
  )

  const hints = useMemo<FormatHints>(
    () => ({
      hasHeader: headerOverride ?? autoHints.hasHeader,
      dateFormat: dateFormatOverride ?? autoHints.dateFormat,
      numberLocale: numberLocaleOverride ?? autoHints.numberLocale,
    }),
    [autoHints, headerOverride, dateFormatOverride, numberLocaleOverride]
  )

  const splitData = useMemo(() => {
    const all = splitRows(rawText)
    if (hints.hasHeader && all.length > 0) {
      return { headers: all[0], all }
    }
    return { headers: [] as string[], all }
  }, [rawText, hints.hasHeader])

  const mappingResult = useMemo(() => {
    if (rawText.trim().length === 0) {
      return { mapping: DEFAULT_MAPPING, structuralErrors: [] }
    }
    const columnCount = splitData.all[0]?.length ?? 4
    return detectMapping(splitData.headers, hints.hasHeader, columnCount)
  }, [rawText, splitData, hints.hasHeader])

  const ctx = useMemo<ParseContext>(() => {
    const now = new Date()
    const existingByMonth = new Map(
      portfolio.entries.map((e) => [`${e.year}-${e.month}`, e])
    )
    return {
      existingByMonth,
      todayYear: now.getFullYear(),
      todayMonth: now.getMonth() + 1,
      defaultDay: (y, m) => resolveEntryDay(settings.defaultEntryDay, y, m),
      defaultInvested: portfolio.targetMonthlyContribution,
    }
  }, [
    portfolio.entries,
    portfolio.targetMonthlyContribution,
    settings.defaultEntryDay,
  ])

  const parsed = useMemo<ParsedRow[]>(() => {
    if (
      rawText.trim().length === 0 ||
      mappingResult.structuralErrors.length > 0
    )
      return []
    return parseEntries(rawText, hints, mappingResult.mapping, ctx)
  }, [rawText, hints, mappingResult, ctx])

  // Strict error handling: every structural error AND every row-level error
  // blocks the whole paste. Warnings are surfaced but never block.
  const blockers = useMemo(() => {
    const msgs: string[] = []
    for (const se of mappingResult.structuralErrors) msgs.push(se.text)
    for (const r of parsed) {
      if (r.status !== "error") continue
      for (const m of r.messages) if (m.level === "error") msgs.push(m.text)
    }
    return msgs
  }, [mappingResult.structuralErrors, parsed])

  // Rows that would actually be written (new + update; empty rows excluded).
  const applicable = useMemo(
    () =>
      parsed.filter(
        (r) => r.parsed && (r.status === "new" || r.status === "update")
      ),
    [parsed]
  )

  const isSkipped = (r: ParsedRow) => skipped.includes(monthKey(r))

  const stats = useMemo(() => {
    let newCount = 0
    let updateCount = 0
    let skipCount = 0
    for (const r of applicable) {
      if (isSkipped(r)) skipCount++
      else if (r.status === "new") newCount++
      else updateCount++
    }
    return { newCount, updateCount, skipCount }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicable, skipped])

  const warnings = useMemo(
    () =>
      applicable.flatMap((r) =>
        r.messages.filter((m) => m.level === "warning").map((m) => m.text)
      ),
    [applicable]
  )

  const canContinue = blockers.length === 0 && applicable.length > 0
  const rowsToWrite = applicable.filter((r) => !isSkipped(r))

  const title =
    state.step === "paste"
      ? "Paste data"
      : state.step === "review"
        ? "Review changes"
        : "Paste complete"

  async function handleApply() {
    setSubmitError(null)
    setSubmitting(true)
    try {
      const counts = await applyPastedEntries(
        portfolio.id,
        rowsToWrite.map((r) => r.parsed!)
      )
      dispatch({ type: "commit", counts })
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to apply paste")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-[760px]"
        data-testid="paste-import-flow"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {submitError && (
          <div
            className="card"
            style={{
              padding: 10,
              background: "var(--neg-50, #FEF2F2)",
              borderColor: "var(--neg)",
              color: "var(--neg)",
              fontSize: 13,
            }}
            data-testid="paste-error"
          >
            {submitError}
          </div>
        )}

        {/* ── Step: paste ─────────────────────────────────────────────── */}
        {state.step === "paste" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflow: "auto",
            }}
          >
            <p className="muted small" style={{ margin: 0 }}>
              Paste rows from a spreadsheet. A header row lets the date column
              sit anywhere; without one, columns are read as date, invested,
              value, note. Amount cells can be sums — e.g. <code>125+75</code>{" "}
              for two deposits in one month. Existing months merge — only the
              columns you paste overwrite stored values.
            </p>
            <textarea
              value={rawText}
              onChange={(e) =>
                dispatch({ type: "set-text", text: e.target.value })
              }
              placeholder={`Paste tab- or comma-separated rows.\n\nExample:\n${EXAMPLE_PASTE}`}
              data-testid="paste-textarea"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              style={{
                width: "100%",
                minHeight: 150,
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                resize: "vertical",
              }}
            />

            {rawText.trim().length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  flexWrap: "wrap",
                  fontSize: 12,
                  color: "var(--neutral-600)",
                }}
                data-testid="paste-detection"
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hints.hasHeader}
                    onChange={(e) =>
                      dispatch({ type: "set-header", value: e.target.checked })
                    }
                    data-testid="paste-has-header"
                  />
                  First row is a header
                </label>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Date
                  <select
                    value={hints.dateFormat}
                    onChange={(e) =>
                      dispatch({
                        type: "set-date-format",
                        value: e.target.value as DateFormat,
                      })
                    }
                    data-testid="paste-date-format"
                  >
                    {DATE_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {describeDateFormat(f)} (e.g. {exampleForDateFormat(f)})
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Numbers
                  <select
                    value={hints.numberLocale}
                    onChange={(e) =>
                      dispatch({
                        type: "set-number-locale",
                        value: e.target.value,
                      })
                    }
                    data-testid="paste-number-locale"
                  >
                    {NUMBER_LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {l} (e.g. {exampleForNumberLocale(l)})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {blockers.length > 0 && (
              <div
                className="card"
                style={{
                  padding: 10,
                  background: "var(--neg-50, #FEF2F2)",
                  borderColor: "var(--neg)",
                  color: "var(--neg)",
                  fontSize: 13,
                }}
                data-testid="paste-structural-error"
              >
                <strong>Fix these before continuing:</strong>
                <ul style={{ margin: "6px 0 0 18px", lineHeight: 1.5 }}>
                  {blockers.slice(0, 8).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                  {blockers.length > 8 && (
                    <li>… and {blockers.length - 8} more</li>
                  )}
                </ul>
              </div>
            )}

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleClose}
                data-testid="paste-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canContinue}
                onClick={() => dispatch({ type: "to-review" })}
                data-testid="paste-continue"
              >
                Continue to review
              </button>
            </div>
          </div>
        )}

        {/* ── Step: review ────────────────────────────────────────────── */}
        {state.step === "review" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              overflow: "auto",
            }}
          >
            <StatsBar
              items={[
                { label: "New", value: stats.newCount },
                { label: "Update", value: stats.updateCount },
                { label: "Skip", value: stats.skipCount },
              ]}
            />

            {warnings.length > 0 && (
              <div
                className="card"
                style={{
                  padding: 10,
                  background: "var(--warn-50, #FFFBEB)",
                  borderColor: "var(--warn, #B45309)",
                  fontSize: 12.5,
                }}
                data-testid="paste-warnings"
              >
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                  </summary>
                  <ul style={{ margin: "6px 0 0 18px", lineHeight: 1.5 }}>
                    {warnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {warnings.length > 8 && (
                      <li>… and {warnings.length - 8} more</li>
                    )}
                  </ul>
                </details>
              </div>
            )}

            <Section title="Rows">
              <table
                className="table"
                style={{ fontSize: 12 }}
                data-testid="paste-preview"
              >
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Invested</th>
                    <th className="num">Value</th>
                    <th>Note</th>
                    <th style={{ width: 150 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {applicable.map((r) => {
                    const skip = isSkipped(r)
                    const key = monthKey(r)
                    return (
                      <tr
                        key={r.index}
                        data-testid={`paste-row-${r.index}`}
                        data-status={r.status}
                        style={{ opacity: skip ? 0.5 : 1 }}
                      >
                        <td>
                          {r.parsed!.year}-
                          {String(r.parsed!.month).padStart(2, "0")}
                        </td>
                        <td className="num mono">
                          {fmtEUR(r.parsed!.invested)}
                        </td>
                        <td className="num mono">
                          {r.parsed!.value === null ? (
                            <span className="muted">—</span>
                          ) : (
                            fmtEUR(r.parsed!.value)
                          )}
                        </td>
                        <td>
                          {r.parsed!.note || <span className="muted">—</span>}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <ActionButton
                              active={!skip}
                              onClick={() =>
                                dispatch({ type: "set-skip", key, skip: false })
                              }
                              testId={`paste-row-${r.index}-apply`}
                            >
                              {r.status === "update" ? "Update" : "Add"}
                            </ActionButton>
                            <ActionButton
                              active={skip}
                              onClick={() =>
                                dispatch({ type: "set-skip", key, skip: true })
                              }
                              testId={`paste-row-${r.index}-skip`}
                            >
                              Skip
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Section>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => dispatch({ type: "back-to-paste" })}
                data-testid="paste-back"
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={submitting || rowsToWrite.length === 0}
                onClick={handleApply}
                data-testid="paste-apply"
              >
                <Icon name="check" size={14} />{" "}
                {submitting ? "Applying…" : `Apply ${rowsToWrite.length} rows`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: summary ───────────────────────────────────────────── */}
        {state.step === "summary" && state.counts && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
            data-testid="paste-summary"
          >
            <div
              className="card card-pad"
              style={{
                background: "var(--pos-50, #ECFDF5)",
                borderColor: "var(--pos, #059669)",
                color: "var(--pos, #059669)",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon name="check" size={18} /> Paste applied
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="table">
                <tbody>
                  <tr>
                    <td style={{ paddingLeft: 16 }}>Entries added</td>
                    <td
                      className={`num mono ${state.counts.added > 0 ? "pos" : ""}`}
                    >
                      {state.counts.added}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingLeft: 16 }}>Entries updated</td>
                    <td
                      className={`num mono ${state.counts.updated > 0 ? "pos" : ""}`}
                    >
                      {state.counts.updated}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingLeft: 16 }}>Rows skipped</td>
                    <td className="num mono muted">{stats.skipCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleClose}
                data-testid="paste-summary-close"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
