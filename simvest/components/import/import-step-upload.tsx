"use client"

import { useState } from "react"
import { Icon } from "@/components/icon"
import { FieldLabel } from "@/components/ui/field-label"
import { XLSX_MARKER } from "@/lib/import/bondora"
import { listBrokers } from "@/lib/import/registry"
import type { BrokerId } from "@/lib/import/types"

const BROKERS = listBrokers()

/** Browser-safe ArrayBuffer → base64, chunked to avoid blowing the call
 *  stack on `String.fromCharCode(...bytes)` for larger statements. */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const CHUNK = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

type Props = {
  submitting: boolean
  onPreview: (broker: BrokerId, csv: string) => void
}

export function ImportStepUpload({ submitting, onPreview }: Props) {
  const [broker, setBroker] = useState<BrokerId>(
    BROKERS[0]?.id ?? "trade_republic"
  )
  const [csv, setCsv] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState(0)
  const canSubmit = csv.trim().length > 0 && !submitting

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <FieldLabel>Broker</FieldLabel>
        <select
          className="input-bare"
          value={broker}
          onChange={(e) => setBroker(e.target.value as BrokerId)}
          data-testid="import-broker-selector"
        >
          {BROKERS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel>Transactions file</FieldLabel>
        <label
          className="card card-pad"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            border: "1.5px dashed var(--border)",
            background: "var(--neutral-50)",
          }}
        >
          <Icon name="upload" size={18} />
          <span style={{ fontSize: 13 }}>
            {fileName
              ? `${fileName} — ${(fileSize / 1024).toFixed(1)} KB`
              : broker === "bondora"
                ? "Choose a CSV or Excel (.xlsx) file from your broker"
                : "Choose a CSV file from your broker"}
          </span>
          <input
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: "none" }}
            data-testid="import-file-input"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setFileSize(file.size)
              setFileName(file.name)
              if (file.name.toLowerCase().endsWith(".xlsx")) {
                const buf = await file.arrayBuffer()
                setCsv(XLSX_MARKER + arrayBufferToBase64(buf))
              } else {
                setCsv(await file.text())
              }
            }}
          />
        </label>
      </div>

      <details style={{ marginTop: 4 }}>
        <summary
          style={{
            fontSize: 12,
            color: "var(--neutral-600)",
            cursor: "pointer",
          }}
        >
          How do I export from {BROKERS.find((b) => b.id === broker)?.label}?
        </summary>
        <div className="muted small" style={{ marginTop: 8, lineHeight: 1.5 }}>
          {broker === "trade_republic" && (
            <>
              In the Trade Republic app:{" "}
              <strong>Profile → Activity → Export</strong> → choose the date
              range → CSV. Email yourself the file and pick it above.
            </>
          )}
          {broker === "bondora" && (
            <>
              On the Bondora website:{" "}
              <strong>Go &amp; Grow → Account statement</strong> → pick the date
              range → export as Excel (.xlsx) or CSV. Daily “Go &amp; Grow
              returns/Zinsen” become interest; SEPA deposit rows become each
              month’s invested; the balance becomes the month-end value. Set the
              portfolio’s <strong>Starting value</strong> to the opening balance
              so gains stay accurate.
            </>
          )}
        </div>
      </details>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 8,
        }}
      >
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSubmit}
          onClick={() => onPreview(broker, csv)}
          data-testid="import-show-preview"
        >
          <Icon name="arrowRight" size={14} /> Show me what&apos;ll change
        </button>
      </div>
    </div>
  )
}
