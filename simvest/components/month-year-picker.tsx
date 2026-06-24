"use client"

import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Icon } from "@/components/icon"

const MIN_YEAR = 1970

type Value = { year: number; month: number } | null

type Props = {
  value: Value
  onChange: (next: Value) => void
  locale: string
  placeholder?: string
  ariaLabel?: string
  testId?: string
  disabled?: boolean
  maxDate?: { year: number; month: number } // inclusive upper bound; defaults to "now"
}

const MONTH_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

function monthLabel(monthIdx: number, locale: string): string {
  const d = new Date(2000, monthIdx, 1)
  return d.toLocaleDateString(locale, { month: "short" })
}

function fullLabel(year: number, month: number, locale: string): string {
  // month is 1-12 here
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString(locale, { month: "short", year: "numeric" })
}

export function MonthYearPicker({
  value,
  onChange,
  locale,
  placeholder = "Pick month",
  ariaLabel,
  testId,
  disabled = false,
  maxDate,
}: Props) {
  const now = new Date()
  const upper = maxDate ?? {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  }

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(value?.year ?? upper.year)
  const [prevOpen, setPrevOpen] = useState(open)

  // When the popover opens, jump the view to the currently-selected year
  // (or to the current year if nothing is selected yet).
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setViewYear(value?.year ?? upper.year)
  }

  const buttonLabel =
    value !== null ? fullLabel(value.year, value.month, locale) : placeholder

  function isMonthDisabled(year: number, monthIdx0: number): boolean {
    if (year > upper.year) return true
    if (year === upper.year && monthIdx0 + 1 > upper.month) return true
    if (year < MIN_YEAR) return true
    return false
  }

  function pick(monthIdx0: number) {
    if (isMonthDisabled(viewYear, monthIdx0)) return
    onChange({ year: viewYear, month: monthIdx0 + 1 })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="input-bare"
          disabled={disabled}
          aria-label={ariaLabel}
          data-testid={testId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: disabled ? "not-allowed" : "pointer",
            textAlign: "left",
            color: value ? "var(--neutral-800)" : "var(--neutral-400)",
          }}
        >
          <Icon name="calendar" size={14} />
          <span style={{ flex: 1 }}>{buttonLabel}</span>
          <Icon name="chevronDown" size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        style={{ width: 260, padding: 12, background: "var(--surface)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <button
            type="button"
            aria-label="Previous year"
            onClick={() => setViewYear((y) => Math.max(MIN_YEAR, y - 1))}
            disabled={viewYear <= MIN_YEAR}
            className="btn btn-icon btn-ghost"
            style={{ height: 28, width: 28 }}
          >
            <Icon name="chevronLeft" size={14} />
          </button>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--neutral-800)",
            }}
            aria-live="polite"
          >
            {viewYear}
          </div>
          <button
            type="button"
            aria-label="Next year"
            onClick={() => setViewYear((y) => Math.min(upper.year, y + 1))}
            disabled={viewYear >= upper.year}
            className="btn btn-icon btn-ghost"
            style={{ height: 28, width: 28 }}
          >
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <div role="grid" aria-label="Month picker">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              role="row"
              style={{ display: "flex", gap: 4, marginBottom: 4 }}
            >
              {MONTH_KEYS.slice(row * 4, row * 4 + 4).map((m) => {
                const selected =
                  value?.year === viewYear && value?.month === m + 1
                const disabledMonth = isMonthDisabled(viewYear, m)
                return (
                  <button
                    key={m}
                    type="button"
                    role="gridcell"
                    aria-selected={selected}
                    aria-disabled={disabledMonth}
                    disabled={disabledMonth}
                    onClick={() => pick(m)}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: "1px solid",
                      borderColor: selected ? "var(--primary)" : "transparent",
                      background: selected
                        ? "var(--primary-50, #EFF6FF)"
                        : "transparent",
                      color: disabledMonth
                        ? "var(--neutral-300)"
                        : selected
                          ? "var(--primary)"
                          : "var(--neutral-700)",
                      cursor: disabledMonth ? "not-allowed" : "pointer",
                    }}
                  >
                    {monthLabel(m, locale)}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        {value !== null && (
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "6px",
              fontSize: 12,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "transparent",
              color: "var(--neutral-600)",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
