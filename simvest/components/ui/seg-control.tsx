"use client"

import { useCallback, useRef } from "react"

export type SegOption<T extends string> = {
  value: T
  label: string
}

type Props<T extends string> = {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
  /** Visually hidden but exposed to assistive tech via aria-label. Required. */
  ariaLabel: string
  testId?: string
}

/**
 * Segmented radio group — visually a pill of buttons, semantically a single
 * radio control. Uses radiogroup/radio semantics (NOT tablist/tab) because the
 * choice filters the surrounding view rather than switching tab panels.
 *
 * Implements a roving tabindex: exactly one option is `tabIndex={0}`; the
 * others are `tabIndex={-1}`. Arrow keys cycle through them, matching the
 * WAI-ARIA radio-group pattern.
 */
export function SegControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  testId,
}: Props<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const focusAt = useCallback(
    (idx: number) => {
      const len = options.length
      const next = ((idx % len) + len) % len
      refs.current[next]?.focus()
      onChange(options[next].value)
    },
    [options, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault()
          focusAt(idx + 1)
          break
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault()
          focusAt(idx - 1)
          break
        case "Home":
          e.preventDefault()
          focusAt(0)
          break
        case "End":
          e.preventDefault()
          focusAt(options.length - 1)
          break
      }
    },
    [focusAt, options.length]
  )

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
      className="seg-control"
    >
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            data-testid={testId ? `${testId}-${o.value}` : undefined}
            data-active={active}
            className="seg-control-option focus-ring"
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
