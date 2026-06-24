"use client"

import { fmtNum } from "@/lib/format"
import { useResolvedLocale } from "@/components/use-resolved-locale"

type Props = {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  testId?: string
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  prefix = "",
  suffix = "",
  testId,
}: Props) {
  const { locale } = useResolvedLocale()
  // fmtNum is locale-cached; subscribing here makes the slider re-render
  // when the user switches Number format, picking up the new separator.
  const display = fmtNum(value, 1, locale)
  const fill = ((value - min) / (max - min)) * 100
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
            fontSize: 13,
            fontWeight: 500,
            color: "var(--neutral-600)",
          }}
        >
          {label}
        </span>
        <span
          className="mono"
          style={{ fontSize: 13, fontWeight: 700 }}
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {prefix}
          {display}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--fill" as string]: `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
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
}: {
  isCombined: boolean
  value: number
  onChange: (v: number) => void
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
              fontSize: 13,
              fontWeight: 500,
              color: "var(--neutral-600)",
            }}
          >
            Monthly saving (sum)
          </span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
            €{fmtNum(value, 0, locale)}
          </span>
        </div>
        <div className="muted small" style={{ fontSize: 11 }}>
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
      prefix="€"
      onChange={onChange}
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
          fontSize: 11,
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
          fontSize: 20,
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
