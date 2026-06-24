ALTER TABLE `entries` ADD `day` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `entries` SET `day` = CASE
  WHEN `month` IN (1, 3, 5, 7, 8, 10, 12) THEN 31
  WHEN `month` IN (4, 6, 9, 11) THEN 30
  WHEN `month` = 2 AND ((`year` % 4 = 0 AND `year` % 100 <> 0) OR (`year` % 400 = 0)) THEN 29
  WHEN `month` = 2 THEN 28
END;
--> statement-breakpoint
ALTER TABLE `settings` ADD `default_entry_day` text DEFAULT 'last' NOT NULL;
