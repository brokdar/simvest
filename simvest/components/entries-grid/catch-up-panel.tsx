"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useData, useDataActions } from "@/components/providers/data-provider"
import { useToast } from "@/components/providers/toast"
import { MoneyInput } from "@/components/money-input"
import { MonthYearPicker } from "@/components/month-year-picker"
import { useResolvedLocale } from "@/components/use-resolved-locale"
import { Icon } from "@/components/icon"
import { GapFillPanel } from "@/components/entries-grid/gap-fill-panel"
import { FieldLabel } from "@/components/ui/field-label"
import {
  buildCatchUpBatch,
  catchUpGap,
  catchUpRows,
  gapGroups,
  monthOf,
  type CatchUpInput,
  type MonthRef,
} from "@/lib/catch-up"
import { fmtDate, fmtMonth, fmtMonthLong } from "@/lib/dates"
import { fmtCount, fmtEUR } from "@/lib/format"
import { swatch } from "@/lib/palette"

type FieldKey = "value" | "invested"

/**
 * The monthly ritual on one screen (W2). Combined Monthly Entries lands here:
 * every account with its last logged value and one field for what it's worth
 * now, saved together. Typing four numbers and pressing Save is the whole
 * chore — the per-account grid below is still there for history and edits.
 *
 * `focusSignal` bumps when the topbar "New entry" fires in Combined, which
 * moves focus to the first account still waiting for a number.
 */
