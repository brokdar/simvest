"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { INCOME_HOLDING_PARAM } from "@/lib/types"

export type IncomeSortKey =
  | "name"
  | "received"
  | "lastPaid"
  | "count"
  | "cadence"
  | "share"

export type IncomeSortDir = "asc" | "desc"

export type IncomeKindFilter = "all" | "dividend" | "interest"

export type IncomeSearchParams = {
  month: string | null
  holding: number | "interest" | null
  sortKey: IncomeSortKey
  sortDir: IncomeSortDir
  kind: IncomeKindFilter
}

const VALID_KEYS: IncomeSortKey[] = [
  "name",
  "received",
  "lastPaid",
  "count",
  "cadence",
  "share",
]

const VALID_KINDS: IncomeKindFilter[] = ["all", "dividend", "interest"]

function parseMonth(raw: string | null): string | null {
  if (!raw) return null
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null
}

function parseHolding(raw: string | null): number | "interest" | null {
  if (!raw) return null
  if (raw === "interest") return "interest"
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function useIncomeSearchParams() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const params = useMemo<IncomeSearchParams>(() => {
    const sortKeyRaw = sp.get("sort")
    const sortDirRaw = sp.get("dir")
    const kindRaw = sp.get("kind")
    return {
      month: parseMonth(sp.get("month")),
      holding: parseHolding(sp.get(INCOME_HOLDING_PARAM)),
      sortKey: VALID_KEYS.includes(sortKeyRaw as IncomeSortKey)
        ? (sortKeyRaw as IncomeSortKey)
        : "received",
      sortDir: sortDirRaw === "asc" ? "asc" : "desc",
      kind: VALID_KINDS.includes(kindRaw as IncomeKindFilter)
        ? (kindRaw as IncomeKindFilter)
        : "all",
    }
  }, [sp])

  const replaceWith = useCallback(
    (mut: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(sp.toString())
      mut(next)
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, sp]
  )

  const setMonth = useCallback(
    (m: string | null) => {
      replaceWith((next) => {
        if (m) next.set("month", m)
        else next.delete("month")
      })
    },
    [replaceWith]
  )

  const setHolding = useCallback(
    (h: number | "interest" | null) => {
      replaceWith((next) => {
        if (h === null) next.delete(INCOME_HOLDING_PARAM)
        else next.set(INCOME_HOLDING_PARAM, String(h))
      })
    },
    [replaceWith]
  )

  const setSort = useCallback(
    (s: { key: IncomeSortKey; dir: IncomeSortDir }) => {
      replaceWith((next) => {
        next.set("sort", s.key)
        next.set("dir", s.dir)
      })
    },
    [replaceWith]
  )

  const setKind = useCallback(
    (k: IncomeKindFilter) => {
      replaceWith((next) => {
        if (k === "all") next.delete("kind")
        else next.set("kind", k)
      })
    },
    [replaceWith]
  )

  return { params, setMonth, setHolding, setSort, setKind }
}
