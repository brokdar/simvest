-- 0008_broker_import.sql
--
-- Broker transaction import: holdings gain ISIN (and lose ticker — we now key
-- holdings on name + ISIN). dividend_events expands to cover both dividends
-- and interest payments via a `kind` discriminator, gains gross/tax separation
-- and source-broker provenance for idempotent re-imports. Settings gain a
-- net/gross display preference.
--
-- SQLite cannot ALTER a column's nullability or drop NOT NULL in place — we
-- recreate the affected tables.

-- ── holdings: drop `ticker`, add `isin` ─────────────────────────────────────
CREATE TABLE `holdings_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'etf' NOT NULL,
	`isin` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `holdings_new` (`id`, `portfolio_id`, `name`, `type`, `isin`, `created_at`)
SELECT `id`, `portfolio_id`, `name`, `type`, NULL, `created_at` FROM `holdings`;--> statement-breakpoint
DROP TABLE `holdings`;--> statement-breakpoint
ALTER TABLE `holdings_new` RENAME TO `holdings`;--> statement-breakpoint
CREATE INDEX `holdings_portfolio_idx` ON `holdings` (`portfolio_id`);--> statement-breakpoint
CREATE INDEX `holdings_portfolio_isin_idx` ON `holdings` (`portfolio_id`, `isin`);--> statement-breakpoint

-- ── dividend_events: nullable holding_id; new kind/tax/source fields ───────
CREATE TABLE `dividend_events_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer,
	`portfolio_id` integer NOT NULL,
	`paid_date` text NOT NULL,
	`amount` real NOT NULL,
	`kind` text DEFAULT 'dividend' NOT NULL,
	`tax` real DEFAULT 0 NOT NULL,
	`source_broker` text,
	`source_transaction_id` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `dividend_events_new` (`id`, `holding_id`, `portfolio_id`, `paid_date`, `amount`, `kind`, `tax`, `source_broker`, `source_transaction_id`, `note`, `created_at`)
SELECT `id`, `holding_id`, `portfolio_id`, `paid_date`, `amount`, 'dividend', 0, NULL, NULL, `note`, `created_at` FROM `dividend_events`;--> statement-breakpoint
DROP TABLE `dividend_events`;--> statement-breakpoint
ALTER TABLE `dividend_events_new` RENAME TO `dividend_events`;--> statement-breakpoint
CREATE INDEX `dividend_events_portfolio_date_idx` ON `dividend_events` (`portfolio_id`,`paid_date`);--> statement-breakpoint
CREATE INDEX `dividend_events_holding_idx` ON `dividend_events` (`holding_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `dividend_events_source_idx` ON `dividend_events` (`source_broker`, `source_transaction_id`) WHERE `source_broker` IS NOT NULL AND `source_transaction_id` IS NOT NULL;--> statement-breakpoint

-- ── settings: dividend display basis ───────────────────────────────────────
ALTER TABLE `settings` ADD COLUMN `dividend_basis` text DEFAULT 'net' NOT NULL;
