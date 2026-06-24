"use client"

import { Icon } from "@/components/icon"

type Props = {
  dirtyCount: number
  isSaving: boolean
  saveStatus: string | null
  onSave: () => void
  onCancel: () => void
}

export function SaveFooter({
  dirtyCount,
  isSaving,
  saveStatus,
  onSave,
  onCancel,
}: Props) {
  return (
    <div
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
        boxShadow: "0 6px 24px -10px rgba(15, 23, 42, 0.18)",
        flexWrap: "wrap",
      }}
    >
      <div
        role="status"
        aria-live="polite"
        data-testid="entries-grid-status"
        style={{ fontSize: 13, color: "var(--neutral-600)" }}
      >
        {saveStatus ??
          (dirtyCount === 0
            ? "No changes."
            : `${dirtyCount} ${dirtyCount === 1 ? "change" : "changes"} pending.`)}
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
