CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'etf' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `holdings_portfolio_idx` ON `holdings` (`portfolio_id`);
--> statement-breakpoint
CREATE TABLE `dividend_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`portfolio_id` integer NOT NULL,
	`paid_date` text NOT NULL,
	`amount` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dividend_events_portfolio_date_idx` ON `dividend_events` (`portfolio_id`,`paid_date`);
--> statement-breakpoint
CREATE INDEX `dividend_events_holding_idx` ON `dividend_events` (`holding_id`);