export function CatchUpPanel({ focusSignal }: { focusSignal: number }) {
  const { portfolios, settings, today } = useData()
  const { logEntries } = useDataActions()
  const { toast } = useToast()
  const { locale } = useResolvedLocale()

  const current = useMemo(() => monthOf(today), [today])
  const [target, setTarget] = useState<MonthRef>(current)
  const [inputs, setInputs] = useState<Record<number, CatchUpInput>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  // Remounts the money fields after a save or a month change so they show the
  // saved figures instead of what was typed.
  const [generation, setGeneration] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  const rows = useMemo(
    () => catchUpRows(portfolios, target, settings.defaultEntryDay),
    [portfolios, target, settings.defaultEntryDay]
  )
  const batch = useMemo(
    () => buildCatchUpBatch(rows, inputs, target),
    [rows, inputs, target]
  )
  // Accounts several months behind — the form fills one month at a time, so
  // say how far back the gap goes and offer to start there.
  const gap = useMemo(() => catchUpGap(rows, current), [rows, current])
  const behindBy = new Map(gap?.accounts.map((a) => [a.id, a.months]) ?? [])
  const groups = useMemo(
    () => gapGroups(portfolios, today, settings.defaultEntryDay),
    [portfolios, today, settings.defaultEntryDay]
  )
  const [fillingGap, setFillingGap] = useState(false)
  const errorCount = Object.keys(errors).length
  const waiting = rows.filter((r) => r.existing?.value == null).length

  useEffect(() => {
    if (focusSignal === 0) return
    const form = formRef.current
    if (!form) return
    form.scrollIntoView({ block: "nearest" })
    const empty = Array.from(
      form.querySelectorAll<HTMLInputElement>(
        "[data-catchup-value-field] input"
      )
    ).find((el) => el.value.trim() === "")
    const first = form.querySelector<HTMLInputElement>(
      "[data-catchup-value-field] input"
    )
    ;(empty ?? first)?.focus()
  }, [focusSignal])

  function setField(
    id: number,
    key: FieldKey,
    v: number | null,
    e: string | null
  ) {
    setServerError(null)
    setInputs((prev) => ({ ...prev, [id]: { ...prev[id], [key]: v } }))
    setErrors((prev) => {
      const k = `${id}-${key}`
      if ((prev[k] ?? null) === e) return prev
      const next = { ...prev }
      if (e === null) delete next[k]
      else next[k] = e
      return next
    })
  }

  function changeMonth(next: MonthRef | null) {
    if (!next) return
    setTarget(next)
    setInputs({})
    setErrors({})
    setServerError(null)
    setGeneration((g) => g + 1)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (saving || batch.length === 0 || errorCount > 0) return
    setSaving(true)
    setServerError(null)
    try {
      await logEntries(batch)
      const month = fmtMonth(target.year, target.month)
      toast(
        batch.length === 1
          ? `Saved ${month} for ${portfolios.find((p) => p.id === batch[0].portfolioId)?.name ?? "1 account"}`
          : `Saved ${month} for ${fmtCount(batch.length, "account", "accounts")}`
      )
      setInputs({})
      setGeneration((g) => g + 1)
    } catch (e) {
      setServerError(
        e instanceof Error && e.message
          ? `Nothing was saved — ${e.message}`
          : "Nothing was saved — is the server running?"
      )
    } finally {
      setSaving(false)
    }
  }

  if (portfolios.length === 0) return null
  if (fillingGap && groups.length > 0) {
    return <GapFillPanel groups={groups} onClose={() => setFillingGap(false)} />
  }

  const monthName = fmtMonthLong(target.year, target.month)
  const saveLabel = saving
    ? "Saving…"
    : batch.length === 0
      ? "Save"
      : `Save ${fmtCount(batch.length, "account", "accounts")}`

  return (
    <form
      ref={formRef}
      className="card catchup"
      onSubmit={save}
      data-testid="catchup-panel"
      aria-labelledby="catchup-title"
    >
      <div className="catchup-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="card-title" id="catchup-title">
            Log this month
          </h2>
          <div className="muted small" data-testid="catchup-sub">
            {waiting === 0
              ? `Every account has a value for ${monthName} — change any of them here.`
              : `One number per account: what it’s worth now. Leave one empty to skip it.`}
          </div>
          {gap && (
            <div className="muted small catchup-gap" data-testid="catchup-gap">
              {gap.text}{" "}
              {groups.length > 0 && (
                <>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setFillingGap(true)}
                    data-testid="catchup-gap-fill"
                  >
                    Fill the gap
                  </button>{" "}
                  to log every missing month at once.{" "}
                </>
              )}
              {gap.firstMissing.year === target.year &&
              gap.firstMissing.month === target.month ? (
                `Filling in ${fmtMonth(target.year, target.month)}, the first month missing — pick the next one above when you’re done.`
              ) : (
                <>
                  Pick a month above to fill in, or{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => changeMonth(gap.firstMissing)}
                    data-testid="catchup-gap-start"
                  >
                    start with{" "}
                    {fmtMonth(gap.firstMissing.year, gap.firstMissing.month)}
                  </button>
                  .
                </>
              )}
            </div>
          )}
        </div>
        <div className="catchup-month">
          <FieldLabel>For</FieldLabel>
          <MonthYearPicker
            value={target}
            onChange={changeMonth}
            maxDate={current}
            required
            ariaLabel={`Month to log — ${monthName}`}
            testId="catchup-month"
          />
        </div>
      </div>

      <div className="catchup-rows" role="list">
        {rows.map((r) => {
          const p = r.portfolio
          const last = r.lastValued
          const logged = r.existing?.value != null
          return (
            <div
              key={`${p.id}-${generation}`}
              className="catchup-row"
              role="listitem"
              data-testid={`catchup-row-${p.id}`}
              data-logged={logged ? "true" : undefined}
            >
              <div className="catchup-account">
                <span
                  aria-hidden="true"
                  className="catchup-swatch"
                  style={{ background: swatch(p.color) }}
                />
                <div style={{ minWidth: 0 }}>
                  <div className="catchup-name" title={p.name}>
                    {p.name}
                  </div>
                  <div
                    className="muted small catchup-last"
                    data-testid={`catchup-last-${p.id}`}
                  >
                    {logged ? (
                      <span className="pos">
                        <Icon name="check" size={12} /> Logged for{" "}
                        {fmtMonth(target.year, target.month)}
                      </span>
                    ) : last ? (
                      <>
                        Last {fmtDate(last.year, last.month, last.day)} ·{" "}
                        <span className="mono">{fmtEUR(last.value)}</span>
                        {behindBy.has(p.id) &&
                          ` · ${behindBy.get(p.id)} months behind`}
                      </>
                    ) : (
                      "Nothing logged yet"
                    )}
                  </div>
                </div>
              </div>
              <div className="catchup-field" data-catchup-value-field>
                <FieldLabel>Worth now</FieldLabel>
                <MoneyInput
                  value={r.defaultValue}
                  onChange={(v, e) => setField(p.id, "value", v, e)}
                  locale={locale}
                  ariaLabel={`${p.name} value for ${monthName}`}
                  placeholder={last?.value != null ? "New value" : "Value"}
                  testId={`catchup-value-${p.id}`}
                  align="right"
                />
              </div>
              <div className="catchup-field catchup-field-added">
                <FieldLabel>Added</FieldLabel>
                <MoneyInput
                  value={r.defaultInvested}
                  onChange={(v, e) => setField(p.id, "invested", v, e)}
                  locale={locale}
                  // Show "0,00" for an account with no monthly plan, so the
                  // field never looks unfilled.
                  allowEmpty={false}
                  ariaLabel={`${p.name} amount added in ${monthName}`}
                  testId={`catchup-added-${p.id}`}
                  align="right"
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="catchup-foot">
        <div
          className="muted small"
          role="status"
          data-testid="catchup-status"
          style={serverError ? { color: "var(--critical)" } : undefined}
        >
          {serverError ??
            (errorCount > 0
              ? "Fix the highlighted amount before saving."
              : batch.length === 0
                ? "Type a value for any account to save it."
                : `Saves ${monthName} for ${batch
                    .map(
                      (b) =>
                        portfolios.find((p) => p.id === b.portfolioId)?.name
                    )
                    .filter(Boolean)
                    .join(
                      ", "
                    )}. “Added” starts at each account’s monthly plan.`)}
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || batch.length === 0 || errorCount > 0}
          data-testid="catchup-save"
        >
          <Icon name="check" size={15} /> {saveLabel}
        </button>
      </div>
    </form>
  )
}
