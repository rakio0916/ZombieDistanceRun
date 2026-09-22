export const FIND_OWNED_RUN_STATUS =
  "SELECT r.status FROM runs r JOIN players p ON p.player_id = r.player_id WHERE r.run_id = ? AND p.auth_subject = ?";

export const REJECT_OWNED_RUNNING_RUN =
  "UPDATE runs SET status = 'REJECTED' WHERE run_id = ? AND status = 'RUNNING' AND player_id IN (SELECT player_id FROM players WHERE auth_subject = ?)";
