"use client"

/**
 * The one plain-language sentence a key screen opens with (P7). The text is
 * built by a pure function in `lib/narrative.ts`; null renders nothing, so a
 * screen with nothing honest to say yet stays quiet.
 */
export function ViewHeadline({
  text,
  testId,
}: {
  text: string | null
  testId: string
}) {
  if (!text) return null
  return (
    <p className="view-headline" data-testid={testId}>
      {text}
    </p>
  )
}
