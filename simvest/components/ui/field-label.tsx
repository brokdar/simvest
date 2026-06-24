"use client"

/**
 * Shared editor field label. Five copies of this 12px/600/neutral-600
 * label existed across the editor components before this was extracted.
 *
 * `htmlFor` is optional for backwards compatibility with the existing
 * call sites (which rely on the label-wraps-control pattern, e.g. the
 * money input rendered inside the dialog body), but new code that hands
 * out an explicit `id` should pass it so click-to-focus and screen-reader
 * association are both wired up.
 */
export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--neutral-600)",
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  )
}
