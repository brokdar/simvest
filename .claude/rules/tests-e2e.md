---
paths:
  - "simvest/tests/e2e/**"
  - "simvest/playwright.config.ts"
---

# E2E Test Conventions

> **Skill:** For Playwright patterns beyond what's documented here — Page Object Model, flaky test fixes, accessibility testing, CI configuration, API mocking — invoke `/playwright-best-practices`.

## Architecture: per-worker DB + per-worker server

Each Playwright worker spawns its **own** `node .next-e2e/standalone/server.js` on `3100 + parallelIndex` against its **own** SQLite file (`data/.e2e/worker-<idx>.db`). There is no shared `webServer` and no shared database. The worker-scoped fixture in `tests/e2e/fixtures.ts` (auto-runs for every spec) handles the entire lifecycle: seed → spawn → wait for `/api/health` → expose `baseURL` and `resetDb` → SIGTERM + cleanup on teardown.

This is what makes `fullyParallel: true` actually safe. The fixture is documented inline; the architectural rationale is in `simvest/E2E_PARALLEL_ISOLATION.md`.

## Import `test` and `expect` from `../fixtures`, not `@playwright/test`

```ts
import { test, expect } from "../fixtures"     // ../../fixtures from tests/e2e/<group>/
```

Importing from `@playwright/test` bypasses the worker-scoped server fixture — your spec will hit a non-existent port and every test will fail. The only legitimate `@playwright/test` import in spec files is `import type { Page }` (types are fine).

## Database seeding + per-test reset

The fixture seeds each worker's DB on startup via `seedFixture()` (extracted to `tests/e2e/seed-fixture.ts` so the same shape is used everywhere). The seed is **two portfolios** (`id=1` "Global Equity ETF", `id=2` "Dividend Income"), **60 monthly entries per portfolio**, **2 holdings**, **4 dividend events**, **2 goals** ("Comfortable FI", "Early FI"), **default settings**.

**Tests are allowed to mutate the fixture** — but every spec file whose tests insert / edit / delete rows must reset between tests via the fixture-provided `resetDb`:

```ts
test.afterEach(async ({ resetDb }) => {
  resetDb()
})
```

`resetDb` wipes + reseeds the worker's own DB (uncontended — no other worker can see it). Read-only spec files (overview, shell-navigation, accessibility-reads, etc.) don't need the hook.

## `next build` runs once; per-worker servers spawn from it

`globalSetup` in `tests/e2e/global-setup.ts` runs `next build` once into its own distDir `.next-e2e/` (so it never clobbers a running dev server's `.next`), copies `.next-e2e/static` + `public/` into `.next-e2e/standalone/`, and exits. The per-worker fixture then spawns one server per worker against that standalone output. The build is skipped automatically when its inputs are unchanged (sha256 of `app/ components/ hooks/ lib/ public/ drizzle/`, root configs and `.env*`, stamped in `.next-e2e/build-inputs.sha256`), so editing specs never rebuilds. `E2E_FORCE_BUILD=1` forces a rebuild; `E2E_SKIP_BUILD=1` reuses whatever build exists, even a stale one.

Implications:
- All API routes are dynamic-by-default at runtime, so no static-prerender races on the fresh SQLite WAL.
- The e2e build skips Next's TypeScript pass (`NEXT_SKIP_TYPECHECK=1`); type errors are caught by `bun run typecheck` (first step of `verify`, and the pre-commit hook). The build still fails on compile errors.
- `lib/db/index.ts` detects `NEXT_PHASE === "phase-production-build"` and returns a stub `db` so parallel build workers don't race to open SQLite.

Failure artifacts: screenshot + `error-context.md` always; video only on retries (CI) unless `E2E_VIDEO=1`.

## Clear localStorage in every `beforeEach`

```ts
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.clear() } catch { /* about:blank — ignore */ }
  })
})
```

## Scope tests to the right Playwright project

```ts
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop only")
})
```

Projects: `chromium-desktop` (1440×900) and `mobile-safari` (iPhone 15 Pro). Cross-platform tests live in `tests/e2e/cross/` and should not filter by project. Desktop-only specs go in `tests/e2e/desktop/`, mobile-only in `tests/e2e/mobile/`. `playwright.config.ts` `testIgnore`s `mobile/**` on chromium-desktop and `desktop/**` (plus `cross/layout-integrity.spec.ts`, which sets its own viewports) on mobile-safari, so wrong-project tests are never scheduled; keep the in-spec skip anyway as a guard.

## Stable selectors: prefer `data-testid`

```ts
await page.locator('[data-testid="kpi-portfolio-value"]').waitFor()
```

Avoid coupling to CSS classes, element hierarchy, or display text that may change. Avoid positional selectors like `input[type="number"]'.nth(1)` — they are silent footguns when the form layout changes. Add `data-testid` attributes to new interactive or key display elements (the entry editor's `entry-editor-invested` / `entry-editor-value` are the canonical pattern).

## Test naming: ID prefix

```ts
test("E2E-D-OV-001 — overview page shows KPI cards with non-zero values", async ({ page }) => { ... })
```

Prefix pattern: `E2E-<D|M|X>-<PAGE>-NNN` (D=desktop, M=mobile, X=cross).

## Pre-select a portfolio with `preselectPortfolio(page, id)` — never raw `localStorage.setItem`

The selected portfolio is keyed off the `simvest.selectedPortfolio` **cookie** for SSR (see `lib/db/queries.ts → getInitialData()`), with `localStorage` written as a secondary mirror for legacy callers and `PERSIST-007`. Raw `page.addInitScript(() => localStorage.setItem(...))` won't seed the cookie — `addInitScript` fires after the first navigation begins, so the server SSRs Combined, then the client snaps to the user's portfolio.

```ts
import { preselectPortfolio } from "../helpers"

test.beforeEach(async ({ page }) => {
  await preselectPortfolio(page, 1)   // cookie (via addCookies, domain: localhost) + localStorage (via addInitScript)
})
```

The helper uses `domain: "localhost"` for the cookie (not a port-pinned URL), so it works across all worker ports.

## NEVER use `page.waitForTimeout()`

Wait on assertions instead. `expect(locator).toBeVisible()` (or any other `expect(...).toX()`) auto-polls up to the `expect.timeout` set in `playwright.config.ts`. For network confirmation, use `waitForResponse` or poll the API via `page.request.get(...)` (see PERSIST-006 for the canonical pattern). Hardcoded sleeps are flaky and slow.

## Regexes on locale-formatted text must accept ASCII `-`

`Intl.NumberFormat` (used throughout the app for €-formatted values) emits **ASCII hyphen** (`-`, U+002D) for negative values. A regex like `/[+−][\d.,]+/` matches **only** the Unicode minus (`−`, U+2212) and will silently fail when the data goes negative. Include `-` explicitly:

```ts
expect(delta).toMatch(/[+−-][\d.,]+% vs invested/)   // accepts +, − (U+2212), -
expect(netGain).toMatch(/[+−-]?€[+−-]?[\d.,]+/)      // sign may precede € OR follow it
```

This was the root cause of two latent OV-002 / OV-003 failures that hid for months because the seed data happens to produce positive net gain.
