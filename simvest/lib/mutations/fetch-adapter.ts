/**
 * Wire adapter for DataProvider mutations.
 *
 * The provider receives a `FetchAdapter` and threads it into `lib/mutations.ts`.
 * Two adapters justify the seam:
 *   - the prod adapter (`createFetchAdapter`) wraps `window.fetch`,
 *   - the test adapter (`lib/mutations/test-adapter.ts`) records calls and
 *     returns canned responses without any HTTP.
 *
 * Adapters must:
 *   - throw on non-2xx, surfacing the response body's `.error` string when
 *     present (editors rely on this for inline error messages),
 *   - return parsed JSON on success.
 */
export type FetchInit = {
  body?: unknown
  /** Forward to fetch — used by debounced flushes during `pagehide`. */
  keepalive?: boolean
}

export type FetchAdapter = {
  request<T>(method: string, url: string, init?: FetchInit): Promise<T>
}

export function createFetchAdapter(
  fetchImpl: typeof fetch = globalThis.fetch
): FetchAdapter {
  return {
    async request<T>(
      method: string,
      url: string,
      init?: FetchInit
    ): Promise<T> {
      const headers: Record<string, string> = {}
      const hasBody = init?.body !== undefined
      if (hasBody) headers["Content-Type"] = "application/json"

      const res = await fetchImpl(url, {
        method,
        cache: method === "GET" ? "no-store" : undefined,
        headers: hasBody ? headers : undefined,
        body: hasBody ? JSON.stringify(init!.body) : undefined,
        keepalive: init?.keepalive,
      })
      if (!res.ok) {
        let message = `${method} ${url} failed: ${res.status}`
        try {
          const body = (await res.json()) as { error?: string } | null
          if (body && typeof body.error === "string") message = body.error
        } catch {
          // body was empty or not JSON — keep the default message
        }
        throw new Error(message)
      }
      return (await res.json()) as T
    },
  }
}
