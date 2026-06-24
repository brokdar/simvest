"use client"

import { useEffect } from "react"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[dashboard error]", error)
    }
  }, [error])

  return (
    <main className="view">
      <div
        className="card"
        style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}
        role="alert"
        aria-live="polite"
      >
        <h1 className="title" style={{ marginBottom: 6, fontSize: 20 }}>
          Something went wrong
        </h1>
        <p className="muted small" style={{ marginBottom: 16 }}>
          {error.message || "Failed to load this view."}
          {error.digest ? ` (id: ${error.digest})` : null}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={reset}
          data-testid="dashboard-error-retry"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
