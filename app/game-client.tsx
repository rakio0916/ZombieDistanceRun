"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameScene } from "./game-scene";
import {
  advanceGameState,
  createGameState,
  type Action,
  type GameEvent,
  type GameState,
  challengeDateInTokyo,
  RULESET_ID,
  seedForDate,
} from "@/lib/game-core";

type LeaderboardEntry = {
  rank: number;
  display_name: string;
  distance_m: number;
  time_limit_completed: boolean;
};

type OfficialRun = { run_id: string; seed: number; display_name: string; ruleset_id: string };
type Phase = "ready" | "running" | "saving" | "ended";
type CharacterStatus = "loading" | "ready" | "error";

export function GameClient({ signedIn }: { signedIn: boolean }) {
  const stateRef = useRef<GameState>(createGameState());
  const eventsRef = useRef<GameEvent[]>([]);
  const officialRunRef = useRef<OfficialRun | null>(null);
  const timerRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const phaseRef = useRef<Phase>("ready");
  const [game, setGame] = useState<GameState>(() => createGameState());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [notice, setNotice] = useState("左右に避け、低いバリアだけをジャンプ。捕まるまでの距離を競います。");
  const [alias, setAlias] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => seedForDate(challengeDateInTokyo()));
  const [characterStatus, setCharacterStatus] = useState<CharacterStatus>("loading");
  const onCharacterStatus = useCallback((status: CharacterStatus) => setCharacterStatus(status), []);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/leaderboards/daily", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { entries: LeaderboardEntry[] };
      setLeaderboard(data.entries);
    } catch {
      // The play surface remains available if the ranking service is unavailable.
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadLeaderboard(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadLeaderboard]);

  const finish = useCallback(async (final: GameState) => {
    window.clearInterval(timerRef.current ?? undefined);
    timerRef.current = null;
    phaseRef.current = "saving";
    setPhase("saving");
    const official = officialRunRef.current;
    if (!official) {
      setNotice(`練習結果 ${formatMeters(final.distanceMm)}m。サインインすると今日の順位へ登録できます。`);
      phaseRef.current = "ended";
      setPhase("ended");
      return;
    }
    try {
      const response = await fetch(`/api/v1/runs/${official.run_id}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: "1.0.0",
          submission_id: crypto.randomUUID(),
          final_tick: final.tick,
          terminal_reason: final.terminalReason,
          events: eventsRef.current,
        }),
      });
      const data = (await response.json()) as { run?: { distance_m: number; time_limit_completed: boolean }; was_personal_best?: boolean; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "SAVE_FAILED");
      setNotice(
        data.run.time_limit_completed
          ? `30:00完走！ ${data.run.distance_m}mを記録しました。`
          : `${data.run.distance_m}mを検証済み記録として登録しました${data.was_personal_best ? "。自己ベストです！" : "。"}`,
      );
      void loadLeaderboard();
    } catch {
      setNotice(`結果は ${formatMeters(final.distanceMm)}m。記録サービスへ送れなかったためランキングには登録していません。`);
    }
    phaseRef.current = "ended";
    setPhase("ended");
  }, [loadLeaderboard]);

  const recordAction = useCallback((action: Action) => {
    if (phaseRef.current !== "running") return;
    const state = stateRef.current;
    const event: GameEvent = { seq: eventsRef.current.length, tick: state.tick, action };
    eventsRef.current = [...eventsRef.current, event];
  }, []);

  const start = useCallback(async () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (characterStatus !== "ready") {
      setNotice("人物3Dを読み込めないため開始できません。通信を確認して再読み込みしてください。");
      return;
    }
    let runSeed = seedForDate(challengeDateInTokyo());
    officialRunRef.current = null;
    setAlias(null);

    if (signedIn) {
      try {
        const response = await fetch("/api/v1/runs/start", { method: "POST" });
        const data = (await response.json()) as { run?: OfficialRun; error?: string };
        if (response.ok && data.run) {
          officialRunRef.current = data.run;
          runSeed = data.run.seed;
          setAlias(data.run.display_name);
          setNotice("ランク戦を開始。距離はサーバー側で再生して確定します。");
        } else {
          setNotice("ランク戦を開始できないため、今回は練習として開始します。");
        }
      } catch {
        setNotice("記録サービスに接続できないため、今回は練習として開始します。");
      }
    } else {
      setNotice("練習中。サインインすると今日のランキングに挑戦できます。");
    }

    const initial = createGameState();
    setSeed(runSeed);
    stateRef.current = initial;
    eventsRef.current = [];
    setGame(initial);
    phaseRef.current = "running";
    setPhase("running");
    timerRef.current = window.setInterval(() => {
      const current = stateRef.current;
      const events = eventsRef.current.filter((event) => event.tick === current.tick);
      const next = advanceGameState(current, runSeed, events);
      stateRef.current = next;
      setGame(next);
      if (next.terminalReason) void finish(next);
    }, 1000 / 30);
  }, [characterStatus, finish, signedIn]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") recordAction("LANE_LEFT");
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") recordAction("LANE_RIGHT");
      if (event.key === "ArrowUp" || event.key === " ") recordAction("JUMP");
      if (event.key === "Shift") recordAction("SPRINT_ON");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") recordAction("SPRINT_OFF");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.clearInterval(timerRef.current ?? undefined);
    };
  }, [recordAction]);

  const crowdCount = 6 + 3 * Math.floor(game.distanceMm / 250_000);
  const gapPercent = Math.max(0, Math.min(100, (game.hordeGapMm / 12_000) * 100));

  return (
    <main className="zdr-shell">
      <section className="zdr-game" aria-label="ゾンビ逃走ゲーム">
        <div className="zdr-scene-title" aria-hidden="true"><b>ZOMBIE</b><span>DISTANCE RUN</span></div>
        <div className="zdr-hud">
          <div><span>距離</span><strong>{formatMeters(game.distanceMm)}m</strong></div>
          <div><span>群れ</span><strong>{crowdCount}体</strong></div>
          <div className="zdr-stamina"><span>スタミナ</span><i><b style={{ width: `${game.stamina}%` }} /></i></div>
          <div className="zdr-gap"><span>安全距離</span><i><b style={{ width: `${gapPercent}%` }} /></i></div>
        </div>
        <GameScene game={game} seed={seed} phase={phase} onCharacterStatus={onCharacterStatus} onAction={recordAction} />
        {characterStatus !== "ready" && (
          <div className="zdr-load-state" role="status">
            {characterStatus === "loading" ? "人物3Dと街を読み込み中…" : "人物3Dを読み込めませんでした。ページを再読み込みしてください。"}
          </div>
        )}
        {game.terminalReason === "CAUGHT" && <div className="zdr-caught" aria-hidden="true">CAUGHT</div>}
        <div className="zdr-game-status" aria-live="polite">
          {phase === "ready" && "走り出す準備はできています。"}
          {phase === "running" && (alias ? `${alias}としてランク戦中` : "練習中")}
          {phase === "saving" && "記録を検証しています…"}
          {phase === "ended" && "走行終了"}
        </div>
        <div className="zdr-controls" aria-label="ゲーム操作">
          <button type="button" onPointerDown={() => recordAction("LANE_LEFT")} aria-label="左へ移動">←</button>
          <button type="button" onPointerDown={() => recordAction("JUMP")} aria-label="ジャンプ">跳</button>
          <button type="button" onPointerDown={() => recordAction("LANE_RIGHT")} aria-label="右へ移動">→</button>
          <button type="button" onPointerDown={() => recordAction("SPRINT_ON")} onPointerUp={() => recordAction("SPRINT_OFF")} onPointerCancel={() => recordAction("SPRINT_OFF")} aria-label="スプリント">走</button>
        </div>
        <button className="zdr-start" type="button" onClick={() => void start()} disabled={phase === "running" || phase === "saving" || characterStatus !== "ready"}>
          {characterStatus === "loading" ? "読み込み中" : characterStatus === "error" ? "読込エラー" : phase === "ready" ? (signedIn ? "ランク戦を開始" : "練習を開始") : "もう一度走る"}
        </button>
      </section>

      <aside className="zdr-panel">
        <p className="zdr-kicker">ZOMBIE DISTANCE RUN</p>
        <h1>走れ。<br />群れが増える前に。</h1>
        <p className="zdr-notice">{notice}</p>
        <dl className="zdr-rules">
          <div><dt>PC</dt><dd>A / D、← / →、Space、Shift</dd></div>
          <div><dt>スマホ</dt><dd>下の操作ボタンで走行</dd></div>
          <div><dt>人物3D</dt><dd>{characterStatus === "ready" ? "公開版v3・5アニメーション" : characterStatus === "loading" ? "読み込み中" : "読み込みエラー"}</dd></div>
          <div><dt>ルール</dt><dd>{RULESET_ID}／射撃なし・前方を横回避</dd></div>
        </dl>
        <div className="zdr-board">
          <div className="zdr-board-title"><h2>今日のランキング</h2><button type="button" onClick={() => void loadLeaderboard()}>更新</button></div>
          {leaderboard.length === 0 ? <p>まだ記録がありません。最初の逃走者になろう。</p> : (
            <ol>
              {leaderboard.map((entry) => <li key={`${entry.rank}-${entry.display_name}`}><span>{entry.rank}</span><b>{entry.display_name}</b><em>{entry.distance_m}m {entry.time_limit_completed ? "完走" : ""}</em></li>)}
            </ol>
          )}
        </div>
      </aside>
    </main>
  );
}

function formatMeters(distanceMm: number): string {
  return (distanceMm / 1000).toFixed(1);
}
