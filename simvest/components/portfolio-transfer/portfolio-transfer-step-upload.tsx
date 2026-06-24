"use client"

import { useId, useState } from "react"
import { Icon } from "@/components/icon"
import { FieldLabel } from "@/components/ui/field-label"
import { useResolvedLocale } from "@/components/use-resolved-locale"
import { fmtNum } from "@/lib/format"
import type { TransferPortfolioFile } from "@/lib/transfer/types"

type Props = {
  submitting: boolean
  onUploaded: (payload: unknown, file: TransferPortfolioFile) => void
  onError: (message: string) => void
}

/**
 * Upload step. The native `<input type="file">` keeps its own focusability
 * via the `.sr-only` class (visually hidden, still in the tab order) — the
 * wrapping `<label>` is a styled dropzone, not the click target. The
 * `:focus-within` ring on the label makes the input's focus state visible.
 * Enter/Space activate the file picker by default for an `<input
 * type="file">`.
 */
export function PortfolioTransferStepUpload({
  submitting,
  onUploaded,
  onError,
}: Props) {
  const inputId = useId()
  const { locale } = useResolvedLocale()
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <FieldLabel htmlFor={inputId}>Simvest portfolio export</FieldLabel>
        <label
          htmlFor={inputId}
          className="card card-pad portfolio-transfer-dropzone"
          aria-disabled={submitting || undefined}
        >
          <Icon name="upload" size={18} />
          <span style={{ fontSize: 13 }}>
            {fileName
              ? `${fileName} — ${fmtNum(fileSize / 1024, 1, locale)} KB`
              : "Choose a Simvest portfolio export (.json)…"}
          </span>
          <input
            id={inputId}
            type="file"
            accept=".json,application/json"
            disabled={submitting}
            className="sr-only"
            data-testid="portfolio-transfer-file-input"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setFileName(file.name)
              setFileSize(file.size)
              let text: string
              try {
                text = await file.text()
              } catch {
                onError("Could not read the file.")
                return
              }
              let payload: unknown
              try {
                payload = JSON.parse(text)
              } catch {
                onError("File is not valid JSON.")
                return
              }
              onUploaded(payload, payload as TransferPortfolioFile)
              // Reset the input so re-selecting the same file fires again.
              e.target.value = ""
            }}
          />
        </label>
      </div>

      <div className="muted small" style={{ lineHeight: 1.5 }}>
        Pick a file you exported from another Simvest instance via{" "}
        <strong>Settings → portfolio row → Export</strong>. The file is
        validated before anything is written.
      </div>
    </div>
  )
}
