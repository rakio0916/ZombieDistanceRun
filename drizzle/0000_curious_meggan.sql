CREATE TABLE `best_scores` (
	`challenge_date` text NOT NULL,
	`player_id` text NOT NULL,
	`best_run_id` text NOT NULL,
	`distance_cm` integer NOT NULL,
	`duration_ticks` integer NOT NULL,
	`achieved_at_ms` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`best_run_id`) REFERENCES `runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_best_scores_player_day` ON `best_scores` (`challenge_date`,`player_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_best_scores_run` ON `best_scores` (`best_run_id`);--> statement-breakpoint
CREATE INDEX `idx_best_scores_daily_rank` ON `best_scores` (`challenge_date`,`distance_cm`,`duration_ticks`,`achieved_at_ms`,`best_run_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`player_id` text PRIMARY KEY NOT NULL,
	`auth_subject` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	`last_active_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_players_auth_subject` ON `players` (`auth_subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_players_display_name` ON `players` (`display_name`);--> statement-breakpoint
CREATE INDEX `idx_players_last_active` ON `players` (`last_active_at_ms`);--> statement-breakpoint
CREATE TABLE `runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`challenge_date` text NOT NULL,
	`seed` integer NOT NULL,
	`status` text NOT NULL,
	`issued_at_ms` integer NOT NULL,
	`started_at_ms` integer NOT NULL,
	`finished_at_ms` integer,
	`duration_ticks` integer,
	`distance_cm` integer,
	`terminal_reason` text,
	`input_sha256` text,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_runs_player_status` ON `runs` (`player_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_runs_challenge_status` ON `runs` (`challenge_date`,`status`);