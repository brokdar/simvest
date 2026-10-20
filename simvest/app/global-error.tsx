"use client"

// global-error replaces the root layout, so it brings its own stylesheet and
// theme script — the tokens (and the dark palette) still apply here.
import "./globals.css"
import { THEME_INIT_SCRIPT } from "@/lib/theme"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 560, textAlign: "center" }}>
            <h1 style={{ fontSize: "var(--fs-4xl)", marginBottom: 8 }}>
              Simvest crashed unexpectedly
            </h1>
            <p
              className="muted"
              style={{ marginBottom: 16, fontSize: "var(--fs-md)" }}
            >
              {error.message || "An unknown error occurred."}
              {error.digest ? ` (id: ${error.digest})` : null}
            </p>
            <button type="button" onClick={reset} className="btn btn-primary">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
