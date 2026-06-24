"use client"

import { MonthYearPicker } from "@/components/month-year-picker"
import { formatEntryDate, resolveEntryDay } from "@/lib/dates"
import { useResolvedLocale } from "@/components/use-resolved-locale"

type Props = {
  year: number
  month: number
  day: number
  isDraft: boolean
  defaultEntryDay: string
  onChange: (next: { year: number; month: number; day: number }) => void
  testId?: string
}

export function CellDate({
  year,
  month,
  day,
  isDraft,
  defaultEntryDay,
  onChange,
  testId,
}: Props) {
  const { locale } = useResolvedLocale()
  if (!isDraft) {
    return (
      <div style={{ fontWeight: 600 }} data-testid={testId}>
        {formatEntryDate(year, month, day)}
      </div>
    )
  }
  return (
    <MonthYearPicker
      value={{ year, month }}
      onChange={(next) => {
        if (next === null) return
        const d = resolveEntryDay(defaultEntryDay, next.year, next.month)
        onChange({ year: next.year, month: next.month, day: d })
      }}
      locale={locale}
      testId={testId}
      ariaLabel="Month"
    />
  )
}
