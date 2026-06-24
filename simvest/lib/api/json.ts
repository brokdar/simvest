import "server-only"

/**
 * Parse a request body as JSON, tolerating empty bodies.
 *
 * Empty PATCHes happen in two harmless cases:
 *  1. The E2E `prewarmApiRoutes` step in `tests/e2e/global-setup.ts` POSTs
 *     `{}` to compile route modules.
 *  2. The `pagehide` flush in `DataProvider` can fire with no pending diff
 *     when the browser closes a tab right after a debounce flush completed.
 *
 * Both cases used to surface as `SyntaxError: Unexpected end of JSON input`
 * 500s — noisy in the dev log and confusing in tests. Returning `{}` lets
 * the caller hit the "no changes" 400 branch instead.
 */
export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text()
  if (text.trim().length === 0) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
