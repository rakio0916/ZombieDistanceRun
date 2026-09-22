import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { FIND_OWNED_RUN_STATUS, REJECT_OWNED_RUNNING_RUN } from "../lib/ranked-recovery.ts";

test("an abandoned ranked run belongs to its signed-in owner and cannot overwrite a finished score", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE players (player_id TEXT PRIMARY KEY, auth_subject TEXT NOT NULL)");
    db.exec("CREATE TABLE runs (run_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, status TEXT NOT NULL)");
    db.prepare("INSERT INTO players VALUES (?, ?)").run("player-a", "account-a");
    db.prepare("INSERT INTO players VALUES (?, ?)").run("player-b", "account-b");
    for (const row of [["active-a", "player-a", "RUNNING"], ["finished-a", "player-a", "VERIFIED"], ["active-b", "player-b", "RUNNING"]]) {
      db.prepare("INSERT INTO runs VALUES (?, ?, ?)").run(...row);
    }

    assert.equal(db.prepare(FIND_OWNED_RUN_STATUS).get("active-a", "account-b"), undefined);
    assert.equal(db.prepare(REJECT_OWNED_RUNNING_RUN).run("active-a", "account-b").changes, 0);
    assert.equal(db.prepare(REJECT_OWNED_RUNNING_RUN).run("finished-a", "account-a").changes, 0);
    assert.equal(db.prepare(REJECT_OWNED_RUNNING_RUN).run("active-a", "account-a").changes, 1);
    assert.equal(db.prepare(REJECT_OWNED_RUNNING_RUN).run("active-a", "account-a").changes, 0);
    const rows = db.prepare("SELECT run_id, status FROM runs ORDER BY run_id").all().map((row) => ({ run_id: row.run_id, status: row.status }));
    assert.deepEqual(rows, [
      { run_id: "active-a", status: "REJECTED" },
      { run_id: "active-b", status: "RUNNING" },
      { run_id: "finished-a", status: "VERIFIED" },
    ]);
  } finally {
    db.close();
  }
});
