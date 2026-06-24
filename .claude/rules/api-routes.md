---
paths:
  - "simvest/app/api/**"
---

# API Route Conventions

Route handlers live under `app/api/`. Every file is server-only — never import from `components/` or any client module.

## Response shapes

```ts
// success — collection
NextResponse.json(array)

// success — created
NextResponse.json(row, { status: 201 })

// success — updated / patched
NextResponse.json(row)

// success — deleted
NextResponse.json({ ok: true })

// error
NextResponse.json({ error: "descriptive message" }, { status: 400 | 404 | 503 })
```

Status codes: 201 for POST, 400 for bad input, 404 for missing record, 503 for DB unreachable.

## Body parsing and validation

**Per-resource validators live in `lib/validation/<resource>.ts`.** Routes parse the JSON body, hand it to the validator, and pattern-match the result:

```ts
import { validateGoalCreate } from "@/lib/validation/goal"

const body = await req.json().catch(() => null)
const v = validateGoalCreate(body)
if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
// `v.data` is the typed, coerced, validated payload — spread into drizzle .values(...)
```

Validators return `{ ok: true; data } | { ok: false; error: string }` (the `ValidationResult<T>` discriminated union in `lib/validation/_helpers.ts`). They are plain functions over plain types — **no schema library** (zod, valibot, etc.) — just primitives like `asFiniteNumber`, `asNonEmptyString`, `asEnumValue` from `_helpers.ts`.

Cross-field rules that need the saved row (e.g. "if scope changes to combined, blank portfolioId") live in the route handler, not the validator. The validator stays oblivious to DB state.

Editors and other client modules MAY import validators (they're not server-only) to surface inline errors before posting.

## Dynamic route params

Params arrive as `Promise<{ id: string }>` — must be awaited:

```ts
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  ...
}
```

## Drizzle method reference

| Goal | Method |
|------|--------|
| Fetch all rows | `.all()` |
| Fetch one row | `.get()` → returns `undefined` if missing |
| Execute (no return) | `.run()` |
| Insert/update and get row back | `.returning().get()` |

Import `db` from `@/lib/db`, tables from `@/lib/db/schema`, helpers from `drizzle-orm` (`eq`, `asc`, `count`, etc.).

## Every route handler awaits `ensureSeeded()` first

Whether the handler calls a `queries.ts` function (which seeds transitively) or talks to Drizzle directly, the first line of the body must be `await ensureSeeded()`. This eliminates the race where the first request to a fresh install hits a mutation before migrations have run.

```ts
import { ensureSeeded } from "@/lib/db/seed"

export async function POST(req: Request) {
  await ensureSeeded()
  const body = (await req.json()) as { … }
  …
}
```

`ensureSeeded()` is memoized as a Promise so the cost after the first call is a microtask — no need to optimize it away.

## Health route is the only one marked `force-dynamic`

Do not add `export const dynamic = "force-dynamic"` to other routes unless there's a specific SSG conflict. The health route needs it to prevent prerender caching of live DB counts. (`app/layout.tsx` is also marked `force-dynamic` because `getInitialData()` reads from SQLite — that one is at the layout level, not on a route handler.)

## After adding a new route

Add a corresponding integration test in `tests/integration/api-<resource>.test.ts` covering GET, POST, PATCH, and DELETE. Name tests with the `INT-<RESOURCE>-NNN` prefix.
