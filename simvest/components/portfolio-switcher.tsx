"use client"

import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useData } from "@/components/providers/data-provider"
import { lastValuedEntry } from "@/lib/calc"
import { fmtEUR } from "@/lib/format"
import { Icon } from "@/components/icon"

type Option = {
  id: number
  name: string
  color: string
  sub: string
}

export function PortfolioSwitcher() {
  const { portfolios, selectedPortfolio, setSelectedPortfolio } = useData()
  const [open, setOpen] = useState(false)
  const options: Option[] = [
    {
      id: 0,
      name: "Combined",
      color: "#1F2937",
      // Non-breaking space keeps the count + label together when the dropdown
      // trigger wraps; pluralization avoids the cosmetic "1 portfolios" bug.
      sub: `${portfolios.length} ${portfolios.length === 1 ? "portfolio" : "portfolios"}`,
    },
    ...portfolios.map((p) => {
      // Use the last valued entry, not the last row — the latest row may be
      // a future-month deposit with value === null, in which case the
      // dropdown should still surface the most recently recorded value
      // instead of falling through to "—".
      const last = lastValuedEntry(p.entries)
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        sub: last ? fmtEUR(last.value, { compact: true }) : "—",
      }
    }),
  ]
  const active = options.find((o) => o.id === selectedPortfolio) ?? options[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pf-dd-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid="portfolio-switcher-trigger"
        >
          <span className="dot" style={{ background: active.color }} />
          <span className="pf-dd-label">
            <span className="pf-dd-name">{active.name}</span>
            <span className="pf-dd-sub">{active.sub}</span>
          </span>
          <Icon
            name="chevronDown"
            size={14}
            style={{ color: "var(--neutral-400)" }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        role="listbox"
        aria-label="Select portfolio"
        className="min-w-[260px] p-1.5"
        data-testid="portfolio-switcher-content"
      >
        {options.map((o) => (
          <button
            type="button"
            role="option"
            aria-selected={o.id === selectedPortfolio}
            key={o.id}
            className={`pf-dd-opt w-full text-left ${o.id === selectedPortfolio ? "on" : ""}`}
            onClick={() => {
              setSelectedPortfolio(o.id)
              setOpen(false)
            }}
            data-testid={`pf-opt-${o.id}`}
          >
            <span className="dot" style={{ background: o.color }} />
            <span className="pf-dd-label">
              <span className="pf-dd-name">{o.name}</span>
              <span className="pf-dd-sub">{o.sub}</span>
            </span>
            {o.id === selectedPortfolio && (
              <span data-testid="pf-opt-check">
                <Icon
                  name="check"
                  size={14}
                  style={{ color: "var(--primary)" }}
                />
              </span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
