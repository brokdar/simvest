"use client"

import { useId, useRef, useState } from "react"
import { formatMoney, parseMoneyExpression } from "@/lib/locale"

const CURRENCY_NAMES: Record<string, string> = {
  "€": "euros",
  $: "dollars",
  "£": "pounds",
  "¥": "yen",
  "₹": "rupees",
}

function initialText(
  v: number | null,
  locale: string,
  decimals: number,
  allowEmpty: boolean
): string {
  if (v === null) return ""
  if (v === 0 && allowEmpty) return ""
  return formatMoney(v, locale, { decimals })
}

type Props = {
  value: number | null
  onChange: (value: number | null, error: string | null) => void
  locale: string
  currency?: string
  placeholder?: string
  allowEmpty?: boolean
  min?: number
  decimals?: number
  disabled?: boolean
  ariaLabel: string
  testId?: string
  autoFocus?: boolean
  /**
   * Text alignment of the amount. Defaults to `"left"` (the established look
   * for editor/grid fields). Pass `"right"` when the field sits in a column of
   * right-aligned numeric readouts so the digits line up — the currency glyph
   * stays pinned left regardless.
   */
  align?: "left" | "right"
}

export function MoneyInput({
  value,
  onChange,
  locale,
  currency = "€",
  placeholder,
  allowEmpty = true,
  min = 0,
  decimals = 2,
  disabled = false,
  ariaLabel,
  testId,
  autoFocus,
  align = "left",
}: Props) {
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState<string>(() =>
    initialText(value, locale, decimals, allowEmpty)
  )
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [lastValue, setLastValue] = useState<number | null>(value)
  const [lastLocale, setLastLocale] = useState(locale)

  // Reformat when external value or locale changes (and we're not editing).
  //
  // This is React's official "adjusting state on a prop change" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders):
  // setX calls during render schedule a single re-render before commit, so
  // children never see the stale text. A `useEffect` would briefly paint
  // the old text after a locale switch — don't refactor this into one.
  if (!focused && (value !== lastValue || locale !== lastLocale)) {
    setLastValue(value)
    setLastLocale(locale)
    setText(initialText(value, locale, decimals, allowEmpty))
    if (error !== null) setError(null)
  }

  // Money fields accept simple additive expressions like `200 + 300 + 421,32`
  // (operators `+`/`-` between numeric terms only — no `*`, `/`, parentheses).
  // Evaluated on blur; the field is rewritten with the resulting sum. A bare
  // number is just a one-term expression, so `parseMoneyExpression` defers to
  // `parseMoney` and behaves identically when there's no operator.
  function isInProgressExpression(s: string): boolean {
    const trimmed = s.trim()
    if (trimmed === "") return false
    const last = trimmed[trimmed.length - 1]
    return last === "+" || last === "-"
  }

  function parse(raw: string) {
    return parseMoneyExpression(raw, locale, { allowEmpty, min })
  }

  function handleChange(raw: string) {
    setText(raw)
    // Trailing operator (`200 +`) is a "still typing" state — don't yell at
    // the user yet, but also don't commit a value.
    if (isInProgressExpression(raw)) {
      setError(null)
      onChange(null, null)
      return
    }
    const result = parse(raw)
    if (result.ok) {
      setError(null)
      onChange(raw.trim() === "" && allowEmpty ? null : result.value, null)
    } else {
      setError(result.error)
      onChange(null, result.error)
    }
  }

  function handleBlur() {
    setFocused(false)
    if (text.trim() === "") {
      if (allowEmpty) {
        setError(null)
        onChange(null, null)
      }
      return
    }
    const result = parse(text)
    if (result.ok) {
      setText(formatMoney(result.value, locale, { decimals }))
      setError(null)
      onChange(result.value, null)
    } else {
      setError(result.error)
      onChange(null, result.error)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ position: "relative" }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 13,
            color: "var(--neutral-400)",
            pointerEvents: "none",
          }}
        >
          {currency}
        </span>
        <input
          ref={inputRef}
          className="input-bare"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          // The visible currency glyph is `aria-hidden`, so we append the
          // currency name to the accessible name. Falls back to the raw
          // symbol if it isn't in the map (good enough for a screen reader).
          aria-label={`${ariaLabel} in ${CURRENCY_NAMES[currency] ?? currency}`}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          data-testid={testId}
          onFocus={() => setFocused(true)}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            // Single flat allow-list: digits, whitespace, both possible
            // decimal/group separators (`.` and `,`), and the expression
            // operators (`-` / `+`). Multi-char keys (Backspace, arrows,
            // Tab, Home/End…) and clipboard shortcuts always pass. This is
            // only an early typo guard — `parseMoneyExpression` additionally
            // strips currency glyphs (€$£¥₹) that arrive via paste, so the
            // filter deliberately doesn't try to catch those.
            if (e.ctrlKey || e.metaKey) return
            if (e.key.length !== 1) return
            if (!/[\d\s.,+-]/.test(e.key)) e.preventDefault()
          }}
          style={{
            paddingLeft: 22,
            textAlign: align,
            fontVariantNumeric: align === "right" ? "tabular-nums" : undefined,
          }}
        />
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
