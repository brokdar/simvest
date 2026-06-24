"use client"

import { useCallback, useReducer, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useDataActions } from "@/components/providers/data-provider"
import type { PortfolioDTO } from "@/lib/types"
import type {
  RestoreSummary,
  TransferPortfolioFile,
  TransferPreview,
} from "@/lib/transfer/types"
import { PortfolioTransferStepUpload } from "./portfolio-transfer-step-upload"
import { PortfolioTransferStepPreview } from "./portfolio-transfer-step-preview"
import { PortfolioTransferStepSummary } from "./portfolio-transfer-step-summary"

type State =
  | { step: "upload" }
  | {
      step: "preview"
      payload: unknown
      file: TransferPortfolioFile
      preview: TransferPreview
      nameOverride: string
    }
  | {
      step: "summary"
      summary: RestoreSummary
      portfolio: PortfolioDTO
    }

type Action =
  | {
      type: "to-preview"
      payload: unknown
      file: TransferPortfolioFile
      preview: TransferPreview
    }
  | { type: "name-override"; value: string }
  | {
      type: "to-summary"
      summary: RestoreSummary
      portfolio: PortfolioDTO
    }
  | { type: "reset" }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "to-preview":
      return {
        step: "preview",
        payload: action.payload,
        file: action.file,
        preview: action.preview,
        nameOverride: action.preview.resolvedName,
      }
    case "name-override":
      if (state.step !== "preview") return state
      return { ...state, nameOverride: action.value }
    case "to-summary":
      return {
        step: "summary",
        summary: action.summary,
        portfolio: action.portfolio,
      }
    case "reset":
      return { step: "upload" }
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PortfolioTransferDialog({ open, onOpenChange }: Props) {
  const [state, dispatch] = useReducer(reducer, { step: "upload" } as State)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { importPortfolioPreview, importPortfolio } = useDataActions()

  const handleClose = useCallback(() => {
    onOpenChange(false)
    // Defer reset by the dialog's close-animation duration so the user
    // doesn't see the step content swap to "upload" mid-fade-out. Honor
    // `prefers-reduced-motion: reduce` by collapsing the delay to 0 —
    // ShadCN's dialog primitive also shortens its transition under that
    // media query, so a 200ms delay would produce a visible flash there.
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setTimeout(
      () => {
        dispatch({ type: "reset" })
        setError(null)
      },
      reducedMotion ? 0 : 200
    )
  }, [onOpenChange])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-[560px]"
        data-testid="portfolio-transfer-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {state.step === "upload"
              ? "Import portfolio"
              : state.step === "preview"
                ? "Review import"
                : "Import complete"}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="card alert-card"
            data-testid="portfolio-transfer-error"
          >
            {error}
          </div>
        )}

        {state.step === "upload" && (
          <PortfolioTransferStepUpload
            submitting={submitting}
            onUploaded={async (payload, file) => {
              setError(null)
              setSubmitting(true)
              try {
                const preview = await importPortfolioPreview(payload)
                dispatch({ type: "to-preview", payload, file, preview })
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Failed to read the file."
                )
              } finally {
                setSubmitting(false)
              }
            }}
            onError={(message) => setError(message)}
          />
        )}

        {state.step === "preview" && (
          <PortfolioTransferStepPreview
            preview={state.preview}
            nameOverride={state.nameOverride}
            submitting={submitting}
            onNameChange={(v) => dispatch({ type: "name-override", value: v })}
            onCancel={handleClose}
            onCommit={async () => {
              setError(null)
              const trimmed = state.nameOverride.trim()
              if (trimmed.length === 0) {
                setError("Portfolio name cannot be empty.")
                return
              }
              setSubmitting(true)
              try {
                const { portfolio, summary } = await importPortfolio({
                  payload: state.payload,
                  overrideName: trimmed,
                })
                dispatch({ type: "to-summary", summary, portfolio })
              } catch (e) {
                setError(e instanceof Error ? e.message : "Import failed.")
              } finally {
                setSubmitting(false)
              }
            }}
          />
        )}

        {state.step === "summary" && (
          <PortfolioTransferStepSummary
            summary={state.summary}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
