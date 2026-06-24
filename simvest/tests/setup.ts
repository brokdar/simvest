import { beforeAll } from "vitest"

beforeAll(() => {
  if (process.env.DATABASE_URL !== ":memory:") {
    throw new Error(
      `Tests require DATABASE_URL=:memory:, got ${process.env.DATABASE_URL ?? "<unset>"}`
    )
  }
})
