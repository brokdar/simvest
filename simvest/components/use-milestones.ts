"use client"

import { useMemo } from "react"
import { useData } from "@/components/providers/data-provider"
import { monthOf } from "@/lib/catch-up"
import {
  activeMilestones,
  detectMilestones,
  type Milestone,
} from "@/lib/milestones"

/**
 * Active milestones (T4) plus a dismiss action. A milestone stays until it is
 * dismissed or a newer one of its kind replaces it; dismissals live in the
 * database (`DataProvider`), so they follow the user across browsers. Overview
 * and the bell read the same state, so a dismissal in one clears the other.
 */
export function useMilestones(): {
  milestones: Milestone[]
  dismiss: (id: string) => void
} {
  const {
    portfolios,
    incomeEvents,
    goals,
    settings,
    today,
    dismissedMilestones,
    dismissMilestone,
  } = useData()

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
    () => activeMilestones(all, monthOf(today), dismissedMilestones),
    [all, today, dismissedMilestones]
  )

  return { milestones, dismiss: dismissMilestone }
}
