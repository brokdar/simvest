"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme"

// A tiny external store over localStorage + the OS colour-scheme query. The
// <head> init script (THEME_INIT_SCRIPT) has already applied the stored theme
// before hydration; this keeps it in sync afterwards — preference changes in
// Settings, other tabs (the `storage` event) and OS flips while on "System".

const listeners = new Set<() => void>()
const DARK_QUERY = "(prefers-color-scheme: dark)"

function readPreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(v) ? v : DEFAULT_THEME_PREFERENCE
  } catch {
    return DEFAULT_THEME_PREFERENCE
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const mq = window.matchMedia(DARK_QUERY)
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) listener()
  }
  mq.addEventListener("change", listener)
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    mq.removeEventListener("change", listener)
    window.removeEventListener("storage", onStorage)
  }
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
}

/**
 * Current theme preference + the theme it resolves to, and a setter that
 * persists the choice. SSR renders the default; the first client snapshot
 * reads the stored value.
 */
export function useTheme(): {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (next: ThemePreference) => void
} {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    () => DEFAULT_THEME_PREFERENCE
  )
  const prefersDark = useSyncExternalStore(
    subscribe,
    systemPrefersDark,
    () => resolveTheme(DEFAULT_THEME_PREFERENCE, false) === "dark"
  )
  const resolved = resolveTheme(preference, prefersDark)

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage unavailable (private mode): still apply for this page view.
    }
    applyTheme(resolveTheme(next, systemPrefersDark()))
    emit()
  }, [])

  return { preference, resolved, setPreference }
}

/**
 * Mounted once in the root layout. Re-applies the theme when it changes
 * outside the Settings control: an OS flip while on "System", or another tab.
 * Reads storage directly rather than via `useTheme`, whose hydration pass
 * reports the SSR default and would briefly undo the init script.
 */
export function ThemeSync(): null {
  useEffect(() => {
    const sync = () =>
      applyTheme(resolveTheme(readPreference(), systemPrefersDark()))
    // Catch an OS flip that happened between the init script and hydration.
    sync()
    return subscribe(sync)
  }, [])
  return null
}
