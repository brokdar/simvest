-- 0010_settings_locale.sql
--
-- Add a nullable `locale` column to the single-row `settings` table. The
-- value is a BCP-47 language tag (e.g. "en-US", "de-DE") that drives both
-- input parsing (decimal separator) and display formatting across the app.
--
-- NULL means "auto" — fall back to the browser's `navigator.language` at
-- the client. Existing installs upgrade with NULL and behave as before
-- (auto-detected) until the user picks an explicit locale in Settings.

ALTER TABLE `settings` ADD `locale` text;
