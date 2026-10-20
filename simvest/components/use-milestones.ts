"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useData } from "@/components/providers/data-provider"
import { monthOf } from "@/lib/catch-up"
import {
  detectMilestones,
  recentMilestones,
  type Milestone,
} from "@/lib/milestones"

/**
 * Recent milestones (T4) plus a dismiss action. Which ones were dismissed is
 * kept in this browser's localStorage — a per-browser nicety, not data, so
 * there's no table for it. Overview and the bell read the same store, so a
 * dismissal in one place clears it in the other.
 */
export const MILESTONES_DISMISSED_KEY = "simvest.milestones.dismissed"

const listeners = new Set<() => void>()

function read(): string {
  try {
    return window.localStorage.getItem(MILESTONES_DISMISSED_KEY) ?? ""
  } catch {
    return ""
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === MILESTONES_DISMISSED_KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function parse(raw: string): Set<string> {
  try {
    const v: unknown = raw ? JSON.parse(raw) : []
    return new Set(
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : []
    )
  } catch {
    return new Set()
  }
}

export function useMilestones(): {
  milestones: Milestone[]
  dismiss: (id: string) => void
} {
  const { portfolios, incomeEvents, goals, settings, today } = useData()
  const raw = useSyncExternalStore(subscribe, read, () => "")
  const dismissed = useMemo(() => parse(raw), [raw])

  const all = useMemo(
    () =>
      detectMilestones({
        portfolios,
        incomeEvents,
        goals,
        basis: settings.dividendBasis,
        defaultSwr: settings.defaultSwr,
      }),
    [
      portfolios,
      incomeEvents,
      goals,
      settings.dividendBasis,
      settings.defaultSwr,
    ]
  )
  const milestones = useMemo(
    () => recentMilestones(all, monthOf(today), dismissed),
    [all, today, dismissed]
  )

  const dismiss = useCallback((id: string) => {
    const next = parse(read())
    next.add(id)
    try {
      window.localStorage.setItem(
        MILESTONES_DISMISSED_KEY,
        JSON.stringify([...next])
      )
    } catch {
      // Private mode: the dismissal lasts until reload, which is fine.
    }
    for (const l of listeners) l()
  }, [])

  return { milestones, dismiss }
}
