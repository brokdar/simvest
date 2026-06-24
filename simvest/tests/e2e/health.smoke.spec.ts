import { test, expect } from "./fixtures"

test("GET /api/health returns ok", async ({ request }) => {
  const res = await request.get("/api/health")
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe("ok")
  expect(body.database).toBe("ok")
})
