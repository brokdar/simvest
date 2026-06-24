"use client"

import { useState } from "react"
import { useData, useDataActions } from "@/components/providers/data-provider"
import { Icon } from "@/components/icon"
import {
  PortfolioEditor,
  type PortfolioEditorPayload,
} from "@/components/portfolio-editor"
import { PortfolioTransferDialog } from "@/components/portfolio-transfer/portfolio-transfer-dialog"
import { MoneyInput } from "@/components/money-input"
import { SliderRow } from "@/components/slider-row"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { fmtEUR } from "@/lib/format"
import { useLocale } from "@/lib/locale"
import { useResolvedLocale } from "@/components/use-resolved-locale"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PortfolioDTO } from "@/lib/types"

const PALETTE = [
  "#1E40AF",
  "#059669",
  "#7C3AED",
  "#0F766E",
  "#B45309",
  "#334155",
]

const COLOR_NAMES: Record<string, string> = {
  "#1E40AF": "Blue",
  "#059669": "Green",
  "#7C3AED": "Purple",
  "#0F766E": "Teal",
  "#B45309": "Amber",
  "#334155": "Slate",
}

export function SettingsView() {
  const { portfolios, goals, settings } = useData()
  const { updatePortfolio, deletePortfolio, addPortfolio, updateSettings } =
    useDataActions()
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const total = portfolios.reduce((s, p) => s + p.targetMonthlyContribution, 0)
  const editing = portfolios.find((p) => p.id === editingId) ?? null

  return (
    <div className="view">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="title">Settings</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Manage your portfolios — name, color, monthly contribution, and
            starting balance.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowImport(true)}
            data-testid="settings-import-portfolio"
          >
            <Icon name="upload" size={15} /> Import portfolio
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowAdd(true)}
          >
            <Icon name="plus" size={15} /> Add portfolio
          </button>
        </div>
      </div>

      <div className="card card-pad">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
          }}
        >
          <h3 style={{ fontSize: 15 }}>Portfolios</h3>
          <div className="muted small" data-testid="total-monthly-contribution">
            Total monthly contribution:{" "}
            <strong className="mono" style={{ color: "var(--neutral-800)" }}>
              {fmtEUR(total)}
            </strong>
          </div>
        </div>

        {portfolios.length === 0 ? (
          <div className="muted small">
            No portfolios yet — click{" "}
            <strong style={{ color: "var(--neutral-800)" }}>
              Add portfolio
            </strong>
            .
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {portfolios.map((p, i) => (
              <PortfolioRow
                key={p.id}
                portfolio={p}
                showDivider={i > 0}
                onChange={(patch) => updatePortfolio(p.id, patch)}
                onEdit={() => setEditingId(p.id)}
                onDelete={() => setPendingDeleteId(p.id)}
                onExport={() => triggerPortfolioDownload(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 15 }}>Preferences</h3>
        </div>
        <DefaultEntryDayRow
          value={settings.defaultEntryDay}
          onChange={(v) => updateSettings({ defaultEntryDay: v })}
        />
        <NumberFormatRow
          value={settings.locale}
          onChange={(v) => updateSettings({ locale: v })}
        />
      </div>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <div style={{ marginBottom: 4 }}>
          <h3 style={{ fontSize: 15 }}>Planning assumptions</h3>
          <div className="muted small" style={{ marginTop: 4, fontSize: 12 }}>
            Used across all goals on the Planning page. Individual goals can
            override SWR and dividend yield locally.
          </div>
        </div>
        <SliderRow
          label="Inflation"
          value={settings.inflation}
          min={0}
          max={8}
          step={0.1}
          suffix="%"
          onChange={(v) => updateSettings({ inflation: round1(v) })}
          testId="settings-inflation"
        />
        <SliderRow
          label="Conservative return"
          value={settings.conservativeReturn}
          min={0}
          max={8}
          step={0.1}
          suffix="%"
          onChange={(v) => updateSettings({ conservativeReturn: round1(v) })}
          testId="settings-conservative-return"
        />
        <SliderRow
          label="Optimistic return"
          value={settings.optimisticReturn}
          min={5}
          max={15}
          step={0.1}
          suffix="%"
          onChange={(v) => updateSettings({ optimisticReturn: round1(v) })}
          testId="settings-optimistic-return"
        />
        <SliderRow
          label="Default safe withdrawal rate"
          value={settings.defaultSwr}
          min={2.5}
          max={6}
          step={0.1}
          suffix="%"
          onChange={(v) => updateSettings({ defaultSwr: round1(v) })}
          testId="settings-default-swr"
        />
      </div>

      <PortfolioEditor
        open={showAdd}
        onOpenChange={setShowAdd}
        onSave={async (form) => {
          await addPortfolio(form)
        }}
      />

      <PortfolioTransferDialog open={showImport} onOpenChange={setShowImport} />

      {editing && (
        <PortfolioEditor
          open={editingId !== null}
          onOpenChange={(o) => {
            if (!o) setEditingId(null)
          }}
          mode={{
            kind: "edit",
            initial: {
              name: editing.name,
              color: editing.color,
              targetMonthlyContribution: editing.targetMonthlyContribution,
              startingValue: editing.startingValue,
              startingDate: editing.startingDate,
            },
            entryCount: editing.entries.length,
          }}
          onSave={async (form: PortfolioEditorPayload) => {
            await updatePortfolio(editing.id, form)
          }}
        />
      )}

      {(() => {
        const p = portfolios.find((x) => x.id === pendingDeleteId)
        if (!p) return null
        const linkedGoals = goals.filter((g) => g.portfolioId === p.id)
        return (
          <AlertDialog
            open={pendingDeleteId !== null}
            onOpenChange={(o) => {
              if (!o) setPendingDeleteId(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete &ldquo;{p.name}&rdquo;?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove all {p.entries.length} entries.
                  {linkedGoals.length > 0 && (
                    <>
                      {" "}
                      It will also delete {linkedGoals.length} linked goal
                      {linkedGoals.length > 1 ? "s" : ""} (
                      {linkedGoals.map((g) => g.name).join(", ")}).
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await deletePortfolio(p.id)
                    setPendingDeleteId(null)
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )
      })()}
    </div>
  )
}

/**
 * Number-format preference. `"auto"` defers to the browser's
 * `navigator.language`; an explicit BCP-47 tag (e.g. `"en-US"`, `"de-DE"`)
 * overrides it. The resolved tag + an `fmtEUR` example are shown below the
 * select so the user can verify what Auto currently means before switching.
 *
 * The Auto option's preview uses the **raw browser locale** (not the
 * already-resolved locale) so that — when the user has previously picked
 * an explicit locale — the Auto row honestly shows what reverting to Auto
 * would produce, rather than echoing the current pick.
 *
 * Saving uses the existing debounced `updateSettings` path; flush-on-pagehide
 * already covers a settings change followed by an immediate navigation.
 */
const PREVIEW_AMOUNT = 36855.97
const LOCALE_OPTIONS: { value: string; label: string }[] = [
  { value: "en-US", label: "English (United States)" },
  { value: "de-DE", label: "German (Germany)" },
]

function NumberFormatRow({
  value,
  onChange,
}: {
  value: string | null
  onChange: (next: string | null) => void
}) {
  const { locale: resolved, source } = useResolvedLocale()
  const browser = useLocale()
  const current = value ?? "auto"
  const sourceLabel =
    source === "user"
      ? "user pick"
      : source === "browser"
        ? "browser language"
        : "fallback"

  return (
    <div
      data-testid="number-format-row"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "14px 0 4px",
        borderTop: "1px solid var(--border)",
        marginTop: 14,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Number format</div>
        <div className="muted small" style={{ marginTop: 4 }}>
          Controls the decimal separator used for money inputs and the
          formatting shown on cards, charts, and exports. Auto follows your
          browser language. Existing values are not changed; new entries are
          parsed using this setting.
        </div>
        <div
          className="muted small"
          style={{ marginTop: 6 }}
          aria-live="polite"
          data-testid="number-format-resolved"
        >
          Currently <strong>{resolved}</strong> ({sourceLabel}) —{" "}
          <span className="mono">{fmtEUR(PREVIEW_AMOUNT, {}, resolved)}</span>
        </div>
      </div>
      <div style={{ minWidth: 180 }}>
        <Select
          value={current}
          onValueChange={(v) => onChange(v === "auto" ? null : v)}
        >
          <SelectTrigger
            className="w-full"
            data-testid="number-format-select"
            aria-label="Number format"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              Auto ({browser}) — {fmtEUR(PREVIEW_AMOUNT, {}, browser)}
            </SelectItem>
            {LOCALE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label} — {fmtEUR(PREVIEW_AMOUNT, {}, opt.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function DefaultEntryDayRow({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const isFirst = value === "first"
  const isLast = value === "last"
  const isCustom = !isFirst && !isLast
  const customDay = isCustom
    ? Math.max(1, Math.min(31, parseInt(value, 10) || 15))
    : 15

  return (
    <div
      data-testid="default-entry-day-row"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "4px 0",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          Default day for monthly entries
        </div>
        <div className="muted small" style={{ fontSize: 11, marginTop: 4 }}>
          Pre-fills the date when adding a new snapshot. Existing entries keep
          their stored day.
        </div>
      </div>
      <div
        role="group"
        aria-label="Default entry day"
        style={{
          display: "inline-flex",
          padding: 3,
          background: "var(--neutral-50)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          gap: 2,
        }}
      >
        <SegmentButton
          selected={isFirst}
          onClick={() => onChange("first")}
          testId="default-entry-day-first"
        >
          First of month
        </SegmentButton>
        <SegmentButton
          selected={isLast}
          onClick={() => onChange("last")}
          testId="default-entry-day-last"
        >
          Last of month
        </SegmentButton>
        <SegmentButton
          selected={isCustom}
          onClick={() => onChange(String(customDay))}
          testId="default-entry-day-custom"
        >
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Custom day
            <input
              type="number"
              min={1}
              max={31}
              step={1}
              value={customDay}
              disabled={!isCustom}
              onChange={(e) => {
                const n = Math.max(
                  1,
                  Math.min(31, Math.floor(parseFloat(e.target.value) || 1))
                )
                onChange(String(n))
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid="default-entry-day-custom-input"
              style={{
                width: 44,
                padding: "2px 6px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: isCustom ? "var(--surface)" : "transparent",
                color: "inherit",
                fontSize: 12,
                textAlign: "center",
                opacity: isCustom ? 1 : 0.5,
              }}
            />
          </span>
        </SegmentButton>
      </div>
    </div>
  )
}

function SegmentButton({
  selected,
  onClick,
  testId,
  children,
}: {
  selected: boolean
  onClick: () => void
  testId?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 6,
        border: "1px solid",
        borderColor: selected ? "var(--border)" : "transparent",
        background: selected ? "var(--surface)" : "transparent",
        color: selected ? "var(--neutral-800)" : "var(--neutral-600)",
        boxShadow: selected ? "var(--sh-xs)" : "none",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}

function PortfolioRow({
  portfolio,
  showDivider,
  onChange,
  onEdit,
  onDelete,
  onExport,
}: {
  portfolio: PortfolioDTO
  showDivider: boolean
  onChange: (patch: {
    name?: string
    color?: string
    targetMonthlyContribution?: number
  }) => void
  onEdit: () => void
  onDelete: () => void
  onExport: () => void
}) {
  const { locale } = useResolvedLocale()
  const hasStartingBalance =
    portfolio.startingValue > 0 && portfolio.startingDate !== null

  return (
    <div
      data-testid={`portfolio-row-${portfolio.id}`}
      style={{
        padding: "14px 0",
        borderTop: showDivider ? "1px solid var(--border)" : undefined,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr minmax(90px, 200px) auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        <ColorPicker
          value={portfolio.color}
          onChange={(c) => onChange({ color: c })}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            className="input-bare"
            aria-label={`${portfolio.name} name`}
            value={portfolio.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <div className="muted small" style={{ fontSize: 11 }}>
            {portfolio.entries.length}{" "}
            {portfolio.entries.length === 1 ? "entry" : "entries"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <MoneyInput
            value={portfolio.targetMonthlyContribution}
            onChange={(v) => {
              if (v !== null && v >= 0) {
                onChange({ targetMonthlyContribution: v })
              }
            }}
            locale={locale}
            min={0}
            ariaLabel={`${portfolio.name} monthly contribution`}
          />
          <div className="muted small" style={{ fontSize: 11 }}>
            Monthly contribution
          </div>
        </div>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          aria-label={`Delete ${portfolio.name}`}
          onClick={onDelete}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto auto",
          gap: 12,
          alignItems: "center",
          marginTop: 8,
        }}
      >
        <div style={{ width: 28 }} />
        <div
          className="muted small"
          style={{ fontSize: 12, color: "var(--neutral-600)" }}
          data-testid={`portfolio-starting-summary-${portfolio.id}`}
        >
          {hasStartingBalance ? (
            <>
              <span style={{ color: "var(--neutral-500)" }}>Cost basis </span>
              <strong
                className="mono"
                style={{ color: "var(--neutral-800)", fontWeight: 600 }}
              >
                {fmtEUR(portfolio.startingValue, { decimals: 2 })}
              </strong>
              <span style={{ color: "var(--neutral-500)" }}>
                {" "}
                · anchored to{" "}
              </span>
              <strong style={{ color: "var(--neutral-800)", fontWeight: 600 }}>
                {formatAnchor(portfolio.startingDate!, locale)}
              </strong>
            </>
          ) : (
            <span style={{ color: "var(--neutral-400)" }}>
              No starting balance — tracking from first entry
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          onClick={onExport}
          aria-label={`Export ${portfolio.name}`}
          data-testid={`portfolio-export-${portfolio.id}`}
          style={{ height: 28, width: 28 }}
        >
          <Icon name="download" size={14} />
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onEdit}
          data-testid={`portfolio-edit-${portfolio.id}`}
          style={{ height: 28, padding: "0 10px", fontSize: 12 }}
        >
          <Icon name="edit" size={12} /> Edit
        </button>
        <div style={{ width: 32 }} />
      </div>
    </div>
  )
}

/**
 * Trigger a portfolio export download via a transient anchor. The route
 * already sets `Content-Disposition` and `Cache-Control: no-store`, so we
 * just need to nudge the browser to navigate to it — no fetch+blob plumbing
 * and no transient blob URL to track.
 */
function triggerPortfolioDownload(portfolioId: number) {
  const a = document.createElement("a")
  a.href = `/api/portfolios/${portfolioId}/export`
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function round1(v: number) {
  return Math.round(v * 10) / 10
}

function formatAnchor(startingDate: string, locale: string): string {
  const y = parseInt(startingDate.slice(0, 4), 10)
  const m = parseInt(startingDate.slice(5, 7), 10)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return startingDate
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString(locale, { month: "short", year: "numeric" })
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Pick color"
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: value,
          border: "2px solid var(--surface)",
          boxShadow: "0 0 0 1px var(--border)",
          cursor: "pointer",
        }}
      />
      {open && (
        <div
          role="dialog"
          aria-label="Color picker"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            display: "flex",
            gap: 6,
            padding: 8,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--sh-md)",
            zIndex: 20,
          }}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          onMouseLeave={() => setOpen(false)}
        >
          {PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => {
                onChange(c)
                setOpen(false)
              }}
              aria-label={COLOR_NAMES[c] ?? c}
              aria-pressed={value === c}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: c,
                border: `2px solid ${value === c ? "var(--neutral-800)" : "transparent"}`,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
