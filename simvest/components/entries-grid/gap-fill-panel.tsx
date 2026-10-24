"use client"

import { useMemo, useState } from "react"
import { useDataActions } from "@/components/providers/data-provider"
import { useToast } from "@/components/providers/toast"
import { MoneyInput } from "@/components/money-input"
import { useResolvedLocale } from "@/components/use-resolved-locale"
import { Icon } from "@/components/icon"
import { FieldLabel } from "@/components/ui/field-label"
import { buildGapBatch, type CatchUpInput, type GapGroup } from "@/lib/catch-up"
import { fmtMonth, fmtMonthLong } from "@/lib/dates"
import { fmtCount } from "@/lib/format"
import { swatch } from "@/lib/palette"

/**
 * "Fill the gap": one row per missing month for every account that is behind,
 * saved as one all-or-nothing batch. Each account is a collapsible group so a
 * six-month gap stays scannable on a phone.
 */
export function GapFillPanel({
  groups,
  onClose,
}: {
  groups: GapGroup[]
  onClose: () => void
}) {
  const { logEntries } = useDataActions()
  const { toast } = useToast()
  const { locale } = useResolvedLocale()
  const [inputs, setInputs] = useState<Record<string, CatchUpInput>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  const batch = useMemo(() => buildGapBatch(groups, inputs), [groups, inputs])
  const filled = groups.reduce(
    (n, g) => n + g.rows.filter((r) => inputs[r.key]?.value != null).length,
    0
  )
  const errorCount = Object.keys(errors).length

  function setField(
    key: string,
    field: "value" | "invested",
    v: number | null,
    e: string | null
  ) {
    setServerError(null)
    setInputs((prev) => ({ ...prev, [key]: { ...prev[key], [field]: v } }))
    setErrors((prev) => {
      const k = `${key}-${field}`
      if ((prev[k] ?? null) === e) return prev
      const next = { ...prev }
      if (e === null) delete next[k]
      else next[k] = e
      return next
    })
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (saving || !batch || errorCount > 0) return
    setSaving(true)
    setServerError(null)
    try {
      await logEntries(batch)
      toast(
        `Saved ${fmtCount(batch.length, "month", "months")} for ${fmtCount(groups.length, "account", "accounts")}`
      )
      onClose()
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

  return (
    <form
      className="card catchup"
      onSubmit={save}
      data-testid="gapfill-panel"
      aria-labelledby="gapfill-title"
    >
      <div className="catchup-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="card-title" id="gapfill-title">
            Fill the gap
          </h2>
          <div className="muted small">
            One value for every month an account is missing. Nothing is saved
            until all of them are filled in.
          </div>
        </div>
        <button
          type="button"
          className="link-button"
          onClick={onClose}
          data-testid="gapfill-close"
        >
          Back to this month
        </button>
      </div>

      {groups.map((g) => {
        const p = g.portfolio
        return (
          <details
            key={p.id}
            open
            className="gapfill-group"
            data-testid={`gapfill-group-${p.id}`}
          >
            <summary className="gapfill-summary">
              <span
                aria-hidden="true"
                className="catchup-swatch"
                style={{ background: swatch(p.color) }}
              />
              <span className="catchup-name" title={p.name}>
                {p.name}
              </span>
              <span className="muted small">
                {fmtCount(g.rows.length, "month", "months")} missing
              </span>
            </summary>
            <div className="catchup-rows" role="list">
              {g.rows.map((r) => {
                const label = fmtMonth(r.month.year, r.month.month)
                const long = fmtMonthLong(r.month.year, r.month.month)
                return (
                  <div
                    key={r.key}
                    className="catchup-row"
                    role="listitem"
                    data-testid={`gapfill-row-${r.key}`}
                  >
                    <div className="catchup-account">
                      <div className="catchup-name">{label}</div>
                    </div>
                    <div className="catchup-field">
                      <FieldLabel>Worth then</FieldLabel>
                      <MoneyInput
                        value={null}
                        onChange={(v, e) => setField(r.key, "value", v, e)}
                        locale={locale}
                        ariaLabel={`${p.name} value for ${long}`}
                        placeholder="Value"
                        testId={`gapfill-value-${r.key}`}
                        align="right"
                      />
                    </div>
                    <div className="catchup-field catchup-field-added">
                      <FieldLabel>Added</FieldLabel>
                      <MoneyInput
                        value={p.targetMonthlyContribution}
                        onChange={(v, e) => setField(r.key, "invested", v, e)}
                        locale={locale}
                        allowEmpty={false}
                        ariaLabel={`${p.name} amount added in ${long}`}
                        testId={`gapfill-added-${r.key}`}
                        align="right"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </details>
        )
      })}

      <div className="catchup-foot">
        <div
          className="muted small"
          role="status"
          data-testid="gapfill-status"
          style={serverError ? { color: "var(--critical)" } : undefined}
        >
          {serverError ??
            (errorCount > 0
              ? "Fix the highlighted amount before saving."
              : batch
                ? `Saves ${fmtCount(total, "month", "months")} in one go. “Added” starts at each account’s monthly plan.`
                : `${filled} of ${total} months filled in.`)}
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !batch || errorCount > 0}
          data-testid="gapfill-save"
        >
          <Icon name="check" size={15} />{" "}
          {saving ? "Saving…" : `Save ${fmtCount(total, "month", "months")}`}
        </button>
      </div>
    </form>
  )
}
