"use client"

import { useReducer, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useDataActions } from "@/components/providers/data-provider"
import type {
  BrokerId,
  ImportApplied,
  ImportDecisions,
  ImportPreview,
} from "@/lib/import/types"
import { ImportStepUpload } from "./import-step-upload"
import { ImportStepPreview } from "./import-step-preview"
import { ImportStepSummary } from "./import-step-summary"

type State =
  | { step: "upload"; portfolioId: number }
  | {
      step: "preview"
      portfolioId: number
      broker: BrokerId
      csv: string
      preview: ImportPreview
      decisions: ImportDecisions
    }
  | { step: "summary"; result: ImportApplied }

type Action =
  | {
      type: "preview"
      portfolioId: number
      broker: BrokerId
      csv: string
      preview: ImportPreview
    }
  | {
      type: "set-month-action"
      year: number
      month: number
      action: "replace" | "skip"
    }
  | {
      type: "toggle"
      key: "importDividends" | "importInterest" | "importHoldings"
    }
  | { type: "commit"; result: ImportApplied }
  | { type: "reset"; portfolioId: number }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "preview": {
      const decisions: ImportDecisions = {
        months: action.preview.months.map((m) => ({
          year: m.year,
          month: m.month,
          // Default: replace months that don't exist yet; skip ones that do
          // (avoids silent overwrites of user-entered data).
          action: m.currentInvested === 0 ? "replace" : "skip",
        })),
        importDividends: true,
        importInterest: true,
        importHoldings: true,
      }
      return {
        step: "preview",
        portfolioId: action.portfolioId,
        broker: action.broker,
        csv: action.csv,
        preview: action.preview,
        decisions,
      }
    }
    case "set-month-action":
      if (state.step !== "preview") return state
      return {
        ...state,
        decisions: {
          ...state.decisions,
          months: state.decisions.months.map((m) =>
            m.year === action.year && m.month === action.month
              ? { ...m, action: action.action }
              : m
          ),
        },
      }
    case "toggle":
      if (state.step !== "preview") return state
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [action.key]: !state.decisions[action.key],
        },
      }
    case "commit":
      return { step: "summary", result: action.result }
    case "reset":
      return { step: "upload", portfolioId: action.portfolioId }
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  portfolioId: number
}

export function ImportFlow({ open, onOpenChange, portfolioId }: Props) {
  const [state, dispatch] = useReducer(reducer, {
    step: "upload" as const,
    portfolioId,
  })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { importBrokerData } = useDataActions()

  const handleClose = () => {
    onOpenChange(false)
    // Defer reset so the dialog can animate out without a flash.
    setTimeout(() => dispatch({ type: "reset", portfolioId }), 200)
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-[820px]"
        data-testid="import-flow"
      >
        <DialogHeader>
          <DialogTitle>
            {state.step === "upload"
              ? "Import broker transactions"
              : state.step === "preview"
                ? "Review changes"
                : "Import complete"}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div
            className="card"
            style={{
              padding: 10,
              background: "var(--neg-50, #FEF2F2)",
              borderColor: "var(--neg)",
              color: "var(--neg)",
              fontSize: 13,
            }}
            data-testid="import-error"
          >
            {error}
          </div>
        )}

        {state.step === "upload" && (
          <ImportStepUpload
            onPreview={async (broker, csv) => {
              setError(null)
              setSubmitting(true)
              try {
                const res = await fetch("/api/import/preview", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    broker,
                    portfolioId: state.portfolioId,
                    csv,
                  }),
                })
                if (!res.ok) {
                  const body = (await res.json().catch(() => ({}))) as {
                    error?: string
                  }
                  throw new Error(body.error ?? "Failed to parse CSV")
                }
                const data = (await res.json()) as { parsed: ImportPreview }
                dispatch({
                  type: "preview",
                  portfolioId: state.portfolioId,
                  broker,
                  csv,
                  preview: data.parsed,
                })
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to parse CSV")
              } finally {
                setSubmitting(false)
              }
            }}
            submitting={submitting}
          />
        )}

        {state.step === "preview" && (
          <ImportStepPreview
            preview={state.preview}
            decisions={state.decisions}
            submitting={submitting}
            onSetMonthAction={(year, month, action) =>
              dispatch({ type: "set-month-action", year, month, action })
            }
            onToggle={(key) => dispatch({ type: "toggle", key })}
            onCancel={handleClose}
            onCommit={async () => {
              setError(null)
              setSubmitting(true)
              try {
                const result = await importBrokerData({
                  broker: state.broker,
                  portfolioId: state.portfolioId,
                  csv: state.csv,
                  decisions: state.decisions,
                })
                dispatch({ type: "commit", result })
              } catch (e) {
                setError(e instanceof Error ? e.message : "Import failed")
              } finally {
                setSubmitting(false)
              }
            }}
          />
        )}

        {state.step === "summary" && (
          <ImportStepSummary result={state.result} onClose={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}
