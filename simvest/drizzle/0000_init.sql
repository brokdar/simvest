CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`invested` real DEFAULT 0 NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`dividends` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_portfolio_year_month_idx` ON `entries` (`portfolio_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`annual_income` real NOT NULL,
	`target_year` integer NOT NULL,
	`color` text DEFAULT '#1E40AF' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#1E40AF' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`inflation` real DEFAULT 2.4 NOT NULL,
	`conservative_return` real DEFAULT 4 NOT NULL,
	`optimistic_return` real DEFAULT 10 NOT NULL,
	`monthly_saving` real DEFAULT 1250 NOT NULL,
	`horizon_years` integer DEFAULT 20 NOT NULL
);
