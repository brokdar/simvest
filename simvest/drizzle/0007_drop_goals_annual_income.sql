-- Backfill: ensure every income-kind goal has `target` populated before we
-- drop the legacy `annual_income` column. Earlier migrations relied on the
-- column as the source of truth for income goals.
UPDATE `goals`
SET `target` = `annual_income`
WHERE (`target` IS NULL OR `target` = 0)
  AND `annual_income` IS NOT NULL
  AND `annual_income` > 0;--> statement-breakpoint
ALTER TABLE `goals` DROP COLUMN `annual_income`;
