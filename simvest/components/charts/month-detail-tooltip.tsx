"use client"

import type { DividendBasis, IncomeEventDTO } from "@/lib/types"
import { PerMonthDetailPopover } from "./per-month-detail-popover"

type Props = {
  /** Left edge in container-relative px (callers clamp inside the chart). */
  left: number
  /** Anchor point in container-relative px — see `placement`. */
  top: number
  width?: number
  /**
   * `"below"`: card hangs down from `top`. `"above"`: card's bottom edge sits
   * at `top` (via translateY(-100%)), so the caller anchors to a bar's top
   * without measuring the card's height.
   */
  placement?: "above" | "below"
  year: number
  month: number
  basis: DividendBasis
  events: IncomeEventDTO[]
  testId: string
  /** Replaces the €0 summary for a month that isn't data (N5). */
  emptyText?: string
  /**
   * Touch-only action: select this month (the same `?month=` selection a
   * desktop click makes). Rendered as the tooltip's one tappable element.
   */
  onShowMonth?: () => void
}

/**
 * Shared floating detail card for month-aligned charts (monthly payouts +
 * calendar heatmap). Owns positioning + chrome; `PerMonthDetailPopover` fills
 * it. `pointerEvents: none` keeps it from stealing the hover that spawned it.
 */
export function MonthDetailTooltip({
  left,
  top,
  width = 240,
  placement = "below",
  year,
  month,
  basis,
  events,
  testId,
  emptyText,
  onShowMonth,
}: Props) {
  return (
    <div
      data-testid={testId}
      data-month-detail=""
      style={{
        position: "absolute",
        left,
        top,
        width,
        boxSizing: "border-box",
        transform: placement === "above" ? "translateY(-100%)" : undefined,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 12px",
        boxShadow: "var(--sh-lg)",
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      <PerMonthDetailPopover
        year={year}
        month={month}
        basis={basis}
        events={events}
        emptyText={emptyText}
      />
      {onShowMonth && (
        <button
          type="button"
          className="btn btn-secondary focus-ring"
          data-testid={`${testId}-show-month`}
          onClick={onShowMonth}
          style={{
            pointerEvents: "auto",
            minHeight: 44,
            width: "100%",
            marginTop: 8,
          }}
        >
          Show this month’s payouts
        </button>
      )}
    </div>
  )
}
