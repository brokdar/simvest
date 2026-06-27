"use client"

import { useState } from "react"
import { Icon } from "@/components/icon"
import { downloadCsv } from "@/lib/export/to-csv"

type Props = {
  /** Downloaded file name, e.g. `simvest-entries.csv`. */
  filename: string
  /** Builds the CSV string lazily, on click — so we only serialize on demand. */
  buildCsv: () => string
  label?: string
  testId?: string
  disabled?: boolean
}

/**
 * Toolbar button that serializes rows to CSV on click and triggers a
 * client-side download. Serialization failures (rare) surface as a small inline
 * message rather than crashing the view.
 */
export function CsvExportButton({
  filename,
  buildCsv,
  label = "Export CSV",
  testId,
  disabled,
}: Props) {
  const [error, setError] = useState(false)
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={disabled}
        data-testid={testId}
        onClick={() => {
          try {
            downloadCsv(filename, buildCsv())
            setError(false)
          } catch {
            setError(true)
          }
        }}
      >
        <Icon name="download" size={15} /> {label}
      </button>
      {error && (
        <span className="small neg" role="alert" data-testid="csv-export-error">
          Export failed
        </span>
      )}
    </span>
  )
}
