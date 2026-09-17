import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const players = sqliteTable(
  "players",
  {
    playerId: text("player_id").primaryKey(),
    authSubject: text("auth_subject").notNull(),
    displayName: text("display_name").notNull(),
    createdAtMs: integer("created_at_ms").notNull(),
    lastActiveAtMs: integer("last_active_at_ms").notNull(),
  },
  (table) => [
    uniqueIndex("ux_players_auth_subject").on(table.authSubject),
    uniqueIndex("ux_players_display_name").on(table.displayName),
    index("idx_players_last_active").on(table.lastActiveAtMs),
  ],
);

export const runs = sqliteTable(
  "runs",
  {
    runId: text("run_id").primaryKey(),
    playerId: text("player_id").notNull().references(() => players.playerId, { onDelete: "cascade" }),
    challengeDate: text("challenge_date").notNull(),
    seed: integer("seed").notNull(),
    status: text("status").notNull(),
    issuedAtMs: integer("issued_at_ms").notNull(),
    startedAtMs: integer("started_at_ms").notNull(),
    finishedAtMs: integer("finished_at_ms"),
    durationTicks: integer("duration_ticks"),
    distanceCm: integer("distance_cm"),
    terminalReason: text("terminal_reason"),
    inputSha256: text("input_sha256"),
  },
  (table) => [
    index("idx_runs_player_status").on(table.playerId, table.status),
    index("idx_runs_challenge_status").on(table.challengeDate, table.status),
  ],
);

export const bestScores = sqliteTable(
  "best_scores",
  {
    challengeDate: text("challenge_date").notNull(),
    playerId: text("player_id").notNull().references(() => players.playerId, { onDelete: "cascade" }),
    bestRunId: text("best_run_id").notNull().references(() => runs.runId, { onDelete: "cascade" }),
    distanceCm: integer("distance_cm").notNull(),
    durationTicks: integer("duration_ticks").notNull(),
    achievedAtMs: integer("achieved_at_ms").notNull(),
  },
  (table) => [
    uniqueIndex("ux_best_scores_player_day").on(table.challengeDate, table.playerId),
    uniqueIndex("ux_best_scores_run").on(table.bestRunId),
    index("idx_best_scores_daily_rank").on(
      table.challengeDate,
      table.distanceCm,
      table.durationTicks,
      table.achievedAtMs,
      table.bestRunId,
    ),
  ],
);
