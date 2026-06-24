<div align="center">

# 📈 Simvest

**Self-hosted portfolio tracker and retirement simulator for a single operator.**

Track your investments month by month, watch your holdings and dividends, set goals, and project when you'll reach them — all on your own hardware, with your data in a single SQLite file.

[Features](#features) · [Quick start](#quick-start) · [Self-hosting](#self-hosting-with-docker) · [Repository layout](#repository-layout) · [Development](./simvest/README.md)

</div>

---

Simvest is a personal finance cockpit for someone who manages their own money across one or more brokerage accounts. You record portfolio balances over time, log holdings and income, define targets ("€1M by 2045", "€2,000/month in dividends"), and let the planner tell you whether your current trajectory and contributions get you there.

> [!IMPORTANT]
> Simvest is **single-user and unauthenticated** by design. Every route is open and the app assumes one operator on a private network or behind your own reverse proxy. Do not expose it to the public internet without adding an auth layer yourself.

## Features

- **Multi-portfolio tracking** — record monthly balances per portfolio and view a combined "All Portfolios" aggregate.
- **Holdings & income** — track individual positions and log dividend / interest income, with monthly and annual rollups.
- **Forecasting** — historical-return-based projections of future portfolio value, contributions, and dividend growth.
- **Goal planning** — multi-kind goals (portfolio value, annual income, monthly/annual dividends), scoped to a single portfolio or the combined view. A unified evaluator resolves every goal to a current / target / projected-year tuple and answers _"what monthly investment gets me there?"_.
- **Data import** — bring in history from a spreadsheet or broker export. Built-in parsers for **Trade Republic** and **Bondora (Go & Grow)**, a generic CSV path, and a one-shot Excel importer.
- **Locale-aware money formatting** — number and currency formatting follow a configurable BCP-47 locale (or your browser's).
- **Local-first & lightweight** — a single `better-sqlite3` database file, hand-built SVG charts (no charting library), and a production container that runs comfortably in ~400 MB of RAM.

## Tech stack

| Layer     | Choice                                                                 |
| --------- | ---------------------------------------------------------------------- |
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Turbopack)              |
| UI        | React 19, Tailwind CSS v4, [ShadCN](https://ui.shadcn.com/) primitives |
| Language  | TypeScript                                                             |
| Data      | [Drizzle ORM](https://orm.drizzle.team/) on `better-sqlite3`           |
| Charts    | Hand-built React + SVG (no Recharts / Visx / D3)                       |
| Testing   | Vitest (unit + integration), Playwright (e2e)                          |

## Quick start

The Next.js application lives in [`simvest/`](./simvest). The fastest way to get a running instance is Docker Compose.

```bash
git clone <your-fork-url> simvest
cd simvest
docker compose up --build
```

Open **http://localhost:3000**. The app starts empty — add a portfolio and your first monthly entry, or [import existing data](#importing-data).

> [!NOTE]
> Your data is persisted in the `simvest-data` Docker volume at `/app/data/simvest.db`. Database migrations run automatically on first boot; there's no separate setup step.

For local development (hot reload, tests, linting), see the **[application README](./simvest/README.md)**.

## Self-hosting with Docker

[`docker-compose.yml`](./docker-compose.yml) builds a standalone Next.js server and runs it with sensible defaults for low-RAM hardware (a 400 MB memory cap, `--max-old-space-size=256`, and an `/api/health` healthcheck).

```bash
docker compose up --build -d   # start in the background
docker compose logs -f         # follow logs
docker compose down            # stop (the data volume is preserved)
```

| Environment variable | Default                | Purpose                                     |
| -------------------- | ---------------------- | ------------------------------------------- |
| `DATABASE_URL`       | `/app/data/simvest.db` | SQLite file path (`file:` prefix tolerated) |
| `NODE_ENV`           | `production`           | Runtime mode                                |

To back up, copy the SQLite file out of the volume. To start fresh, remove the `simvest-data` volume.

## Importing data

Simvest can ingest your existing history rather than starting from scratch:

- **In-app import** — the import flow accepts broker exports and generic CSVs (`/api/import`). Parsers ship for **Trade Republic** and **Bondora (Go & Grow)**.
- **Excel one-shot** — run `npm run import:excel` from `simvest/` to ingest a `Depotentwicklung.xlsx`-style workbook.

## Repository layout

```
.
├── simvest/            # The Next.js application (see simvest/README.md)
├── docs/               # Feature specifications and design notes
├── .devcontainer/      # VS Code dev container (Node + TypeScript, Docker-in-Docker)
├── .github/            # CI workflows (quality gate, e2e, Docker) and Dependabot
├── docker-compose.yml  # Self-hosting entrypoint
└── CLAUDE.md           # Architecture & conventions guide
```

> [!TIP]
> [`CLAUDE.md`](./CLAUDE.md) is the canonical reference for the architecture, data flow, and project conventions — start there if you're contributing.

## Development

Open the repo in the included **dev container** (VS Code → _Reopen in Container_) for a preconfigured Node + TypeScript environment, then jump to the **[application README](./simvest/README.md)** for commands, project structure, and testing.

Continuous integration runs on every pull request: a quality gate (typecheck, lint, format check, unit + integration tests), end-to-end tests, and a Docker build.
