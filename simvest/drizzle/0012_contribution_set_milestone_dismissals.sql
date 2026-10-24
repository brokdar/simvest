-- 0012_contribution_set_milestone_dismissals.sql
--
-- R2: add `portfolios.contribution_set` so "never set" is distinguishable from
-- a deliberate EUR 0 monthly contribution. Every existing row was created by
-- the user, so they are all marked as set.
--
-- R4: add `milestone_dismissals` so dismissed milestones follow the user
-- across browsers instead of living in localStorage.
--
-- Additive only (ALTER ... ADD COLUMN + CREATE TABLE). `portfolios` is the
-- ON DELETE CASCADE parent of entries/holdings/dividend_events and must never
-- be rebuilt.

ALTER TABLE `portfolios` ADD `contribution_set` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `portfolios` SET `contribution_set` = 1;
--> statement-breakpoint
CREATE TABLE `milestone_dismissals` (
	`id` text PRIMARY KEY NOT NULL,
	`dismissed_at` integer NOT NULL
);
