---
paths:
  - "simvest/tests/unit/**"
  - "simvest/tests/integration/**"
---

# Unit and Integration Test Conventions

## Environment guard

`tests/setup.ts` enforces `DATABASE_URL=:memory:` — if it's anything else, the suite throws before any test runs. The `.env.test` file sets this. Never hardcode a file path DB in unit or integration tests.

## Explicit Vitest imports — no globals

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest"
```

`globals: false` in `vitest.config.ts`. Do not rely on global `test` or `expect`.

## Test naming: ID prefix

```ts
it("INT-GOALS-001 — GET /api/goals returns empty array on fresh DB", async () => { ... })
it("INT-GOALS-002 — POST /api/goals creates a goal and returns 201", async () => { ... })
```

Unit prefix: `UNIT-<FILE>-NNN` (e.g., `UNIT-CALC-001`).
Integration prefix: `INT-<RESOURCE>-NNN` (e.g., `INT-GOALS-001`).

## Integration tests: call route handlers directly, not via HTTP

```ts
import { GET, POST } from "@/app/api/goals/route"
import { NextRequest } from "next/server"

const res = await GET()
expect(res.status).toBe(200)
const body = await res.json()
```

`server-only` is stubbed in `tests/stubs/server-only.ts` so route imports work in Vitest.

## Integration test setup and teardown

```ts
beforeAll(async () => {
  await ensureSeeded()
})

beforeEach(async () => {
  // wipe the table so each test starts clean
  db.delete(goals).run()
})
```

Always clean up after writes. Use direct Drizzle calls (`db.delete(table).run()`) for teardown — do not rely on test order.

## Unit test fixtures: local helper functions

```ts
function makeEntry(year: number, month: number, invested: number, value: number): EntryDTO {
  return { id: -1, year, month, day: 0, label: labelFor(year, month), invested, value, note: "" }
}
```

Build minimal fixture data inline. No shared fixture files — each test file is self-contained.

## Integration test fixture helpers: insert and return the row

```ts
function insertGoal(name = "Test Goal", target = 30000, targetYear = 2040) {
  return db.insert(goals).values({ name, target, targetYear, kind: "annual_income", scope: "combined", swr: 4.0 }).returning().get()
}
```

## `server-only` stub

`lib/db/queries.ts` uses `import "server-only"`. The Vitest alias in `vitest.config.ts` maps `"server-only"` to `tests/stubs/server-only.ts` (a no-op file). This is already wired — do not remove the alias.
