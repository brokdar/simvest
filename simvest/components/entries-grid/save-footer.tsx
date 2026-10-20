"use client"

import { Icon } from "@/components/icon"
import { fmtCount } from "@/lib/format"

type Props = {
  dirtyCount: number
  /** Rows currently showing an error — derived live, so it clears with them. */
  errorCount: number
  isSaving: boolean
  saveStatus: string | null
  onSave: () => void
  onCancel: () => void
}

export function SaveFooter({
  dirtyCount,
  errorCount,
  isSaving,
  saveStatus,
  onSave,
  onCancel,
}: Props) {
  return (
    <div
      className="entries-save-footer"
      data-testid="entries-grid-save-footer"
      style={{
        position: "sticky",
        bottom: 12,
        zIndex: 5,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        marginTop: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg, 12px)",
        boxShadow: "var(--sh-footer)",
        flexWrap: "wrap",
      }}
    >
      <div
        role="status"
        aria-live="polite"
        data-testid="entries-grid-status"
        data-errors={errorCount > 0 && !saveStatus ? "true" : undefined}
        style={{
          fontSize: "var(--fs-sm)",
          color:
            errorCount > 0 && !saveStatus
              ? "var(--critical)"
              : "var(--neutral-600)",
        }}
      >
        {saveStatus ??
          (errorCount > 0
            ? `${fmtCount(errorCount, "row needs", "rows need")} a fix before saving.`
            : dirtyCount === 0
              ? "No changes."
              : `${fmtCount(dirtyCount, "change", "changes")} pending.`)}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCancel}
          disabled={isSaving}
          data-testid="entries-grid-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={isSaving || dirtyCount === 0}
          data-testid="entries-grid-save"
        >
          <Icon name="check" size={14} />{" "}
          {isSaving
            ? "Saving…"
            : dirtyCount === 0
              ? "Save all"
              : `Save all (${dirtyCount})`}
        </button>
      </div>
    </div>
  )
}
