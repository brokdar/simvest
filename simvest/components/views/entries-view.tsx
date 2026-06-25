"use client"

import { useCallback, useMemo, useState } from "react"
import { useData } from "@/components/providers/data-provider"
import { useEditorIntent } from "@/components/providers/editor-intent"
import { EntriesBarChart } from "@/components/entries-bar-chart"
import { EditableEntriesTable } from "@/components/entries-grid/editable-entries-table"
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

  // Topbar "+ New entry" intent — enter edit mode and append a draft row.
  const enterEditModeWithDraft = useCallback(() => {
    if (isCombined || !editorPortfolio) return
    controller.toggleEdit(true)
    const base = nextMonthAfter(editorPortfolio, settings.defaultEntryDay)
    const key = controller.addDraft(base)
    controller.focusKey(key)
  }, [isCombined, editorPortfolio, controller, settings.defaultEntryDay])

  useEditorIntent("entry", enterEditModeWithDraft)

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
            Inline-editable history · {active.entries.length} records
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

      {isCombined && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 12,
            background: "var(--primary-50)",
            borderColor: "#C7D2FE",
          }}
          data-testid="combined-readonly-banner"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--primary)",
              fontSize: 13,
            }}
          >
            <Icon name="info" size={16} />
            Combined view is read-only — showing aggregated monthly totals.
            Switch to a specific portfolio to edit.
          </div>
        </div>
      )}

      <EntriesBarChart
        entries={active.entries}
        color={active.color}
        dividendsByMonth={dividendIndex}
      />

      {editorPortfolio && (
        <EditableEntriesTable
          portfolio={editorPortfolio}
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
