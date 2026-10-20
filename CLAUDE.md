# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Simvest is a single-user, self-hosted portfolio manager and retirement simulator. Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, ShadCN primitives, Drizzle ORM on `better-sqlite3`. There is no authentication — all routes are open and the app assumes one operator. The Next.js project lives in `simvest/` (this CLAUDE.md sits one level above, alongside `mise.toml`; toolchain via `mise install`). Every command below runs from `simvest/`.

## Commands

```bash
bun run dev         # next dev --turbopack
bun run build       # next build (produces .next/standalone for Docker)
bun run start       # next start (after build)
bun run typecheck   # tsc --noEmit
bun run lint        # eslint
bun run format      # prettier --write

docker compose up --build   # run from repo root; data persisted in `simvest-data` volume
```

```bash
bun run test          # vitest run (unit + integration under tests/unit, tests/integration)
bun run test:watch    # vitest (watch mode)
bun run test:e2e      # playwright test (tests/e2e/{cross,desktop,mobile} — separate Playwright projects)
bun run test:e2e:ui   # playwright test --ui
bun run import:excel  # tsx scripts/import-excel.ts — one-shot ingest of Depotentwicklung.xlsx
```

**No component-test layer.** Vitest runs in the `node` environment (no jsdom/@testing-library), so React components are not unit-tested. Put pure logic in `tests/unit` (vitest) and verify UI wiring/rendering through Playwright e2e (`tests/e2e/{desktop,mobile}`). e2e global setup rebuilds `.next-e2e` only when app inputs changed (content hash of `app/ components/ hooks/ lib/ public/ drizzle/`, root configs, `.env*`), so spec-only edits skip the build; `E2E_FORCE_BUILD=1` forces one. Workers default to half the cores (max 12); the e2e build skips Next's TS pass (`typecheck` covers it); video only on retries unless `E2E_VIDEO=1`. Target a single spec with `bun run playwright test <spec> --project=chromium-desktop -g "<test-id>"`.

Drizzle migrations run automatically on first DB call — `ensureSeeded()` in `lib/db/seed.ts` invokes `migrate(db, { migrationsFolder: "./drizzle" })`. Add new schema changes via `drizzle-kit generate` (or by hand-writing the next-numbered `.sql` file and a matching entry in `drizzle/meta/_journal.json`).

## Architecture

**Server → client data flow.** `app/layout.tsx` calls `getInitialData()` (server-only) and passes the full snapshot — portfolios, goals, settings — into `<DataProvider>` (client). After hydration, the provider is the single source of truth: mutations go through its callbacks (`upsertEntry`, `addGoal`, `updateSettings`), which call the JSON API routes under `app/api/**` and update local state. Views read via `useData()`; they never fetch directly. Settings writes are debounced 400 ms so slider drags don't hammer the DB.

**Type boundary.** `lib/types.ts` holds plain DTOs (`EntryDTO`, `PortfolioDTO`, `GoalDTO`, `SettingsDTO`) plus the `labelFor(year, month)` helper. `lib/db/queries.ts` is `import "server-only"` and re-exports these types. **Client components must import types from `@/lib/types`, never from `@/lib/db/queries`** — pulling a server-only module into a client component breaks the build.

**Database boot.** `lib/db/index.ts` opens `better-sqlite3` with WAL + foreign keys on, resolves `DATABASE_URL` (default `./data/simvest.db`, `file:` prefix tolerated), and memoizes the client on `globalThis` in dev to survive HMR. `ensureSeeded()` in `lib/db/seed.ts` runs Drizzle migrations, then inserts a default `settings` row if missing. The app does not seed demo portfolios or goals — fresh installs start empty. Every query in `queries.ts` awaits `ensureSeeded()` first.

**Calc layer.** `lib/calc.ts` is pure functions over DTOs — `aggregatePortfolios` (combined view with `id: 0`), `computeKPIs`, `historicalAnnualReturnWithSource`, `projectFuture`, `requiredMonthlyInvestment`, dividend aggregators, and the unified `evaluateGoal(goal, ctx)` evaluator that resolves any goal kind (`portfolio_value` / `annual_income` / `dividend_annual` / `dividend_monthly`) and scope (`combined` / `portfolio`) to a current/target/projected-year tuple. No I/O, no React. Views import these directly.

**Import subsystem.** `lib/import/` parses broker exports into entries via a parser registry (`registry.ts`) — currently Trade Republic and Bondora (Go & Grow), plus a generic CSV path. The two-step flow is `POST /api/import/preview` (parse + dry-run) then `POST /api/import/commit`. Separately, `scripts/import-excel.ts` (`bun run import:excel`) is a one-shot CLI ingest of a `Depotentwicklung.xlsx`-style workbook.

**Shared helpers.** Before writing a local helper, check: `lib/types.ts` (`ISIN_RE`, `resolveDefaultPortfolio`, `COMBINED_PORTFOLIO_ID`, `labelFor` — DTO boundary, client-safe), `lib/calc.ts` (`round2` for cents, plus projection/goal evaluators), `lib/dates.ts` (`todayISO`, `toISODate`, `fromISODate`), `components/ui/field-label.tsx` (the 12px/600/neutral-600 editor label used by every editor), `components/money-input.tsx` (the **only** money input — locale-aware text field with no spinner; pair with `useResolvedLocale()` from `components/use-resolved-locale.ts`).

