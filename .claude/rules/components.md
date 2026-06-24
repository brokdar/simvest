---
paths:
  - "simvest/components/**"
  - "simvest/app/(dashboard)/**"
---

# Component Conventions

> **Skills:** For React patterns beyond what's documented here, invoke `/vercel-react-best-practices` and `/vercel-composition-patterns`. These skills cover hooks design, component composition, RSC boundaries, and Next.js App Router patterns specific to this stack.

## Every component file starts with `"use client"`

No exceptions for anything under `components/`. Server components live in `app/` only.

## Data comes from `useData()` / `useDataActions()`, never from direct fetches

```ts
import { useData, useDataActions } from "@/components/providers/data-provider"

const { portfolios, goals, settings, combinedPortfolio, activePortfolio, goalEvals } = useData()
const { addGoal, updateGoal, deleteGoal } = useDataActions()
```

`useData()` is the single source of truth after hydration. Views never call `fetch()` directly — mutations go through the provider callbacks which update both the DB and local state.

The provider also exposes pre-computed derived state — **prefer these over recomputing in views**:

- `combinedPortfolio` — `aggregatePortfolios(portfolios)` memoized; do not call `aggregatePortfolios` in render.
- `activePortfolio` — the currently selected portfolio (or `combinedPortfolio` when combined / selection is stale).
- `goalEvals` — `Record<goalId, GoalEvaluation>` from a single `evaluateGoal` pass per render; do not call `evaluateGoal` inside `.map()` over `goals`.
- `effectiveMonthlySaving(id)` — sum-of-contributions for combined, the portfolio's own contribution otherwise.

`useDataActions()` returns a stable bundle of mutation callbacks (identity does not change after mount). Prefer it over `useData()` in mutation-only consumers (editor `onSave`, topbar buttons) to avoid re-renders when collections change.

## Combined portfolio uses the `COMBINED_PORTFOLIO_ID` sentinel

```ts
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"

const isCombined = selectedPortfolio === COMBINED_PORTFOLIO_ID
```

Do not compare against the literal `0` — the constant lives at the DTO boundary so the meaning is unambiguous. (`0` is unused for real portfolios because SQLite autoincrement starts at 1.)

## Mutations are optimistic by default

`deleteEntry`, `deletePortfolio`, `deleteGoal`, `deleteHolding`, `deleteDividendEvent` apply the removal locally first and roll back on server failure. Editors that catch the resulting throw should surface an error toast / message; do not wait for the round-trip before clearing the row from the UI.

Debounced settings + portfolio PATCH writes flush on `pagehide` via `fetch(..., { keepalive: true })` so a pending slider tick survives a navigation away.

## Types come from `@/lib/types`, never from `@/lib/db/queries`

```ts
// correct
import type { GoalDTO, PortfolioDTO } from "@/lib/types"

// wrong — breaks the build
import type { GoalDTO } from "@/lib/db/queries"
```

## Editors are ShadCN Dialogs with controlled props

```ts
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: GoalDTO | null   // null = create mode
  onSave: (form: Form) => Promise<void> | void
}
```

Imports from `@/components/ui/dialog`. Do not build custom modal stacks.

### Reset form state on reopen via `useEditorForm`

Editor dialogs must rebuild their form when the dialog opens against a different record — `useState`'s initial value only fires on first mount. Use the shared `useEditorForm` hook rather than a hand-rolled `prevOpenKey` / `useEffect`:

```ts
import { useEditorForm } from "@/components/use-editor-form"

const [form, setForm] = useEditorForm<Form>(
  open,
  goal ? goal.id : "new",     // key — rebuilds whenever this changes while open
  () => buildInitial(goal)    // factory — runs on first mount and on key changes
)
```

The setter signature matches `useState`, so both `setForm(next)` and `setForm(prev => ...)` work.

## EditorIntent context opens editors from the topbar

`HeaderShell` calls `requestNew(kind)` on the `EditorIntent` bus. Views subscribe via `useEditorIntent(kind, handler)`:

```ts
import { useEditorIntent } from "@/components/providers/editor-intent"

useEditorIntent("goal", () => {
  setEditing(null)
  setEditorOpen(true)
})
```

Active kinds: `"entry"`, `"goal"`, `"holding"`, `"dividend"`. The bus lives at `components/providers/editor-intent.tsx`. Do NOT add `window.dispatchEvent("simvest:…")` listeners — the old window-event coupling was removed.

## Charts are hand-built SVG

New charts belong in `components/charts/`. Do not add Recharts, Visx, or any charting library unless the user explicitly asks. Existing chart components (`growth-chart.tsx`, `entries-bar-chart.tsx`, `sparkline.tsx`, `progress-ring.tsx`, `charts/solver-chart.tsx`) are the reference pattern.

## Money inputs use `MoneyInput`, never raw `<input type="number">`

Every monetary field — dialogs, inline grids, settings rows — uses `components/money-input.tsx`. It handles locale-aware decimal separators, suppresses browser spinners, validates per `min` / `allowEmpty` / `decimals`, and surfaces parse errors via `onChange(value, error)`. Pull the active locale from `useResolvedLocale()` in `@/components/use-resolved-locale` and pass it as the `locale` prop:

```ts
import { MoneyInput } from "@/components/money-input"
import { useResolvedLocale } from "@/components/use-resolved-locale"

const { locale } = useResolvedLocale()

<MoneyInput
  value={form.amount === 0 ? null : form.amount}
  onChange={(v) => setForm({ ...form, amount: v ?? 0 })}
  locale={locale}
  min={0}
  ariaLabel="Amount"
  testId="…"
/>
```

Negative amounts (e.g. tax withheld) are stored **positive** in the editor form and negated at the save boundary — do not add an `allowNegative` prop. That keeps every `MoneyInput` call site symmetric (composition-patterns `architecture-avoid-boolean-props`).

For display, the existing `fmtEUR / fmtPct / fmtNum` exports from `@/lib/format` automatically read the resolved locale via the `<LocaleSync>` component mounted inside `DataProvider`. Do not construct `Intl.NumberFormat` or call `.toLocaleString("de-DE", …)` directly in components; pass `locale` explicitly only when formatting outside the React tree.

## ShadCN components live in `components/ui/`

Available: `button`, `dialog`, `input`, `label`, `popover`, `select`, `separator`, `slider`, `tabs`, `tooltip`. Add new ShadCN primitives with `npx shadcn add <component>` — do not hand-write them. Bespoke layout (sidebar, topbar, KPI cards) is hand-built and does not use ShadCN.

## One view file per route

`components/views/` has one file per dashboard route. Pages in `app/(dashboard)/` are thin wrappers that import and render one view. Keep page files minimal — logic belongs in the view component.

## Error and loading boundaries are wired at the segment level

- `app/global-error.tsx` — last-resort full-page fallback (also wraps `<html>` because it replaces the root layout on root-level errors).
- `app/(dashboard)/error.tsx` — per-segment error boundary; reset via the `reset` prop.
- `app/(dashboard)/loading.tsx` — streamed skeleton; uses the `.skeleton` class from `globals.css`.
- `app/not-found.tsx` — 404 page.

When introducing a heavy widget (chart, large list), wrap it in `<Suspense>` so it can stream/skeleton independently of the rest of the view.

## Testing views without a real DB

`TestDataProvider` (exported from `@/components/providers/data-provider`) wraps `DataProvider` with sensible defaults. Pass overrides for whichever collections the test needs:

```tsx
import { TestDataProvider } from "@/components/providers/data-provider"

render(
  <TestDataProvider portfolios={[p1, p2]} goals={[g1]}>
    <OverviewView />
  </TestDataProvider>
)
```
