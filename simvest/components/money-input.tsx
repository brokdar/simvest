"use client"

import { useEffect, useId, useRef, useState } from "react"
import { fmtEUR } from "@/lib/format"
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
  /**
   * Where the parsed echo (`= €1.234,56`) appears while typing. `"inline"`
   * (default) puts it on its own line under the field; `"compact"` puts it
   * inside the field's right edge when the field is wide enough (the dense
   * entries grid on desktop — no row shift) and falls back to its own line
   * under the field otherwise. It never floats over other content.
   */
  echo?: "inline" | "compact"
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
  echo = "inline",
}: Props) {
  const errorId = useId()
  const echoId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  // `compact` echo: is the field wide enough to hold the typed amount and
  // the echo side by side? Measured, because grid cells change width with
  // the viewport (≈257px at 1440, ≈150px in a phone card).
  const [roomy, setRoomy] = useState(false)
  useEffect(() => {
    if (echo !== "compact" || align !== "left") return
    const el = fieldRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(([entry]) =>
      setRoomy(entry.contentRect.width >= COMPACT_MIN_WIDTH)
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [echo, align])
  const [text, setText] = useState<string>(() =>
    initialText(value, locale, decimals, allowEmpty)
  )
  const [error, setError] = useState<string | null>(null)
  // D1: the value the parser thinks was meant when the input was written in
  // the other number convention. Only ever applied by an explicit tap.
  const [suggestion, setSuggestion] = useState<number | null>(null)
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
    if (suggestion !== null) setSuggestion(null)
  }

  // Money fields accept simple additive expressions like `200 + 300 + 421,32`
  // (operators `+`/`-` between numeric terms only — no `*`, `/`, parentheses).
  // Evaluated on blur; the field is rewritten with the resulting sum. A bare
  // number is just a one-term expression, so `parseMoneyExpression` defers to
  // `parseMoney` and behaves identically when there's no operator.
  //
  // A trailing operator or separator (`200 +`, `12,`) is a "still typing"
  // state: no error yet, no echo, no commit.
  function isInProgress(s: string): boolean {
    const trimmed = s.trim()
    if (trimmed === "") return false
    return /[+\-.,]$/.test(trimmed)
  }

  function parse(raw: string) {
    // Cents are the finest unit a money field stores (D1: "1.000,005" is
    // rejected with "Did you mean 1.000,01?", never rounded silently).
    return parseMoneyExpression(raw, locale, {
      allowEmpty,
      min,
      maxFractionDigits: 2,
    })
  }

  // Only offer a suggestion the field would actually accept (a negative
  // reading in a `min={0}` field isn't a fix).
  function usableSuggestion(s: number | undefined): number | null {
    if (s === undefined) return null
    if (min !== undefined && s < min) return null
    return s
  }

  function handleChange(raw: string) {
    setText(raw)
    if (isInProgress(raw)) {
      setError(null)
      setSuggestion(null)
      onChange(null, null)
      return
    }
    const result = parse(raw)
    if (result.ok) {
      setError(null)
      setSuggestion(null)
      onChange(raw.trim() === "" && allowEmpty ? null : result.value, null)
    } else {
      setError(result.error)
      setSuggestion(usableSuggestion(result.suggestion))
      onChange(null, result.error)
    }
  }

  function handleBlur() {
    setFocused(false)
    if (text.trim() === "") {
      if (allowEmpty) {
        setError(null)
        setSuggestion(null)
        onChange(null, null)
      }
      return
    }
    const result = parse(text)
    if (result.ok) {
      setText(formatMoney(result.value, locale, { decimals }))
      setError(null)
      setSuggestion(null)
      onChange(result.value, null)
    } else {
      setError(result.error)
      setSuggestion(usableSuggestion(result.suggestion))
      onChange(null, result.error)
    }
  }

  function applySuggestion() {
    if (suggestion === null) return
    const next = suggestion
    setText(formatMoney(next, locale, { decimals }))
    setError(null)
    setSuggestion(null)
    onChange(next, null)
    inputRef.current?.focus()
  }

  // D5: echo the parsed interpretation while typing, so what will be stored
  // is visible before it is committed.
  const echoValue = (() => {
    if (!focused || error !== null) return null
    if (text.trim() === "" || isInProgress(text)) return null
    const r = parse(text)
    return r.ok ? r.value : null
  })()
  const echoText =
    echoValue === null
      ? null
      : currency === "€"
        ? fmtEUR(echoValue, {}, locale)
        : `${currency}${formatMoney(echoValue, locale)}`

  const echoInField = echo === "compact" && roomy && align === "left"

  const describedBy =
    [error ? errorId : null, echoText ? echoId : null]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div ref={fieldRef} style={{ position: "relative" }}>
        {echoText && echoInField && (
          <EchoChip id={echoId} text={echoText} inField testId={testId} />
        )}
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "var(--fs-sm)",
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
          aria-describedby={describedBy}
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
            // Reserve the echo's width so typed digits never run under it
            // (over-estimated in the input's `ch`; the chip's font is smaller).
            paddingRight:
              echoText && echoInField
                ? `calc(${echoText.length + 3}ch)`
                : undefined,
            textAlign: align,
            fontVariantNumeric: align === "right" ? "tabular-nums" : undefined,
          }}
        />
      </div>
      {echoText && !echoInField && (
        <EchoChip id={echoId} text={echoText} testId={testId} />
      )}
      {error && (
        <div
          id={errorId}
          role="alert"
          data-testid={testId ? `error-${testId}` : undefined}
          className="money-error"
        >
          {error}
          {suggestion !== null && (
            <>
              {" "}
              <button
                type="button"
                className="money-suggest"
                // Keep focus in the field so blur doesn't re-run the parse
                // and swallow the click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={applySuggestion}
                data-testid={testId ? `suggest-${testId}` : undefined}
              >
                Use {formatMoney(suggestion, locale, { decimals })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Below this field width the compact echo moves to its own line. */
const COMPACT_MIN_WIDTH = 200

function EchoChip({
  id,
  text,
  inField = false,
  testId,
}: {
  id: string
  text: string
  inField?: boolean
  testId?: string
}) {
  return (
    <div
      id={id}
      className="money-echo"
      data-in-field={inField || undefined}
      data-testid={testId ? `echo-${testId}` : undefined}
      // Polite, not assertive: the echo updates on every keystroke.
      aria-live="polite"
    >
      <span aria-hidden>=</span>{" "}
      <span className="money-echo-amount">{text}</span>
    </div>
  )
}
