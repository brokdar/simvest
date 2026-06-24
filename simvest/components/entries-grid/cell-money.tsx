"use client"

import { MoneyInput } from "@/components/money-input"
import { useResolvedLocale } from "@/components/use-resolved-locale"

type Props = {
  value: number | null
  onChange: (next: number | null) => void
  ariaLabel: string
  testId?: string
  dirty: boolean
  allowEmpty?: boolean
  min?: number
  autoFocus?: boolean
}

export function CellMoney({
  value,
  onChange,
  ariaLabel,
  testId,
  dirty,
  allowEmpty = true,
  min,
  autoFocus,
}: Props) {
  const { locale } = useResolvedLocale()
  return (
    <div
      data-dirty={dirty || undefined}
      style={{
        borderLeft: dirty
          ? "3px solid var(--primary)"
          : "3px solid transparent",
        paddingLeft: 6,
        marginLeft: -9,
      }}
    >
      <MoneyInput
        value={value}
        onChange={(v) => onChange(v)}
        locale={locale}
        ariaLabel={ariaLabel}
        testId={testId}
        allowEmpty={allowEmpty}
        min={min}
        autoFocus={autoFocus}
      />
    </div>
  )
}
