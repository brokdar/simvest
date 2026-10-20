"use client"

import type React from "react"

/**
 * Presentational primitives shared by the broker import preview and the paste
 * importer's review step. Pure layout — no data logic. Extracted from
 * `import-step-preview.tsx` so both flows render an identical review surface.
 */

export function StatsBar({
  items,
}: {
  items: Array<{
    label: string
    value: string | number
    hint?: string
    testId?: string
  }>
}) {
  return (
    <div
      style={{
        display: "grid",
        // Tiles wrap to two per row on a phone instead of clipping.
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 8,
        flexShrink: 0,
      }}
    >
      {items.map((s) => (
        <div
          key={s.label}
          data-testid={s.testId}
          style={{
            padding: "8px 12px",
            background: "var(--neutral-50)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: "var(--fs-2xs)",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--neutral-500)",
            }}
          >
            {s.label}
          </span>
          <span
            className="mono"
            style={{
              fontSize: "var(--fs-2xl)",
              fontWeight: 600,
              color: "var(--neutral-900)",
            }}
          >
            {s.value}
          </span>
          {s.hint && (
            <span
              className="muted"
              style={{ fontSize: "var(--fs-2xs)", lineHeight: 1.2 }}
            >
              {s.hint}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "var(--fs-2xs)",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--neutral-500)",
          marginBottom: 8,
          position: "sticky",
          top: 0,
          background: "var(--popover, var(--surface))",
          paddingBottom: 4,
          zIndex: 1,
        }}
      >
        {title}
      </div>
      <div
        className="card"
        style={{ padding: 0, overflow: "hidden", background: "var(--surface)" }}
      >
        {children}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="muted small" style={{ padding: 14 }}>
      {children}
    </div>
  )
}

export function ActionButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      style={{
        padding: "4px 10px",
        fontSize: "var(--fs-xs)",
        fontWeight: 600,
        borderRadius: 6,
        border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
        background: active ? "var(--primary)" : "var(--surface)",
        color: active ? "var(--primary-foreground)" : "var(--neutral-600)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean
  onChange: () => void
  label: string
  testId?: string
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: "var(--fs-xs)",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        data-testid={testId}
      />
      <span>{label}</span>
    </label>
  )
}
