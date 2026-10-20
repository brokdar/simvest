"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@/components/icon"
import { useData } from "@/components/providers/data-provider"
import { fmtCount, fmtEUR } from "@/lib/format"
import { INCOME_HOLDING_PARAM, type GoalDTO } from "@/lib/types"
import { swatch } from "@/lib/palette"

function goalSubLabel(g: GoalDTO): string {
  const yearTail = `by ${g.targetYear}`
  switch (g.kind) {
    case "portfolio_value":
      return `${fmtEUR(g.target, { compact: true })} · ${yearTail}`
    case "annual_income":
      return `${fmtEUR(g.target)}/yr · ${yearTail}`
    case "dividend_annual":
      return `${fmtEUR(g.target)} divs/yr · ${yearTail}`
    case "dividend_monthly":
      return `${fmtEUR(g.target)} divs/mo · ${yearTail}`
  }
}

type Hit =
  | { kind: "portfolio"; id: number; name: string; color: string; sub: string }
  | { kind: "goal"; id: number; name: string; color: string; sub: string }
  | { kind: "holding"; id: number; name: string; sub: string }
  | {
      kind: "entry"
      portfolioId: number
      portfolioName: string
      entryLabel: string
      note: string
      value: number | null
    }

const MAX_PORTFOLIOS = 3
const MAX_GOALS = 4
const MAX_HOLDINGS = 4
const MAX_ENTRIES = 6

export function TopbarSearch() {
  const router = useRouter()
  const { portfolios, goals, holdings, setSelectedPortfolio } = useData()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Close on outside click and Escape
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []

    const portfolioHits: Hit[] = portfolios
      .filter((p) => p.name.toLowerCase().includes(needle))
      .slice(0, MAX_PORTFOLIOS)
      .map((p) => ({
        kind: "portfolio" as const,
        id: p.id,
        name: p.name,
        color: p.color,
        sub: p.entries.length
          ? `${fmtEUR(p.entries.at(-1)!.value, { compact: true })} · ${fmtCount(p.entries.length, "entry", "entries")}`
          : "no entries yet",
      }))

    const goalHits: Hit[] = goals
      .filter((g) => g.name.toLowerCase().includes(needle))
      .slice(0, MAX_GOALS)
      .map((g) => ({
        kind: "goal" as const,
        id: g.id,
        name: g.name,
        color: g.color,
        sub: goalSubLabel(g),
      }))

    const portfolioName = new Map(portfolios.map((p) => [p.id, p.name]))
    const holdingHits: Hit[] = holdings
      .filter(
        (h) =>
          h.name.toLowerCase().includes(needle) ||
          (h.isin?.toLowerCase().includes(needle) ?? false)
      )
      .slice(0, MAX_HOLDINGS)
      .map((h) => ({
        kind: "holding" as const,
        id: h.id,
        name: h.name,
        sub: [h.isin, portfolioName.get(h.portfolioId)]
          .filter(Boolean)
          .join(" · "),
      }))

    // Entry labels are short ("Apr ’26"), so match the full year too — a
    // search for "2023" should find that year's entries.
    const entryHits: Hit[] = []
    for (const p of portfolios) {
      for (const e of p.entries) {
        const hayNote = e.note.toLowerCase()
        const hayLabel = e.label.toLowerCase()
        if (
          hayNote.includes(needle) ||
          hayLabel.includes(needle) ||
          String(e.year).includes(needle)
        ) {
          entryHits.push({
            kind: "entry" as const,
            portfolioId: p.id,
            portfolioName: p.name,
            entryLabel: e.label,
            note: e.note,
            value: e.value,
          })
          if (entryHits.length >= MAX_ENTRIES) break
        }
      }
      if (entryHits.length >= MAX_ENTRIES) break
    }

    return [...portfolioHits, ...holdingHits, ...goalHits, ...entryHits]
  }, [q, portfolios, goals, holdings])

  const isOpen = open && q.trim().length > 0

  const choose = (hit: Hit) => {
    setOpen(false)
    setQ("")
    if (hit.kind === "portfolio") {
      setSelectedPortfolio(hit.id)
      router.push("/projection")
    } else if (hit.kind === "holding") {
      router.push(`/income?${INCOME_HOLDING_PARAM}=${hit.id}`)
    } else if (hit.kind === "goal") {
      router.push(`/goals?goal=${hit.id}`)
    } else {
      setSelectedPortfolio(hit.portfolioId)
      router.push("/entries")
    }
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative" }}
      data-testid="search-container"
    >
      <input
        ref={inputRef}
        role="combobox"
        type="search"
        aria-label="Search portfolios, holdings, goals and entries"
        aria-expanded={isOpen}
        aria-controls="search-listbox"
        aria-autocomplete="list"
        className="input-bare"
        placeholder="Search holdings, entries…"
        style={{ width: 260, paddingLeft: 34 }}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (q) setOpen(true)
        }}
        data-testid="search-input"
      />
      <Icon
        name="search"
        size={16}
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--neutral-400)",
          pointerEvents: "none",
        }}
      />
      {isOpen && (
        <div
          id="search-listbox"
          role="listbox"
          aria-label="Search results"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            minWidth: 320,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--sh-lg)",
            padding: 6,
            zIndex: 50,
          }}
        >
          {hits.length === 0 ? (
            <div
              className="muted small"
              style={{ padding: "10px 12px" }}
              data-testid="search-no-results"
            >
              No matches for{" "}
              <strong style={{ color: "var(--neutral-800)" }}>{q}</strong>.
            </div>
          ) : (
            <ResultGroups hits={hits} onChoose={choose} />
          )}
        </div>
      )}
    </div>
  )
}

