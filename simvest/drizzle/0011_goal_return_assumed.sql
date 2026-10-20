-- 0011_goal_return_assumed.sql
--
-- Add a nullable `return_assumed` column to `goals`: a per-goal override of
-- the expected annual return % used for the goal's projection (N3). NULL
-- means "use the scope's own historical return", which is exactly how every
-- existing goal behaves today, so the upgrade changes nothing until the user
-- sets an override on the Planning page. Additive; no data is touched.

ALTER TABLE `goals` ADD `return_assumed` real;
