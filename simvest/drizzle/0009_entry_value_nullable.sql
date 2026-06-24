-- 0009_entry_value_nullable.sql
--
-- Make `entries.value` nullable. Month-end portfolio value is user-entered
-- and not always known: broker CSV imports give us deposits but no value, so
-- the row must be insertable without one. NULL means "not yet recorded";
-- consumers (KPIs, chart line, goal eval) treat it as missing data.
--
-- SQLite cannot DROP NOT NULL in place — we recreate the table.

CREATE TABLE `entries_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`day` integer DEFAULT 0 NOT NULL,
	`invested` real DEFAULT 0 NOT NULL,
	`value` real,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `entries_new` (`id`, `portfolio_id`, `year`, `month`, `day`, `invested`, `value`, `note`)
SELECT `id`, `portfolio_id`, `year`, `month`, `day`, `invested`, `value`, `note` FROM `entries`;--> statement-breakpoint
DROP TABLE `entries`;--> statement-breakpoint
ALTER TABLE `entries_new` RENAME TO `entries`;--> statement-breakpoint
CREATE UNIQUE INDEX `entries_portfolio_year_month_idx` ON `entries` (`portfolio_id`,`year`,`month`);
