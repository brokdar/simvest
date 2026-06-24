"use client"

import { useMemo } from "react"
import { useData } from "@/components/providers/data-provider"
import { useLocale } from "@/lib/locale"

export type LocaleSource = "user" | "browser" | "fallback"

export type ResolvedLocale = {
  locale: string
  source: LocaleSource
}

export const SSR_FALLBACK = "en-US"

/**
 * Pure resolution function — kept separate from the hook so it can be
 * unit-tested without a React renderer (the project's vitest config runs
 * in Node, no jsdom). Precedence: user pick → browser → SSR fallback.
 */
export function resolveLocale(
  settingsLocale: string | null,
  browserLocale: string
): ResolvedLocale {
  if (settingsLocale) {
    return { locale: settingsLocale, source: "user" }
  }
  if (browserLocale && browserLocale !== SSR_FALLBACK) {
    return { locale: browserLocale, source: "browser" }
  }
  return { locale: SSR_FALLBACK, source: "fallback" }
}

/**
 * Resolves the active number-formatting locale. See `resolveLocale` for the
 * precedence rules. Returns a memoized object so callers can place the
 * result in dependency arrays without busting downstream memoization.
 *
 * Lives in `components/` (not `lib/locale.ts`) so the React-tree dependency
 * on `useData()` does not pull `lib/locale.ts` — which is also imported by
 * `MoneyInput` — into a cycle with `DataProvider`.
 */
export function useResolvedLocale(): ResolvedLocale {
  const { settings } = useData()
  const browser = useLocale()
  return useMemo(
    () => resolveLocale(settings.locale, browser),
    [settings.locale, browser]
  )
}
