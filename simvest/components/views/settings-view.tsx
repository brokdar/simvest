"use client"

import { useState } from "react"
import {
  useData,
  useDataActions,
  useGoalEvaluator,
} from "@/components/providers/data-provider"
import { Icon } from "@/components/icon"
import { useToast } from "@/components/providers/toast"
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
import { fmtCount, fmtEUR, fmtNum, fmtPct } from "@/lib/format"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"
import { useLocale } from "@/lib/locale"
import { useResolvedLocale } from "@/components/use-resolved-locale"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AboutInfo, PortfolioDTO } from "@/lib/types"
import { IDENTITY_COLORS, identityColorName, swatch } from "@/lib/palette"
import { fmtMonthKey } from "@/lib/dates"
import { SegControl, type SegOption } from "@/components/ui/seg-control"
import { useTheme } from "@/components/providers/theme"
import type { ThemePreference } from "@/lib/theme"

const PALETTE = IDENTITY_COLORS.map((c) => c.hex)

export function SettingsView({ about }: { about?: AboutInfo }) {
  const { portfolios, goals, settings, combinedPortfolio } = useData()
  const evaluator = useGoalEvaluator()
  const { locale } = useResolvedLocale()
  // The real rate, shown beside the assumptions so they're set knowing it
  // (N1): an "optimistic" 10% means little next to an 11,2% record.
  const record = evaluator.historicalReturnWithSource(COMBINED_PORTFOLIO_ID)
  const { updatePortfolio, deletePortfolio, addPortfolio, updateSettings } =
    useDataActions()
  const { toast } = useToast()
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
            Your accounts, how the numbers look, and the assumptions behind
            every projection. Changes save as you go.
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

      <div className="card card-pad" id="portfolios">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ fontSize: "var(--fs-lg)" }}>Portfolios</h3>
          <div className="muted small" data-testid="total-monthly-contribution">
            Your monthly plan:{" "}
            <strong className="mono" style={{ color: "var(--neutral-800)" }}>
              {fmtEUR(total)}
            </strong>{" "}
            · the sum of each portfolio’s contribution
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
          <h3 style={{ fontSize: "var(--fs-lg)" }}>Preferences</h3>
        </div>
        {/* `settings.monthlySaving` (N9): stored since day one but never
            shown. It isn't the plan — that's the per-portfolio sum above —
            so it gets the one job it can honestly do: pre-fill new ones. */}
        <div
          className="settings-pref-row"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "10px 0",
          }}
          data-testid="settings-default-contribution-row"
        >
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
              Starting contribution for new portfolios
            </div>
            <div className="muted small">
              Pre-fills the monthly contribution when you add a portfolio. It
              doesn’t change your plan ({fmtEUR(total, { decimals: 0 })}
              /month today) — that’s each portfolio’s own amount above.
            </div>
          </div>
          <div style={{ width: 160 }}>
            <MoneyInput
              value={settings.monthlySaving}
              onChange={(v) => {
                if (v !== null && v >= 0) updateSettings({ monthlySaving: v })
              }}
              locale={locale}
              min={0}
              ariaLabel="Starting contribution for new portfolios"
              testId="settings-default-contribution"
            />
          </div>
        </div>
        <DefaultEntryDayRow
          value={settings.defaultEntryDay}
          onChange={(v) => updateSettings({ defaultEntryDay: v })}
        />
        <NumberFormatRow
          value={settings.locale}
          onChange={(v) => updateSettings({ locale: v })}
        />
        <AppearanceRow />
      </div>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <div style={{ marginBottom: 4 }}>
          <h3 style={{ fontSize: "var(--fs-lg)" }}>Planning assumptions</h3>
          <div
            className="muted small"
            style={{ marginTop: 4, fontSize: "var(--fs-xs)" }}
          >
            The what-ifs behind the Projection and every goal. A goal can set
            its own withdrawal rate, dividend yield and return without touching
            these.
          </div>
        </div>
        <SliderRow
          label="Inflation"
          value={settings.inflation}
          min={0}
          max={8}
          step={0.1}
          unit="percent"
          onChange={(v) => updateSettings({ inflation: round1(v) })}
          hint="How fast prices rise each year. Turns future euros into today’s money on the Projection and in income goals."
          testId="settings-inflation"
        />
        <SliderRow
          label="Conservative return"
          value={settings.conservativeReturn}
          min={0}
          max={8}
          step={0.1}
          unit="percent"
          onChange={(v) => updateSettings({ conservativeReturn: round1(v) })}
          hint="A cautious yearly growth rate — the lower edge of the band on the Projection and the goal charts."
          testId="settings-conservative-return"
        />
        <SliderRow
          label="Optimistic return"
          value={settings.optimisticReturn}
          min={5}
          max={15}
          step={0.1}
          unit="percent"
          onChange={(v) => updateSettings({ optimisticReturn: round1(v) })}
          hint="A hopeful yearly growth rate — the upper edge of that same band."
          testId="settings-optimistic-return"
        />
        <div
          className="muted small"
          style={{ padding: "0 0 10px", fontSize: "var(--fs-xs)" }}
          data-testid="settings-return-record"
        >
          {record.source === "assumed" ? (
            "Not enough history yet to show your own return."
          ) : (
            <>
              Your record:{" "}
              <strong className="mono" style={{ color: "var(--neutral-800)" }}>
                {fmtPct(record.value, 1)}/yr
              </strong>{" "}
              across all accounts (
              {fmtCount(combinedPortfolio.entries.length, "month", "months")}).{" "}
              {record.value > settings.optimisticReturn
                ? "That’s above your optimistic case — the Projection shows it separately as “Your track record”."
                : record.value < settings.conservativeReturn
                  ? "That’s below your conservative case."
                  : "That sits inside your range."}
            </>
          )}
        </div>
        <SliderRow
          label="Default safe withdrawal rate"
          value={settings.defaultSwr}
          min={2.5}
          max={6}
          step={0.1}
          unit="percent"
          onChange={(v) => updateSettings({ defaultSwr: round1(v) })}
          hint={`How much of the pot you’d take out each year in retirement — income goals use it to size the pot. ${fmtPct(settings.defaultSwr)} of ${fmtEUR(1_000_000, { compact: true })} is ${fmtEUR((settings.defaultSwr / 100) * 1_000_000, { compact: true })} a year.`}
          testId="settings-default-swr"
        />
      </div>

      {about && <AboutDataCard about={about} />}

      <PortfolioEditor
        open={showAdd}
        onOpenChange={setShowAdd}
        defaultMonthlyContribution={settings.monthlySaving}
        onSave={async (form) => {
          await addPortfolio(form)
          toast(`Added “${form.name}”`)
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
              contributionSet: editing.contributionSet,
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
                  This will permanently remove{" "}
                  {p.entries.length === 1
                    ? "its 1 entry"
                    : `all ${fmtCount(p.entries.length, "entry", "entries")}`}
                  .
                  {linkedGoals.length > 0 && (
                    <>
                      {" "}
                      It will also delete{" "}
                      {fmtCount(
                        linkedGoals.length,
                        "linked goal",
                        "linked goals"
                      )}{" "}
                      ({linkedGoals.map((g) => g.name).join(", ")}).
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
                    toast(`Deleted “${p.name}” and its entries`, "info")
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
 * C12: a self-hosted app owes its operator the basics — which version is
 * running, where the database file is, what's in it, and a one-click backup.
 * The download is a consistent SQLite snapshot (GET /api/backup), safe to
 * take while the app is running.
 */
function AboutDataCard({ about }: { about: AboutInfo }) {
  const { toast } = useToast()
  const c = about.counts
  return (
    <div
      className="card card-pad"
      style={{ marginTop: 14 }}
      data-testid="about-data-card"
    >
      <h3 style={{ fontSize: "var(--fs-lg)" }}>About &amp; data</h3>
      <div
        className="muted small"
        style={{ marginTop: 4, fontSize: "var(--fs-xs)" }}
      >
        Everything Simvest knows lives in one SQLite file on your server. Back
        it up before upgrading or moving machines.
      </div>
      <dl className="about-grid">
        <dt>Version</dt>
        <dd className="mono" data-testid="about-version">
          {about.version}
        </dd>
        <dt>Database file</dt>
        <dd>
          <code className="about-path" data-testid="about-db-path">
            {about.dbPath}
          </code>
          <div className="muted small" style={{ fontSize: "var(--fs-2xs)" }}>
            Set by DATABASE_URL. With Docker Compose it sits in the simvest-data
            volume.
            {about.dbBytes !== null &&
              ` About ${fmtNum(about.dbBytes / 1_048_576, 1)} MB.`}
          </div>
        </dd>
        <dt>What’s in it</dt>
        <dd data-testid="about-counts">
          {fmtCount(c.portfolios, "portfolio", "portfolios")} ·{" "}
          {fmtCount(c.entries, "monthly entry", "monthly entries")} ·{" "}
          {fmtCount(c.holdings, "holding", "holdings")} ·{" "}
          {fmtCount(c.incomeEvents, "payout", "payouts")} ·{" "}
          {fmtCount(c.goals, "goal", "goals")}
        </dd>
      </dl>
      <div className="about-actions">
        <a
          href="/api/backup"
          download
          className="btn btn-secondary"
          data-testid="about-backup-download"
          onClick={() => toast("Backup started — check your downloads", "info")}
        >
          <Icon name="download" size={15} /> Download a backup
        </a>
        <span className="muted small" style={{ fontSize: "var(--fs-2xs)" }}>
          A complete copy of the database. To restore, stop Simvest and put the
          file back at the path above.
        </span>
      </div>
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
      className="settings-pref-row"
      style={{
        padding: "14px 0 4px",
        borderTop: "1px solid var(--border)",
        marginTop: 14,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
          Number format
        </div>
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
      <div className="settings-pref-control">
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

const THEME_OPTIONS: SegOption<ThemePreference>[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

/**
 * Colour theme. Stored in this browser (localStorage), not the database, so
 * a phone and a laptop can differ; applied before first paint by the init
 * script in the root layout. "System" follows the OS and switches live.
 */
function AppearanceRow() {
  const { preference, resolved, setPreference } = useTheme()
  return (
    <div
      data-testid="appearance-row"
      className="settings-pref-row"
      style={{
        padding: "14px 0 4px",
        borderTop: "1px solid var(--border)",
        marginTop: 14,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
          Appearance
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>
          Light, dark, or follow your device. Saved in this browser only.
          {preference === "system" && (
            <>
              {" "}
              Your device is currently using the <strong>
                {resolved}
              </strong>{" "}
              theme.
            </>
          )}
        </div>
      </div>
      <div className="settings-pref-control">
        <SegControl
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
          ariaLabel="Theme"
          testId="theme-control"
        />
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
      className="settings-pref-row"
      style={{ padding: "4px 0" }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
          Default day for monthly entries
        </div>
        <div
          className="muted small"
          style={{ fontSize: "var(--fs-2xs)", marginTop: 4 }}
        >
          Which day of the month a new entry on Monthly Entries starts on.
          Existing entries keep their stored day.
        </div>
      </div>
      <div
        role="group"
        aria-label="Default entry day"
        className="settings-daypicker-group"
        style={{
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
              aria-label="Custom day of month"
              onChange={(e) => {
                const n = Math.max(
                  1,
                  Math.min(31, Math.floor(parseFloat(e.target.value) || 1))
                )
                onChange(String(n))
              }}
              onClick={(e) => e.stopPropagation()}
              className="settings-day-input"
              data-testid="default-entry-day-custom-input"
              style={{
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: isCustom ? "var(--surface)" : "transparent",
                color: "inherit",
                fontSize: "var(--fs-xs)",
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
      className="settings-segment-btn"
      style={{
        padding: "6px 12px",
        fontSize: "var(--fs-xs)",
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
      {/* Single grid for the whole row (was two independent grids stacked
          on top of each other) so Export/Edit/Delete can be regrouped into
          one actions line on mobile via `order` — see .settings-portfolio-row
          in globals.css. Desktop keeps the original two-line layout via
          grid-template-areas. */}
      <div className="settings-portfolio-row">
        <div className="settings-pf-swatch">
          <ColorPicker
            value={portfolio.color}
            onChange={(c) => onChange({ color: c })}
          />
        </div>
        <div className="settings-pf-name">
          <input
            className="input-bare"
            aria-label={`${portfolio.name} name`}
            value={portfolio.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <div className="muted small" style={{ fontSize: "var(--fs-2xs)" }}>
            {fmtCount(portfolio.entries.length, "entry", "entries")}
          </div>
        </div>
        <div
          className="settings-pf-contrib"
          id={`contribution-${portfolio.id}`}
        >
          {/* C13: €0 is a real choice, so it shows as "0,00" — never a blank
              field that looks unset — and the caption says what it means. */}
          <MoneyInput
            value={
              portfolio.contributionSet
                ? portfolio.targetMonthlyContribution
                : null
            }
            placeholder="Not set yet"
            onChange={(v) => {
              if (v !== null && v >= 0) {
                onChange({ targetMonthlyContribution: v })
              }
            }}
            locale={locale}
            min={0}
            allowEmpty={false}
            ariaLabel={`${portfolio.name} monthly contribution`}
            testId={`settings-contribution-${portfolio.id}`}
          />
          <div
            className="muted small"
            style={{ fontSize: "var(--fs-2xs)" }}
            data-testid={`settings-contribution-caption-${portfolio.id}`}
          >
            {!portfolio.contributionSet
              ? "Not set yet — set a monthly contribution"
              : portfolio.targetMonthlyContribution > 0
                ? "Monthly contribution · used by Projection and Goals"
                : "Nothing going in each month — goals plan with €0 here"}
          </div>
        </div>
        <div
          className="settings-pf-summary muted small"
          style={{ fontSize: "var(--fs-xs)", color: "var(--neutral-600)" }}
          data-testid={`portfolio-starting-summary-${portfolio.id}`}
        >
          {hasStartingBalance ? (
            <>
              <span style={{ color: "var(--neutral-500)" }}>
                Paid in before tracking{" "}
              </span>
              <strong
                className="mono"
                style={{ color: "var(--neutral-800)", fontWeight: 600 }}
              >
                {fmtEUR(portfolio.startingValue, { decimals: 2 })}
              </strong>
              <span style={{ color: "var(--neutral-500)" }}> · as of </span>
              <strong style={{ color: "var(--neutral-800)", fontWeight: 600 }}>
                {fmtMonthKey(portfolio.startingDate!)}
              </strong>
            </>
          ) : (
            <span style={{ color: "var(--neutral-400)" }}>
              Tracked from its first entry — nothing paid in before
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-icon btn-ghost settings-pf-export"
          onClick={onExport}
          aria-label={`Export ${portfolio.name}`}
          title="Download this portfolio as a file you can import again"
          data-testid={`portfolio-export-${portfolio.id}`}
        >
          <Icon name="download" size={14} />
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm settings-pf-edit"
          onClick={onEdit}
          title="Change name, colour, contribution or money paid in before tracking"
          data-testid={`portfolio-edit-${portfolio.id}`}
        >
          <Icon name="edit" size={12} /> Edit
        </button>
        <button
          type="button"
          className="btn btn-icon btn-ghost settings-pf-delete"
          aria-label={`Delete ${portfolio.name}`}
          title="Delete this portfolio and its entries — asks first"
          onClick={onDelete}
        >
          <Icon name="trash" size={14} />
        </button>
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
        title="The colour this account uses in every chart"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="settings-color-trigger"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: swatch(value),
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
              aria-label={identityColorName(c)}
              aria-pressed={value === c}
              className="settings-palette-swatch"
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: swatch(c),
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
