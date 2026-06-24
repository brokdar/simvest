"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            fontFamily:
              'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 560, textAlign: "center" }}>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>
              Simvest crashed unexpectedly
            </h1>
            <p style={{ color: "#64748B", marginBottom: 16, fontSize: 14 }}>
              {error.message || "An unknown error occurred."}
              {error.digest ? ` (id: ${error.digest})` : null}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "10px 18px",
                borderRadius: 6,
                border: "1px solid #1E40AF",
                background: "#1E40AF",
                color: "white",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