**Locale & money formatting.** `settings.locale` (`SettingsDTO.locale`, BCP-47 or `null` = auto) is the user override for number formatting. `useResolvedLocale()` resolves it against the browser, and `<LocaleSync>` (mounted inside `DataProvider`) syncs the resolved value into `lib/format.ts` so `fmtEUR / fmtPct / fmtNum` automatically pick up the user's choice — call sites need no changes. Never hardcode `"de-DE"` or call `.toLocaleString("de-DE", …)` in components.

**Routes.** `app/(dashboard)/` is a route group with one shared shell (`layout.tsx` → `Sidebar` + `HeaderShell`). Sub-routes are `/`, `/projection`, `/entries`, `/holdings`, `/income`, `/goals`, `/settings`; each is a thin page that renders one view from `components/views/*`. Legacy `/planning` and `/simulation` redirect to `/goals`, `/chart` to `/projection`, and `/dividends` to `/income`, via `next.config.mjs` redirects. `HeaderShell` is context-aware via `usePathname` and signals editors through the `EditorIntentProvider` context (`components/providers/editor-intent.tsx`): it calls `useEditorIntentBus().requestNew(kind)` and the active view subscribes via `useEditorIntent(kind, handler)`. Editor `kind`s are `entry | goal | holding | dividend`. (This replaced the old `window.dispatchEvent("simvest:new-*")` scheme — there are no `simvest:` window events anymore.)

**Goals model.** Goals are multi-scope (`combined` or scoped to a single portfolio) and multi-kind (`portfolio_value`, `annual_income`, `dividend_annual`, `dividend_monthly`). The unified `evaluateGoal` is the single source of truth for goal math — used by the Planning page, chart overlays, the overview goal-progress section, and goal tiles. SWR per-goal-with-default and yield per-goal-with-trailing-12m-default keep goal math user-controllable without polluting global Settings. The 4% SWR is no longer hardcoded anywhere.

**Charts are hand-built SVG.** `growth-chart.tsx`, `entries-bar-chart.tsx`, `sparkline.tsx`, `progress-ring.tsx` (top-level in `components/`) and `components/charts/solver-chart.tsx` are React + SVG with the design's class system. New chart components belong in `components/charts/`. **Do not add Recharts / Visx / similar** unless the user asks — keep them as pure SVG components.

**Design tokens override ShadCN defaults.** `app/globals.css` maps the design palette (#1E40AF primary, Manrope/Inter, custom neutrals) onto ShadCN's CSS variable names (`--primary`, `--card`, …) so installed primitives keep working without restyling. ShadCN is used where it fits (Dialog, Popover, Slider, Tabs, Input, Tooltip — see `components/ui/`); bespoke layout (sidebar, topbar, KPI cards, charts) is hand-built.

## Constraints worth knowing

- **`better-sqlite3` is native.** It is listed in `next.config.mjs` → `serverExternalPackages` so Webpack doesn't try to bundle it. The production Dockerfile installs `python3 make g++` in the `deps` stage to compile its binding; don't remove those.
- **Stale `.next` after switching between `next build` and `next dev`.** Dev mode (Turbopack) sometimes 404s on nested dynamic POST routes (e.g. `/api/portfolios/[id]/entries`) when `.next` carries state from a previous build. Fix: `rm -rf .next` and restart `bun run dev`. Production builds are unaffected.
- **E2E builds into `.next-e2e/`, not `.next/`.** `global-setup.ts` runs `next build` with `NEXT_DIST_DIR=.next-e2e` (read by `next.config.mjs` → `distDir`), so `bun run test:e2e` / `bun run verify` never clobber a running `bun run dev`. With `E2E_SKIP_BUILD=1` after a manual build, copy chunks yourself: `cp -r .next-e2e/static .next-e2e/standalone/.next-e2e/ && cp -r public .next-e2e/standalone/`. Symptom of forgetting: pages render but interactive components never mount (chunks 404 silently).
- **`db.transaction(fn)` runs immediately.** Drizzle's better-sqlite3 transaction executes `fn` inside a SQLite transaction and returns its result — it does NOT return a callable. Don't write `const run = db.transaction(...); run()`. Use `try { db.transaction((tx) => { ... }) } catch { ... }` for rollback-on-throw.
- **Counting inserts after `.onConflictDoNothing()`.** Chain `.returning({ id: tbl.id }).all()` and compare `.length` to the input batch size — that's how you tell real inserts from silently-dropped conflicts. Bare `.run()` after a conflict-noop gives no signal, so counters built on it lie.
- **Adding a Drizzle migration.** Also update `tests/integration/db-migrations.test.ts` — it asserts the migration count and hashes each migration file's SHA-256. Capture the new hash by running `migrate()` against `:memory:` from a project-rooted script (better-sqlite3 needs project deps), then read `__drizzle_migrations`.
- **Path alias.** `@/*` → repo root (`tsconfig.json`). Use it for all internal imports.
- **Prettier:** no semis, double quotes, trailing-comma `es5`, Tailwind plugin sorts classes. Run `bun run format` before committing.

## Known gaps (intentional, not bugs)

- No auth — required before any multi-user / public deployment.
- "Settings" and "What-if scenarios" left-nav items from the original design were dropped (no destination in the prototype).
- The topbar search input is decorative.
- The design-tool "Tweaks" panel (postMessage protocol) was intentionally skipped.
