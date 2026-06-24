---
paths:
  - "simvest/lib/db/**"
---

# Database Layer Conventions

## Runtime characteristics

`better-sqlite3` is **synchronous** at the SQLite level. Drizzle wraps it but queries still execute synchronously under the hood — there are no actual async I/O waits. All query functions in `queries.ts` are declared `async` for consistency and to support `await ensureSeeded()` at the top.

## Every query function starts with `await ensureSeeded()`

`ensureSeeded()` runs migrations and inserts the default settings row. It is memoized as a Promise so it only executes once per process, regardless of concurrent calls. Do not skip it — it is the only thing that guarantees the schema exists before a query runs.

```ts
export async function getGoals(): Promise<GoalDTO[]> {
  await ensureSeeded()
  return db.select().from(goals).orderBy(asc(goals.createdAt)).all()
}
```

## Schema is in `schema.ts`, migrations in `drizzle/`

Tables: `portfolios`, `entries`, `goals`, `settings`, `holdings`, `dividendEvents`.

Adding a column: run `drizzle-kit generate` (or hand-write the next-numbered `.sql` file + matching `drizzle/meta/_journal.json` entry). Never alter live schema manually — `migrate()` only runs forward.

Key constraints worth remembering:
- `entries` has a unique index on `(portfolioId, year, month)` — upsert logic must account for this
- `settings` always has exactly one row with `id = 1`
- All cascade-delete foreign keys: deleting a portfolio removes its entries, goals (scoped), holdings, and dividend events

## Map DB rows to DTOs inside query functions

Query functions own the DTO boundary. Rounding, type casting, and field renaming happen here — callers receive clean `EntryDTO`, `GoalDTO`, etc., never raw Drizzle row objects.

## `db` singleton is memoized on `globalThis` in dev

This survives HMR without opening multiple SQLite connections. In production it is a plain module-level singleton. Do not instantiate a second `Database` anywhere except `tests/e2e/global-setup.ts` (which uses a separate e2e database path).

## Never import from `lib/db` in client components

`lib/db/queries.ts` carries `import "server-only"`. Importing it in a client component breaks the build. Client components import types from `@/lib/types` only.
