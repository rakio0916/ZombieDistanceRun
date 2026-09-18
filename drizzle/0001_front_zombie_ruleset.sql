ALTER TABLE `runs` ADD `ruleset_id` text NOT NULL DEFAULT 'zdr-canvas-legacy-2026-09-17';
--> statement-breakpoint
ALTER TABLE `runs` ADD `core_version` text NOT NULL DEFAULT '1.0.0';
--> statement-breakpoint
ALTER TABLE `runs` ADD `catalog_version` text NOT NULL DEFAULT 'canvas-hidden-lane-1';
--> statement-breakpoint
ALTER TABLE `best_scores` ADD `ruleset_id` text NOT NULL DEFAULT 'zdr-canvas-legacy-2026-09-17';
--> statement-breakpoint
DROP INDEX `ux_best_scores_player_day`;
--> statement-breakpoint
DROP INDEX `idx_best_scores_daily_rank`;
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_best_scores_player_day_ruleset` ON `best_scores` (`challenge_date`,`ruleset_id`,`player_id`);
--> statement-breakpoint
CREATE INDEX `idx_best_scores_daily_rank` ON `best_scores` (`challenge_date`,`ruleset_id`,`distance_cm`,`duration_ticks`,`achieved_at_ms`,`best_run_id`);
