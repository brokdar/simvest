import type { FetchAdapter, FetchInit } from "./fetch-adapter"

export type RecordedRequest = {
  method: string
  url: string
  body?: unknown
  keepalive?: boolean
}

type Canned =
  | { kind: "ok"; data: unknown }
  | { kind: "error"; status: number; message: string }

/**
 * In-memory `FetchAdapter` for tests. Tests enqueue canned responses with
 * `.ok(data)` / `.error(status, msg)`; calls are recorded in `.requests` in
 * order so the test can assert URL / method / body shape.
 *
 * Throws if a call is made without a queued response — that way a missing
 * `.ok()` shows up as a clear test failure, not as a hanging Promise.
 */
export class TestFetchAdapter implements FetchAdapter {
  readonly requests: RecordedRequest[] = []
  private readonly queue: Canned[] = []

  ok(data: unknown): this {
    this.queue.push({ kind: "ok", data })
    return this
  }

  error(status: number, message: string): this {
    this.queue.push({ kind: "error", status, message })
    return this
  }

  async request<T>(method: string, url: string, init?: FetchInit): Promise<T> {
    this.requests.push({
      method,
      url,
      body: init?.body,
      keepalive: init?.keepalive,
    })
    const next = this.queue.shift()
    if (!next) {
      throw new Error(
        `TestFetchAdapter: no canned response for ${method} ${url}`
      )
    }
    if (next.kind === "error") throw new Error(next.message)
    return next.data as T
  }

  /** Convenience for tests that don't care about the response body. */
  okEmpty(): this {
    return this.ok({ ok: true })
  }
}
