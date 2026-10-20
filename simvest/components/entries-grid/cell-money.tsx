"use client"

import { MoneyInput } from "@/components/money-input"
import { useResolvedLocale } from "@/components/use-resolved-locale"

type Props = {
  value: number | null
  onChange: (next: number | null) => void
  /** A typed amount couldn't be read (or was fixed: `null`). */
  onError: (error: string | null) => void
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
  onError,
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
        // A rejected amount reports an error and leaves the stored number
        // alone — never let it fall through as null / 0 (D1).
        onChange={(v, err) => {
          if (err !== null) {
            onError(err)
            return
          }
          onError(null)
          onChange(v)
        }}
        echo="compact"
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
