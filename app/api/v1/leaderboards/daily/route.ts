import { getD1 } from "@/db";
import { challengeDateInTokyo } from "@/lib/game-core";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const challengeDate = url.searchParams.get("challenge_date") ?? challengeDateInTokyo();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(challengeDate)) {
    return Response.json({ error: "INVALID_CHALLENGE_DATE" }, { status: 400 });
  }
  const rows = await getD1()
    .prepare(
      "SELECT p.display_name, b.distance_cm, b.duration_ticks, b.achieved_at_ms, r.terminal_reason FROM best_scores b JOIN players p ON p.player_id = b.player_id JOIN runs r ON r.run_id = b.best_run_id WHERE b.challenge_date = ? AND r.status = 'VERIFIED' ORDER BY b.distance_cm DESC, b.duration_ticks ASC, b.achieved_at_ms ASC, b.best_run_id ASC LIMIT 100",
    )
    .bind(challengeDate)
    .all<{ display_name: string; distance_cm: number; duration_ticks: number; achieved_at_ms: number; terminal_reason: string }>();
  return Response.json(
    {
      challenge_date: challengeDate,
      entries: rows.results.map((entry, index) => ({
        rank: index + 1,
        display_name: entry.display_name,
        distance_m: Number((entry.distance_cm / 100).toFixed(2)),
        time_limit_completed: entry.terminal_reason === "TIME_LIMIT",
        achieved_at: new Date(entry.achieved_at_ms).toISOString(),
      })),
    },
    { headers: { "Cache-Control": "public, max-age=15" } },
  );
}
