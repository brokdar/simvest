"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useData } from "@/components/providers/data-provider"
import { useEditorIntent } from "@/components/providers/editor-intent"
import { EntriesBarChart } from "@/components/entries-bar-chart"
import { EditableEntriesTable } from "@/components/entries-grid/editable-entries-table"
import { CatchUpPanel } from "@/components/entries-grid/catch-up-panel"
import { useEditableEntries } from "@/components/entries-grid/use-editable-entries"
import { nextMonthAfter } from "@/components/entries-grid/draft-row"
import { Icon } from "@/components/icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CsvExportButton } from "@/components/csv-export-button"
import { incomeByMonth } from "@/lib/calc"
import { toCsv, type CsvColumn } from "@/lib/export/to-csv"
import { COMBINED_PORTFOLIO_ID, type EntryDTO } from "@/lib/types"
import { ImportFlow } from "@/components/import/import-flow"
import { PasteImportFlow } from "@/components/import/paste-import-flow"
import { swatch } from "@/lib/palette"
import { fmtCount } from "@/lib/format"

export function EntriesView() {
  const {
    portfolios,
    selectedPortfolio,
    activePortfolio,
    incomeEvents,
    settings,
  } = useData()
  const active = activePortfolio
  const isCombined =
    selectedPortfolio === COMBINED_PORTFOLIO_ID || !portfolios.length
  const editorPortfolio = useMemo(
    () => portfolios.find((p) => p.id === selectedPortfolio) ?? portfolios[0],
    [portfolios, selectedPortfolio]
  )
  const controller = useEditableEntries(editorPortfolio ?? active)

  const dividendIndex = useMemo(
    () =>
      incomeByMonth(
        incomeEvents,
        active.id,
        "dividend",
        settings.dividendBasis
      ),
    [incomeEvents, active.id, settings.dividendBasis]
  )
  const [importOpen, setImportOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  // Topbar "+ New entry" intent — enter edit mode and append a draft row. In
  // Combined (W1) it goes to the catch-up form, the one place an entry for
  // every account can be typed.
  const [catchUpFocus, setCatchUpFocus] = useState(0)
  const enterEditModeWithDraft = useCallback(() => {
    if (isCombined) {
      setCatchUpFocus((n) => n + 1)
      return
    }
    if (!editorPortfolio) return
    controller.toggleEdit(true)
    const base = nextMonthAfter(editorPortfolio, settings.defaultEntryDay)
    const key = controller.addDraft(base)
    controller.focusKey(key)
  }, [isCombined, editorPortfolio, controller, settings.defaultEntryDay])

  useEditorIntent("entry", enterEditModeWithDraft)

  // W6: `/entries?new=entry` (the stale-account links) lands on the entry
  // form itself — a draft row for the next month, focused — not on the
  // table one more click away. The query is stripped once handled.
  const searchParams = useSearchParams()
  const router = useRouter()
  const wantsNewEntry = searchParams.get("new") === "entry"
  // Same render-time "external value changed" pattern as `?new=goal` on
  // /goals; only the URL cleanup runs in an effect.
  const [prevWantsNewEntry, setPrevWantsNewEntry] = useState(false)
  if (wantsNewEntry !== prevWantsNewEntry) {
    setPrevWantsNewEntry(wantsNewEntry)
    if (wantsNewEntry) enterEditModeWithDraft()
  }
  useEffect(() => {
    if (wantsNewEntry) router.replace("/entries", { scroll: false })
  }, [wantsNewEntry, router])

  const entryCsvColumns: CsvColumn<EntryDTO>[] = [
    { header: "year", value: (e) => e.year },
    { header: "month", value: (e) => e.month },
    { header: "day", value: (e) => e.day },
    { header: "label", value: (e) => e.label },
    { header: "invested", value: (e) => e.invested },
    { header: "value", value: (e) => e.value },
    { header: "note", value: (e) => e.note },
  ]

  return (
    <div className="view">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="title">Monthly entries</h1>
          <div
            className="muted small"
            style={{ marginTop: 4 }}
            data-testid="entries-subtitle"
          >
            Inline-editable history ·{" "}
            {fmtCount(active.entries.length, "record", "records")}
          </div>
        </div>
        <div
          className="entries-header-actions"
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <CsvExportButton
            filename="simvest-entries.csv"
            buildCsv={() => toCsv(entryCsvColumns, active.entries)}
            testId="btn-export-entries"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={isCombined ? 0 : undefined}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isCombined}
                  onClick={() => setImportOpen(true)}
                  data-testid="btn-import"
                >
                  <Icon name="upload" size={15} /> Import
                </button>
              </span>
            </TooltipTrigger>
            {isCombined && (
              <TooltipContent>
                Switch to a specific portfolio to import broker data
              </TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={isCombined ? 0 : undefined}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isCombined}
                  onClick={() => setPasteOpen(true)}
                  data-testid="btn-paste-data"
                >
                  <Icon name="table" size={15} /> Paste data
                </button>
              </span>
            </TooltipTrigger>
            {isCombined && (
              <TooltipContent>
                Switch to a specific portfolio to paste data
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>

      {isCombined && portfolios.length > 0 && (
        <CatchUpPanel focusSignal={catchUpFocus} />
      )}

      {active.entries.length === 0 && !isCombined ? (
        // First run for this account: say what to do, not just "no entries".
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="empty-state" data-testid="entries-empty">
            <div className="empty-title">
              Nothing logged for {active.name} yet
            </div>
            <div className="empty-sub">
              Add the months you know with Add entry below, or bring in your
              history from a broker export or a spreadsheet.
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setImportOpen(true)}
                data-testid="entries-empty-import"
              >
                <Icon name="upload" size={14} /> Import a broker export
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPasteOpen(true)}
                data-testid="entries-empty-paste"
              >
                <Icon name="table" size={14} /> Paste from a spreadsheet
              </button>
            </div>
          </div>
        </div>
      ) : (
        <EntriesBarChart
          entries={active.entries}
          color={swatch(active.color)}
          dividendsByMonth={dividendIndex}
        />
      )}

      {editorPortfolio && (
        <EditableEntriesTable
          // Combined shows the added-up history, not the first account's.
          portfolio={isCombined ? active : editorPortfolio}
          isCombined={isCombined}
          controller={controller}
          settings={settings}
        />
      )}

      {editorPortfolio && !isCombined && (
        <ImportFlow
          open={importOpen}
          onOpenChange={setImportOpen}
          portfolioId={editorPortfolio.id}
        />
      )}

      {editorPortfolio && !isCombined && (
        <PasteImportFlow
          open={pasteOpen}
          onOpenChange={setPasteOpen}
          portfolio={editorPortfolio}
          settings={settings}
        />
      )}
    </div>
  )
}
