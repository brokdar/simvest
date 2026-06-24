import Link from "next/link"

export default function NotFound() {
  return (
    <main className="view">
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <h1 className="title" style={{ marginBottom: 8 }}>
          Page not found
        </h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link href="/" className="btn btn-primary">
          Back to overview
        </Link>
      </div>
    </main>
  )
}
