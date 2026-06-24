ALTER TABLE `goals` ADD `kind` text DEFAULT 'annual_income' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `scope` text DEFAULT 'combined' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `portfolio_id` integer REFERENCES portfolios(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `goals` ADD `target` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `swr` real;--> statement-breakpoint
ALTER TABLE `goals` ADD `yield_assumed` real;--> statement-breakpoint
UPDATE `goals` SET `target` = `annual_income`, `swr` = 4.0 WHERE `target` = 0 AND `kind` = 'annual_income';--> statement-breakpoint
ALTER TABLE `settings` ADD `default_swr` real DEFAULT 4.0 NOT NULL;
