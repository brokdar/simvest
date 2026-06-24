"use client"

type Props = {
  value: string
  onChange: (next: string) => void
  dirty: boolean
  testId?: string
  /** Disambiguates the input across many rows in a table; e.g. "Dec 2023". */
  monthLabel: string
}

export function CellNote({
  value,
  onChange,
  dirty,
  testId,
  monthLabel,
}: Props) {
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
      <input
        type="text"
        className="input-bare"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        aria-label={`Note for ${monthLabel}`}
        placeholder="Add a note…"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}
