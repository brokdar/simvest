<div align="center">

# 📈 Simvest — Application

**The Next.js application that powers Simvest.**

A single-user, self-hosted portfolio manager and retirement simulator built on Next.js 16, React 19, Drizzle ORM, and `better-sqlite3`.

[Getting started](#getting-started) · [Commands](#commands) · [Architecture](#architecture) · [Project structure](#project-structure) · [Testing](#testing)

</div>

---

> [!NOTE]
> This README covers the application itself. For the product overview and self-hosting with Docker, see the **[repository README](../README.md)**. For the full architecture and conventions reference, see [`../CLAUDE.md`](../CLAUDE.md).

All commands below run from this directory (`simvest/`).

## Getting started

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. The app starts empty — there is no demo seed — so add a portfolio and your first monthly entry to begin.

> [!NOTE]
> Drizzle migrations run automatically on the first database call (`ensureSeeded()` in `lib/db/seed.ts`), which also inserts a default settings row. No manual migration step is needed. The database defaults to `./data/simvest.db`; override with `DATABASE_URL`.

## Commands

```bash
npm run dev          # next dev --turbopack
npm run build        # next build (produces .next/standalone for Docker)
npm run start        # next start (after build)

npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write

npm run test         # vitest run (unit + integration)
npm run test:watch   # vitest (watch mode)
npm run test:e2e     # playwright test
npm run test:e2e:ui  # playwright test --ui

npm run import:excel # tsx scripts/import-excel.ts — one-shot ingest of an .xlsx workbook
```

> [!IMPORTANT]
> Prettier config: no semicolons, double quotes, `es5` trailing commas, with the Tailwind class-sorting plugin. Run `npm run format` before committing.

## Architecture

**Server → client data flow.** `app/layout.tsx` calls `getInitialData()` (server-only) and hands the full snapshot — portfolios, goals, settings — to `<DataProvider>` (client). After hydration the provider is the single source of truth: mutations go through its callbacks (`upsertEntry`, `addGoal`, `updateSettings`), which call the JSON API routes under `app/api/**` and update local state. Views read via `useData()` and never fetch directly.

**Type boundary.** `lib/types.ts` holds plain DTOs (`EntryDTO`, `PortfolioDTO`, `GoalDTO`, `SettingsDTO`) and is client-safe. `lib/db/queries.ts` is `import "server-only"`.

> [!WARNING]
> Client components must import types from `@/lib/types`, **never** from `@/lib/db/queries` — pulling a server-only module into a client component breaks the build.

**Calc layer.** `lib/calc.ts` is pure functions over DTOs — portfolio aggregation, KPIs, historical return, future projection, required-monthly-investment, dividend aggregators, and the unified `evaluateGoal()` that resolves any goal kind and scope to a current / target / projected-year tuple. No I/O, no React.

**Database boot.** `lib/db/index.ts` opens `better-sqlite3` with WAL and foreign keys on, resolves `DATABASE_URL`, and memoizes the client on `globalThis` in dev to survive HMR. Every query awaits `ensureSeeded()` first.

**Charts.** `growth-chart.tsx`, `entries-bar-chart.tsx`, `sparkline.tsx`, `progress-ring.tsx`, and everything in `components/charts/` are hand-built React + SVG.

> [!WARNING]
> Do not add Recharts / Visx / D3 or similar charting libraries — keep charts as pure SVG components.

**Routes.** `app/(dashboard)/` is a route group with one shared shell (`Sidebar` + header). Pages: Overview (`/`), Holdings (`/holdings`), Monthly Entries (`/entries`), Income (`/income`), Forecast (`/chart`), Planning (`/planning`), Settings (`/settings`). Legacy `/goals`, `/simulation`, and `/dividends` redirect via `next.config.mjs`.

## Project structure

```
simvest/
├── app/
│   ├── (dashboard)/    # Route group: shared shell + one page per view
│   ├── api/            # JSON API routes (entries, goals, holdings, income, import, …)
│   └── layout.tsx      # Server-side initial data load → DataProvider
├── components/
│   ├── views/          # One view component per dashboard page
│   ├── charts/         # Hand-built SVG charts
│   ├── shell/          # Sidebar, topbar
│   ├── ui/             # ShadCN primitives
│   └── providers/      # DataProvider (client-side source of truth)
├── lib/
│   ├── calc.ts         # Pure calculation & projection layer
│   ├── types.ts        # Client-safe DTOs
│   ├── db/             # Drizzle schema, queries (server-only), seed, mappers
│   ├── import/         # Broker parsers (Trade Republic, Bondora) + CSV engine
│   └── format.ts       # Locale-aware money/number formatting
├── drizzle/            # SQL migrations + journal
├── scripts/            # import-excel.ts and other one-shots
└── tests/              # unit, integration, e2e (cross / desktop / mobile)
```

## Database & migrations

Schema lives in `lib/db/schema.ts`. To add a change:

1. Edit `schema.ts`.
2. Generate the migration: `npx drizzle-kit generate` (or hand-write the next-numbered `.sql` file and matching `drizzle/meta/_journal.json` entry).
3. Update `tests/integration/db-migrations.test.ts` — it asserts the migration count and SHA-256-hashes each migration file.

Migrations apply automatically on the next DB call.

## Testing

- **Unit & integration** (`tests/unit`, `tests/integration`) run under Vitest — calc functions, DB queries, migration integrity.
- **End-to-end** (`tests/e2e/{cross,desktop,mobile}`) run under Playwright as separate projects covering responsive layouts.

```bash
npm run test       # unit + integration
npm run test:e2e   # end-to-end
```

> [!TIP]
> Stale `.next` after switching between `next build` and `next dev` can cause dev-mode 404s on nested dynamic POST routes. Fix with `rm -rf .next` and restart `npm run dev`.

## Configuration

| Variable       | Default             | Purpose                                         |
| -------------- | ------------------- | ----------------------------------------------- |
| `DATABASE_URL` | `./data/simvest.db` | SQLite file path (`file:` prefix tolerated)     |
| `NODE_ENV`     | —                   | `production` enables standalone server behavior |

The path alias `@/*` maps to this directory (`tsconfig.json`); use it for all internal imports.
