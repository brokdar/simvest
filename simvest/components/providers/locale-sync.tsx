"use client"

import { useResolvedLocale } from "@/components/use-resolved-locale"
import { getActiveLocale, setActiveLocale } from "@/lib/format"

/**
 * Bridges the user's resolved locale into the module-level cache used by
 * `fmtEUR / fmtPct / fmtNum`. Mounted once inside `DataProvider` so every
 * descendant render reads from a consistent locale without threading the
 * value through props.
 *
 * The sync happens synchronously during render (not in `useEffect`) so that
 * the *first* render after the locale changes already formats correctly —
 * children render after the parent's render body, picking up the new value.
 */
export function LocaleSync(): null {
  const { locale } = useResolvedLocale()
  if (getActiveLocale() !== locale) {
    setActiveLocale(locale)
  }
  return null
}
