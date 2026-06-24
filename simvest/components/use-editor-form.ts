"use client"

import { useState, type Dispatch, type SetStateAction } from "react"

/**
 * Editor dialogs need their form state to reset every time the dialog is
 * reopened against a different record. `useState`'s initial value is only
 * captured on first mount, so without intervention the form would keep stale
 * values across openings.
 *
 * This hook reads `key` (typically `entry?.id` or `goal?.id`) and rebuilds the
 * form during render when the dialog opens for a new record. It's a render-time
 * derivation — not a `useEffect` — which avoids the set-state-in-effect
 * anti-pattern and the extra paint cycle that comes with it.
 *
 * The setter signature mirrors `useState`, so editors can use either
 * `setForm(next)` or `setForm(prev => ...)` interchangeably.
 */
export function useEditorForm<F>(
  open: boolean,
  key: string | number | null,
  build: () => F
): [F, Dispatch<SetStateAction<F>>, () => void] {
  const [form, setForm] = useState<F>(build)
  // Track BOTH the key and the open state so that closing a dialog (e.g.
  // via Cancel) clears the tracked key, and reopening with the *same* key
  // rebuilds from defaults — without this the user's draft would persist
  // across close/open cycles.
  const [trackedKey, setTrackedKey] = useState<string | number | null>(
    open ? key : null
  )
  const [wasOpen, setWasOpen] = useState<boolean>(open)
  // Close transition — drop the tracked key so a future re-open is treated
  // as a fresh edit even if it has the same id.
  if (!open && wasOpen) {
    setWasOpen(false)
    setTrackedKey(null)
  }
  if (open && (!wasOpen || key !== trackedKey)) {
    setWasOpen(true)
    setTrackedKey(key)
    setForm(build())
  }
  const reset = () => setForm(build())
  return [form, setForm, reset]
}
