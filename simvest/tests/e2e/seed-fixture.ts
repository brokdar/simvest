import type Database from "better-sqlite3"

/**
 * Seeds the e2e SQLite DB with deterministic demo data. Called by the
 * per-worker fixture (`tests/e2e/fixtures.ts`) on worker startup and
 * again from `afterEach(resetDb)` between tests.
 *
 * Demo data shape:
 *   - 2 portfolios: "Global Equity ETF" (id=1) and "Dividend Income" (id=2)
 *   - 60 monthly entries per portfolio
 *   - 7 holdings — a quarterly ETF, a monthly REIT, a quarterly dividend
 *     ETF, a semi-annual European stock, an annual energy stock, an
 *     irregular small cap, and one zero-event holding for the empty branch
 *   - 24 months of dividend events covering monthly / quarterly /
 *     semi-annual / annual cadences, plus 4 interest events
 *   - 2 goals: "Comfortable FI" (€36k/yr by 2040) and "Early FI" (€24k/yr by 2032)
 *   - settings row with default values
 *
 * The Next.js server writes to this DB on its own connection. To avoid racing
 * its WAL writes with our DELETE+INSERT we take an EXCLUSIVE write lock and
 * disable foreign-key enforcement for the duration of the reset. The lock
 * (via better-sqlite3's `transaction()`) blocks the server's writer until we
 * COMMIT; disabling FKs means delete order is irrelevant and we don't have to
 * worry about a server write landing mid-reset. FKs are restored on exit.
 */
export function seedFixture(sqlite: Database.Database) {
  sqlite.pragma("foreign_keys = OFF")
  try {
    const seed = sqlite.transaction(() => {
      sqlite.exec(`
        DELETE FROM dividend_events;
        DELETE FROM holdings;
        DELETE FROM goals;
        DELETE FROM entries;
        DELETE FROM portfolios;
        DELETE FROM settings;
        DELETE FROM sqlite_sequence WHERE name IN (
          'portfolios', 'entries', 'goals', 'holdings', 'dividend_events'
        );
      `)
      insertSeedRows(sqlite)
    })
    seed.exclusive()
  } finally {
    sqlite.pragma("foreign_keys = ON")
  }
}