function ResultGroups({
  hits,
  onChoose,
}: {
  hits: Hit[]
  onChoose: (h: Hit) => void
}) {
  const portfolios = hits.filter((h) => h.kind === "portfolio")
  const holdings = hits.filter((h) => h.kind === "holding")
  const goals = hits.filter((h) => h.kind === "goal")
  const entries = hits.filter((h) => h.kind === "entry")

  return (
    <>
      {portfolios.length > 0 && (
        <Group title="Portfolios" testId="search-group-portfolios">
          {portfolios.map((h, i) =>
            h.kind === "portfolio" ? (
              <ResultRow key={`p${i}`} onClick={() => onChoose(h)}>
                <span className="dot" style={{ background: swatch(h.color) }} />
                <div className="pf-dd-label">
                  <span className="pf-dd-name">{h.name}</span>
                  <span className="pf-dd-sub">{h.sub}</span>
                </div>
                <span className="muted small">Open projection</span>
              </ResultRow>
            ) : null
          )}
        </Group>
      )}
      {holdings.length > 0 && (
        <Group title="Holdings" testId="search-group-holdings">
          {holdings.map((h, i) =>
            h.kind === "holding" ? (
              <ResultRow key={`h${i}`} onClick={() => onChoose(h)}>
                <span
                  className="dot"
                  style={{
                    background: "var(--primary-50)",
                    border: "1px solid var(--primary-200)",
                  }}
                />
                <div className="pf-dd-label">
                  <span className="pf-dd-name">{h.name}</span>
                  <span className="pf-dd-sub">{h.sub}</span>
                </div>
                <span className="muted small">Open payouts</span>
              </ResultRow>
            ) : null
          )}
        </Group>
      )}
      {goals.length > 0 && (
        <Group title="Goals" testId="search-group-goals">
          {goals.map((h, i) =>
            h.kind === "goal" ? (
              <ResultRow key={`g${i}`} onClick={() => onChoose(h)}>
                <span className="dot" style={{ background: swatch(h.color) }} />
                <div className="pf-dd-label">
                  <span className="pf-dd-name">{h.name}</span>
                  <span className="pf-dd-sub">{h.sub}</span>
                </div>
                <span className="muted small">Open goal</span>
              </ResultRow>
            ) : null
          )}
        </Group>
      )}
      {entries.length > 0 && (
        <Group title="Entries" testId="search-group-entries">
          {entries.map((h, i) =>
            h.kind === "entry" ? (
              <ResultRow key={`e${i}`} onClick={() => onChoose(h)}>
                <span
                  className="dot"
                  style={{
                    background: "var(--secondary-200)",
                    border: "1px solid var(--secondary-400)",
                  }}
                />
                <div className="pf-dd-label">
                  <span className="pf-dd-name">
                    {h.entryLabel}{" "}
                    <span
                      style={{ color: "var(--neutral-400)", fontWeight: 500 }}
                    >
                      · {h.portfolioName}
                    </span>
                  </span>
                  <span className="pf-dd-sub">
                    {h.note || fmtEUR(h.value, { compact: true })}
                  </span>
                </div>
                <span className="muted small">Open entries</span>
              </ResultRow>
            ) : null
          )}
        </Group>
      )}
    </>
  )
}

function Group({
  title,
  testId,
  children,
}: {
  title: string
  testId?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 4 }} data-testid={testId}>
      <div
        style={{
          fontSize: "var(--fs-2xs)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--neutral-400)",
          padding: "8px 10px 4px",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function ResultRow({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={onClick}
      data-testid="search-result"
      className="search-result-btn"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        background: "transparent",
        border: 0,
        borderRadius: "var(--r-sm)",
        cursor: "pointer",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
      }}
    >
      {children}
    </button>
  )
}
