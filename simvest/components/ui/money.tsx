"use client"

import { fmtEUR, type FmtEurOpts } from "@/lib/format"
import { cn } from "@/lib/utils"

type Tone = "auto" | "neg" | "pos" | "muted" | "none"

export type MoneyProps = {
  value: number | null | undefined
  /** Adds + prefix for positive values (negative is always shown). */
  sign?: boolean
  /** Brief format (€1,5M / €15k). Drops cents. */
  compact?: boolean
  /** Override decimal precision. Defaults to 2 (or 0 if compact). */
  decimals?: number
  /**
   * "auto" colors by sign (pos/neg). "neg" / "pos" / "muted" force a tone.
   * "none" applies no color class (default).
   */
  tone?: Tone
  className?: string
  /** Rendered when value is null/undefined/NaN. Defaults to em-dash. */
  placeholder?: React.ReactNode
}

/**
 * Canonical money display. Always shows cents by default, renders an em-dash
 * for unknown (null/undefined/NaN) values, and applies the project's mono
 * font. Use this in tables, KPIs, and any column where money appears in
 * isolation. For string interpolation (titles, sentences) use `fmtEUR`
 * directly — it has the same default.
 */
export function Money({
  value,
  sign,
  compact,
  decimals,
  tone = "none",
  className,
  placeholder = "—",
}: MoneyProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cn("muted mono", className)}>{placeholder}</span>
  }
  const opts: FmtEurOpts = { sign, compact, decimals }
  const text = fmtEUR(value, opts)
  const toneClass =
    tone === "auto"
      ? value < 0
        ? "neg"
        : value > 0
          ? "pos"
          : ""
      : tone === "none"
        ? ""
        : tone
  return <span className={cn("mono", toneClass, className)}>{text}</span>
}