function insertSeedRows(sqlite: Database.Database) {
  sqlite
    .prepare(
      "INSERT INTO settings (id, inflation, conservative_return, optimistic_return, monthly_saving, horizon_years, default_entry_day, default_swr, dividend_basis) VALUES (1, 2.4, 4.0, 10.0, 1250, 20, 'last', 4.0, 'net')"
    )
    .run()

  const insertPortfolio = sqlite.prepare(
    "INSERT INTO portfolios (name, color, target_monthly_contribution, starting_value, starting_date, created_at) VALUES (?, ?, ?, 0, NULL, ?)"
  )
  const insertEntry = sqlite.prepare(
    "INSERT INTO entries (portfolio_id, year, month, day, invested, value, note) VALUES (?, ?, ?, 28, ?, ?, '')"
  )
  const insertHolding = sqlite.prepare(
    "INSERT INTO holdings (portfolio_id, name, type, isin, created_at) VALUES (?, ?, ?, ?, ?)"
  )
  // German withholding on cash dividends is ~26.4% — applying it on seed
  // events so the Net/Gross toggle visibly flips totals in tests.
  const insertDividend = sqlite.prepare(
    "INSERT INTO dividend_events (holding_id, portfolio_id, paid_date, amount, kind, tax, note, created_at) VALUES (?, ?, ?, ?, 'dividend', ?, ?, ?)"
  )
  const insertInterest = sqlite.prepare(
    "INSERT INTO dividend_events (holding_id, portfolio_id, paid_date, amount, kind, tax, note, created_at) VALUES (NULL, ?, ?, ?, 'interest', ?, ?, ?)"
  )
  const TAX_RATE = -0.264
  const taxFor = (amount: number) => Math.round(amount * TAX_RATE * 100) / 100
  const insertGoal = sqlite.prepare(
    "INSERT INTO goals (name, target_year, color, kind, scope, portfolio_id, target, swr, yield_assumed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )

  const now = Date.now()

  const equityId = Number(
    insertPortfolio.run("Global Equity ETF", "#1E40AF", 1000, now)
      .lastInsertRowid
  )
  const dividendId = Number(
    insertPortfolio.run("Dividend Income", "#059669", 500, now).lastInsertRowid
  )

  seedEntries(insertEntry, equityId, 2019, 1, 60, {
    startValue: 10_000,
    monthlyInvested: 1000,
    monthlyGrowthPct: 0.7,
    seed: equityId,
  })
  seedEntries(insertEntry, dividendId, 2019, 1, 60, {
    startValue: 5000,
    monthlyInvested: 500,
    monthlyGrowthPct: 0.4,
    seed: dividendId,
  })

  // Holdings — diverse cadences and a final zero-event holding.
  const vwrlId = Number(
    insertHolding.run(
      equityId,
      "Vanguard FTSE All-World",
      "etf",
      "IE00B3RBWM25",
      now
    ).lastInsertRowid
  )
  const realtyId = Number(
    insertHolding.run(equityId, "Realty Income", "stock", "US7561091049", now)
      .lastInsertRowid
  )
  const vhydId = Number(
    insertHolding.run(
      dividendId,
      "Vanguard FTSE All-World High Dividend",
      "etf",
      "IE00B8GKDB10",
      now
    ).lastInsertRowid
  )
  const allianzId = Number(
    insertHolding.run(dividendId, "Allianz SE", "stock", "DE0008404005", now)
      .lastInsertRowid
  )
  const shellId = Number(
    insertHolding.run(dividendId, "Shell plc", "stock", "GB00BP6MXD84", now)
      .lastInsertRowid
  )
  const irregularId = Number(
    insertHolding.run(equityId, "Acme Micro Cap", "stock", null, now)
      .lastInsertRowid
  )
  // Zero-event holding so the empty-row branch in /holdings is exercised.
  insertHolding.run(
    equityId,
    "Berkshire Hathaway",
    "stock",
    "US0846707026",
    now
  )

  // 24 months of synthetic dividend events. We anchor every cadence to a
  // shared "now" reference month so tests can derive expected month buckets
  // without timezone gymnastics.
  const today = new Date()
  const baseYear = today.getFullYear()
  const baseMonth = today.getMonth() + 1
  const isoYearMonth = (yearsBack: number, monthsBack: number, day = 15) => {
    const totalMonthsBack = yearsBack * 12 + monthsBack
    const total0 = baseMonth - 1 - totalMonthsBack
    const year = baseYear + Math.floor(total0 / 12)
    const month = (((total0 % 12) + 12) % 12) + 1
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  const divRun = (
    holdingId: number,
    portfolioId: number,
    date: string,
    amount: number,
    note: string
  ) =>
    insertDividend.run(
      holdingId,
      portfolioId,
      date,
      amount,
      taxFor(amount),
      note,
      now
    )
  const intRun = (
    portfolioId: number,
    date: string,
    amount: number,
    note: string
  ) => insertInterest.run(portfolioId, date, amount, taxFor(amount), note, now)

  // Realty Income — monthly, 18 months
  for (let i = 17; i >= 0; i--) {
    divRun(
      realtyId,
      equityId,
      isoYearMonth(0, i, 8),
      11.4 + (i % 5) * 0.2,
      "Monthly distribution"
    )
  }

  // VWRL — quarterly, 8 events over 24 months (months 0,3,6,...,21)
  for (let i = 0; i < 8; i++) {
    divRun(
      vwrlId,
      equityId,
      isoYearMonth(0, i * 3, 12),
      58 + i * 1.5,
      "Quarterly distribution"
    )
  }

  // VHYD — quarterly, 8 events shifted one month from VWRL so months overlap
  for (let i = 0; i < 8; i++) {
    divRun(
      vhydId,
      dividendId,
      isoYearMonth(0, i * 3 + 1, 20),
      42 + i * 1.1,
      "Quarterly distribution"
    )
  }

  // Allianz — annual (1 payout per year, ~12-month gap)
  divRun(allianzId, dividendId, isoYearMonth(0, 4, 25), 96, "Annual dividend")
  divRun(allianzId, dividendId, isoYearMonth(1, 4, 25), 91, "Annual dividend")

  // Shell — semi-annual, 4 events over 24 months
  for (let i = 0; i < 4; i++) {
    divRun(
      shellId,
      dividendId,
      isoYearMonth(0, i * 6, 18),
      28 + i,
      "Semi-annual distribution"
    )
  }

  // Acme Micro Cap — irregular (two payouts with a >540 day gap)
  divRun(irregularId, equityId, isoYearMonth(0, 1, 5), 14, "Special")
  divRun(irregularId, equityId, isoYearMonth(1, 11, 5), 18, "Special")

  // 4 interest events scattered across the 24-month window.
  intRun(dividendId, isoYearMonth(0, 0, 28), 4.5, "Monthly cash interest")
  intRun(dividendId, isoYearMonth(0, 5, 28), 3.8, "Monthly cash interest")
  intRun(dividendId, isoYearMonth(0, 11, 28), 4.2, "Monthly cash interest")
  intRun(dividendId, isoYearMonth(1, 5, 28), 3.4, "Monthly cash interest")

  insertGoal.run(
    "Comfortable FI",
    2040,
    "#1E40AF",
    "annual_income",
    "combined",
    null,
    36_000,
    4.0,
    null,
    now
  )
  insertGoal.run(
    "Early FI",
    2032,
    "#7C3AED",
    "annual_income",
    "combined",
    null,
    24_000,
    4.0,
    null,
    now
  )
}

function seedEntries(
  stmt: Database.Statement,
  portfolioId: number,
  startYear: number,
  startMonth: number,
  count: number,
  opts: {
    startValue: number
    monthlyInvested: number
    monthlyGrowthPct: number
    seed: number
  }
) {
  let value = opts.startValue
  for (let i = 0; i < count; i++) {
    const monthOffset = startMonth - 1 + i
    const year = startYear + Math.floor(monthOffset / 12)
    const month = (monthOffset % 12) + 1
    const r = ((Math.sin(opts.seed * 31 + i) + 1) / 2 - 0.5) * 0.02
    const growth = opts.monthlyGrowthPct / 100 + r
    value = value * (1 + growth) + opts.monthlyInvested
    stmt.run(portfolioId, year, month, opts.monthlyInvested, Math.round(value))
  }
}
