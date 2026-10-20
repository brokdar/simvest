"use client"

import type { ReactNode } from "react"
import { fmtSliderValue, snapToStep, type SliderUnit } from "@/lib/format"
import { useResolvedLocale } from "@/components/use-resolved-locale"

type Props = {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  /** What the value measures — picks the readout format (fmtSliderValue). */
  unit: SliderUnit
  /** One line under the label: what this changes and where it shows up. */
  hint?: ReactNode
  testId?: string
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
  hint,
  testId,
}: Props) {
  const { locale } = useResolvedLocale()
  // fmtSliderValue is locale-cached; subscribing here makes the slider re-render
  // when the user switches Number format, picking up the new separator.
  // Snap to the step grid so float noise from the range input or the DB
  // (4.900000095367432) never reaches the readout, the aria-valuenow or
  // storage.
  const snapped = snapToStep(value, step, min)
  const display = fmtSliderValue(snapped, unit, locale)
  const fill = ((snapped - min) / (max - min)) * 100
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: "var(--fs-sm)",
            fontWeight: 500,
            color: "var(--neutral-600)",
          }}
        >
          {label}
        </span>
        <span
          className="mono"
          style={{ fontSize: "var(--fs-sm)", fontWeight: 700 }}
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {display}
        </span>
      </div>
      {hint && (
        <div
          className="muted small"
          style={{ fontSize: "var(--fs-2xs)", margin: "-4px 0 8px" }}
          data-testid={testId ? `${testId}-hint` : undefined}
        >
          {hint}
        </div>
      )}
      <input
        type="range"
        aria-label={label}
        className="slider"
        min={min}
        max={max}
        step={step}
        value={snapped}
        style={{ ["--fill" as string]: `${fill}%` } as React.CSSProperties}
        onChange={(e) =>
          onChange(snapToStep(parseFloat(e.target.value), step, min))
        }
        onKeyDown={(e) => e.stopPropagation()}
        data-testid={testId}
      />
    </div>
  )
}

/**
 * "Monthly saving" slider used by Chart + Sandbox views.
 *
 * Saving rate is now per-portfolio — a single global control would silently
 * misrepresent what the user actually contributes. When "Combined" is
 * selected the slider becomes a read-only sum with a hint to switch.
 */
export function MonthlySavingControl({
  isCombined,
  value,
  onChange,
  testId,
}: {
  isCombined: boolean
  value: number
  onChange: (v: number) => void
  testId?: string
}) {
  const { locale } = useResolvedLocale()
  if (isCombined) {
    return (
      <div
        style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}
        data-testid="monthly-saving-readonly"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: "var(--fs-sm)",
              fontWeight: 500,
              color: "var(--neutral-600)",
            }}
          >
            Monthly saving (sum)
          </span>
          <span
            className="mono"
            style={{ fontSize: "var(--fs-sm)", fontWeight: 700 }}
          >
            {fmtSliderValue(value, "money", locale)}
          </span>
        </div>
        <div className="muted small" style={{ fontSize: "var(--fs-2xs)" }}>
          Switch to a specific portfolio in the dropdown to edit its
          contribution.
        </div>
      </div>
    )
  }
  return (
    <SliderRow
      label="Monthly saving"
      value={value}
      min={0}
      max={5000}
      step={50}
      unit="money"
      onChange={onChange}
      testId={testId}
    />
  )
}

export function Stat({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string
  value: string | number
  sub?: string
  valueClassName?: string
}) {
  return (
    <div>
      <div
        className="muted small"
        style={{
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontSize: "var(--fs-2xs)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        className={valueClassName ? `mono ${valueClassName}` : "mono"}
        style={{
          fontFamily: "var(--font-head)",
          fontWeight: 700,
          fontSize: "var(--fs-3xl)",
          letterSpacing: "-0.01em",
          margin: "4px 0",
        }}
      >
        {value}
      </div>
      {sub ? <div className="muted small">{sub}</div> : null}
    </div>
  )
}
