"use client"

import { useId, useState } from "react"
import { MoneyInput } from "@/components/money-input"
import { formatMoney, parseMoney } from "@/lib/locale"
import { useResolvedLocale } from "@/components/use-resolved-locale"

export type ValueKind = "money" | "percent" | "integer"

type Props = {
  label: string
  value: number
  onChange: (v: number) => void
  kind: ValueKind
  /** Comfortable slider track bounds. Typed values may fall outside these —
   *  the rendered track expands to keep the thumb grabbable (see `effMin`). */
  sliderMin: number
  sliderMax: number
  step: number
  /** Display + parse precision for `percent` (default 1). Ignored for
   *  `integer` (always 0) and `money` (handled by MoneyInput, 0 decimals). */
  decimals?: number
  /** Floor / ceiling applied to *typed* values on blur. The slider itself is
   *  bounded by its dynamic track, so these only guard direct keyboard entry. */
  typedMin?: number
  typedMax?: number
  /** Muted caption under the row (e.g. "default from Settings"). */
  hint?: string
  testId?: string
}

/**
 * A labelled value the user can both **type** and **drag**.
 *
 * The sibling of `SliderRow`, but with the value rendered as an editable
 * field instead of a read-only readout. Built for the Planning assumptions
 * panel, where users need to set precise or out-of-range targets (e.g. a
 * €50/mo dividend goal) that a fixed-range, step-quantised slider can't reach.
 *
 * The typed input is the source of truth; the slider is a convenience whose
 * track stretches to always contain the current value.
 */
export function SliderField({
  label,
  value,
  onChange,
  kind,
  sliderMin,
  sliderMax,
  step,
  decimals,
  typedMin,
  typedMax,
  hint,
  testId,
}: Props) {
  const { locale } = useResolvedLocale()

  // The track always contains `value`, so a typed value beyond the comfortable
  // range still positions the thumb correctly (rather than pinning it dead at
  // an edge). The "nice" min/max are just the default span you land in.
  const effMin = Math.min(sliderMin, value)
  const effMax = Math.max(sliderMax, value)
  const fill =
    effMax > effMin ? ((value - effMin) / (effMax - effMin)) * 100 : 0

  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <span
          style={{ fontSize: 13, fontWeight: 500, color: "var(--neutral-600)" }}
        >
          {label}
        </span>
        <div style={{ width: 132, flexShrink: 0 }}>
          {kind === "money" ? (
            <MoneyInput
              value={value}
              // MoneyInput emits `null` on an empty/invalid field; ignore it so
              // a transient empty input never clobbers the value to 0. A drag
              // or a valid keystroke is what moves the value.
              onChange={(v) => {
                if (v != null) onChange(v)
              }}
              locale={locale}
              allowEmpty={false}
              min={typedMin ?? 0}
              decimals={0}
              align="right"
              ariaLabel={label}
              testId={testId}
            />
          ) : (
            <PlainNumberInput
              value={value}
              onChange={onChange}
              locale={locale}
              integer={kind === "integer"}
              decimals={kind === "integer" ? 0 : (decimals ?? 1)}
              suffix={kind === "percent" ? "%" : ""}
              min={typedMin}
              max={typedMax}
              ariaLabel={label}
              testId={testId}
            />
          )}
        </div>
      </div>
      <input
        type="range"
        aria-label={label}
        className="slider"
        min={effMin}
        max={effMax}
        step={step}
        value={value}
        style={{ ["--fill" as string]: `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onKeyDown={(e) => e.stopPropagation()}
        data-testid={testId ? `${testId}-slider` : undefined}
      />
      {hint && (
        <div className="muted small" style={{ fontSize: 11, marginTop: 6 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

/**
 * Compact, right-aligned numeric field for `percent` / `integer` values.
 * Money uses `MoneyInput` instead (currency glyph + grouping). Parsing is
 * locale-aware via `parseMoney`; clamping to [min, max] happens on blur so an
 * in-progress entry (e.g. "20" on the way to "2030") isn't fought mid-keystroke.
 */
function PlainNumberInput({
  value,
  onChange,
  locale,
  integer,
  decimals,
  suffix,
  min,
  max,
  ariaLabel,
  testId,
}: {
  value: number
  onChange: (v: number) => void
  locale: string
  integer: boolean
  decimals: number
  suffix: string
  min?: number
  max?: number
  ariaLabel: string
  testId?: string
}) {
  const errorId = useId()
  const fmt = (v: number) =>
    integer ? String(Math.round(v)) : formatMoney(v, locale, { decimals })

  const [text, setText] = useState(() => fmt(value))
  const [focused, setFocused] = useState(false)
  const [lastValue, setLastValue] = useState(value)
  const [lastLocale, setLastLocale] = useState(locale)
  const [error, setError] = useState<string | null>(null)

  // Reformat when the external value or locale changes while we're not editing
  // — React's "adjust state during render" pattern, same as MoneyInput.
  if (!focused && (value !== lastValue || locale !== lastLocale)) {
    setLastValue(value)
    setLastLocale(locale)
    setText(fmt(value))
    if (error !== null) setError(null)
  }

  function handleChange(raw: string) {
    setText(raw)
    if (raw.trim() === "") {
      setError(null)
      return // empty mid-edit: don't commit, don't nag
    }
    // Parse without min/max so a partial entry isn't rejected; clamp on blur.
    const r = parseMoney(raw, locale, { allowEmpty: false })
    if (r.ok) {
      setError(null)
      onChange(integer ? Math.round(r.value) : r.value)
    }
    // A still-unparseable string stays quiet until blur.
  }

  function handleBlur() {
    setFocused(false)
    if (text.trim() === "") {
      setText(fmt(value)) // revert to the live value
      setError(null)
      return
    }
    const r = parseMoney(text, locale, { allowEmpty: false })
    if (!r.ok) {
      setError(r.error)
      return
    }
    let v = r.value
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    if (integer) v = Math.round(v)
    setError(null)
    onChange(v)
    setText(fmt(v))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ position: "relative" }}>
        <input
          className="input-bare"
          type="text"
          inputMode={integer ? "numeric" : "decimal"}
          autoComplete="off"
          value={text}
          aria-label={ariaLabel}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          data-testid={testId}
          onFocus={() => setFocused(true)}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            // Don't let an enclosing slider/dialog hijack arrow/Enter keys.
            e.stopPropagation()
            if (e.ctrlKey || e.metaKey) return
            if (e.key.length !== 1) return
            if (!/[\d.,-]/.test(e.key)) e.preventDefault()
          }}
          style={{
            textAlign: "right",
            paddingRight: suffix ? 26 : 12,
            fontVariantNumeric: "tabular-nums",
          }}
        />
        {suffix && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13,
              color: "var(--neutral-400)",
              pointerEvents: "none",
            }}
          >
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <div
          id={errorId}
          role="alert"
          style={{
            fontSize: 11,
            color: "var(--danger, #B91C1C)",
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
