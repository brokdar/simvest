import {
  sqliteTable,
  integer,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const portfolios = sqliteTable("portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#1E40AF"),
  targetMonthlyContribution: real("target_monthly_contribution")
    .notNull()
    .default(0),
  startingValue: real("starting_value").notNull().default(0),
  startingDate: text("starting_date"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
})

export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    day: integer("day").notNull().default(0),
    invested: real("invested").notNull().default(0),
    // Nullable: the user hasn't yet entered the month-end portfolio value.
    // Broker CSV imports leave this null; the user backfills via the editor.
    value: real("value"),
    note: text("note").notNull().default(""),
  },
  (t) => ({
    yearMonthUnique: uniqueIndex("entries_portfolio_year_month_idx").on(
      t.portfolioId,
      t.year,
      t.month
    ),
  })
)

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetYear: integer("target_year").notNull(),
  color: text("color").notNull().default("#1E40AF"),
  kind: text("kind").notNull().default("annual_income"),
  scope: text("scope").notNull().default("combined"),
  portfolioId: integer("portfolio_id").references(() => portfolios.id, {
    onDelete: "cascade",
  }),
  target: real("target").notNull().default(0),
  swr: real("swr"),
  yieldAssumed: real("yield_assumed"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
})

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  inflation: real("inflation").notNull().default(2.4),
  conservativeReturn: real("conservative_return").notNull().default(4.0),
  optimisticReturn: real("optimistic_return").notNull().default(10.0),
  monthlySaving: real("monthly_saving").notNull().default(1250),
  horizonYears: integer("horizon_years").notNull().default(20),
  defaultEntryDay: text("default_entry_day").notNull().default("last"),
  defaultSwr: real("default_swr").notNull().default(4.0),
  dividendBasis: text("dividend_basis").notNull().default("net"),
  // BCP-47 tag (e.g. "en-US", "de-DE") that overrides the browser locale
  // for number formatting. NULL means "auto" — defer to navigator.language.
  locale: text("locale"),
})

export const holdings = sqliteTable("holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("etf"),
  isin: text("isin"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
})

// `dividend_events` is the legacy table name; rows store both dividends and
// interest payments, discriminated by `kind`. The DTO is `IncomeEventDTO`.
export const dividendEvents = sqliteTable("dividend_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holdingId: integer("holding_id").references(() => holdings.id, {
    onDelete: "cascade",
  }),
  portfolioId: integer("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  paidDate: text("paid_date").notNull(),
  amount: real("amount").notNull(),
  kind: text("kind").notNull().default("dividend"),
  tax: real("tax").notNull().default(0),
  sourceBroker: text("source_broker"),
  sourceTransactionId: text("source_transaction_id"),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
})

export type Portfolio = typeof portfolios.$inferSelect
export type NewPortfolio = typeof portfolios.$inferInsert
export type Entry = typeof entries.$inferSelect
export type NewEntry = typeof entries.$inferInsert
export type Goal = typeof goals.$inferSelect
export type NewGoal = typeof goals.$inferInsert
export type Settings = typeof settings.$inferSelect
export type Holding = typeof holdings.$inferSelect
export type NewHolding = typeof holdings.$inferInsert
export type IncomeEvent = typeof dividendEvents.$inferSelect
export type NewIncomeEvent = typeof dividendEvents.$inferInsert
