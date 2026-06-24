export default function DashboardLoading() {
  return (
    <main className="view" data-testid="dashboard-loading">
      <div
        className="card"
        style={{ padding: 24, display: "grid", gap: 16 }}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="skeleton" style={{ height: 20, width: 200 }} />
        <div className="skeleton" style={{ height: 14, width: 320 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 88, borderRadius: 8 }}
            />
          ))}
        </div>
        <div className="skeleton" style={{ height: 260, borderRadius: 8 }} />
      </div>
    </main>
  )
}
