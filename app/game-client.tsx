"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceGameState,
  createGameState,
  type Action,
  type GameEvent,
  type GameState,
  challengeDateInTokyo,
  hash32,
  seedForDate,
} from "@/lib/game-core";

type LeaderboardEntry = {
  rank: number;
  display_name: string;
  distance_m: number;
  time_limit_completed: boolean;
};

type OfficialRun = { run_id: string; seed: number; display_name: string };
type Phase = "ready" | "running" | "saving" | "ended";

export function GameClient({ signedIn }: { signedIn: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createGameState());
  const eventsRef = useRef<GameEvent[]>([]);
  const officialRunRef = useRef<OfficialRun | null>(null);
  const timerRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [game, setGame] = useState<GameState>(stateRef.current);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [notice, setNotice] = useState("今日の記録を競うにはサインインしてください。");
  const [alias, setAlias] = useState<string | null>(null);

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
    void loadLeaderboard();
  }, [loadLeaderboard]);

  const finish = useCallback(async (final: GameState) => {
    window.clearInterval(timerRef.current ?? undefined);
    timerRef.current = null;
    setPhase("saving");
    const official = officialRunRef.current;
    if (!official) {
      setNotice(`練習結果 ${formatMeters(final.distanceMm)}m。サインインすると今日の順位へ登録できます。`);
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
    setPhase("ended");
  }, [loadLeaderboard]);

  const recordAction = useCallback((action: Action) => {
    if (phase !== "running") return;
    const state = stateRef.current;
    const event: GameEvent = { seq: eventsRef.current.length, tick: state.tick, action };
    eventsRef.current = [...eventsRef.current, event];
  }, [phase]);

  const start = useCallback(async () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    let seed = seedForDate(challengeDateInTokyo());
    officialRunRef.current = null;
    setAlias(null);

    if (signedIn) {
      try {
        const response = await fetch("/api/v1/runs/start", { method: "POST" });
        const data = (await response.json()) as { run?: OfficialRun; error?: string };
        if (response.ok && data.run) {
          officialRunRef.current = data.run;
          seed = data.run.seed;
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
    stateRef.current = initial;
    eventsRef.current = [];
    setGame(initial);
    setPhase("running");
    timerRef.current = window.setInterval(() => {
      const current = stateRef.current;
      const events = eventsRef.current.filter((event) => event.tick === current.tick);
      const next = advanceGameState(current, seed, events);
      stateRef.current = next;
      setGame(next);
      if (next.terminalReason) void finish(next);
    }, 1000 / 30);
  }, [finish, signedIn]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawScene(canvas, game, phase);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [game, phase]);

  const crowdCount = 6 + 3 * Math.floor(game.distanceMm / 250_000);
  const gapPercent = Math.max(0, Math.min(100, (game.hordeGapMm / 36_000) * 100));

  return (
    <main className="zdr-shell">
      <section className="zdr-game" aria-label="ゾンビ逃走ゲーム">
        <div className="zdr-hud">
          <div><span>距離</span><strong>{formatMeters(game.distanceMm)}m</strong></div>
          <div><span>群れ</span><strong>{crowdCount}体</strong></div>
          <div className="zdr-gap"><span>安全距離</span><i><b style={{ width: `${gapPercent}%` }} /></i></div>
        </div>
        <canvas ref={canvasRef} className="zdr-canvas" aria-label="夕暮れの道路を走るゲーム画面" />
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
        <button className="zdr-start" type="button" onClick={() => void start()} disabled={phase === "running" || phase === "saving"}>
          {phase === "ready" ? (signedIn ? "ランク戦を開始" : "練習を開始") : "もう一度走る"}
        </button>
      </section>

      <aside className="zdr-panel">
        <p className="zdr-kicker">ZOMBIE DISTANCE RUN</p>
        <h1>走れ。<br />群れが増える前に。</h1>
        <p className="zdr-notice">{notice}</p>
        <dl className="zdr-rules">
          <div><dt>PC</dt><dd>A / D、← / →、Space、Shift</dd></div>
          <div><dt>スマホ</dt><dd>下の操作ボタンで走行</dd></div>
          <div><dt>人物3D</dt><dd>一般公開の同意記録後に切り替え</dd></div>
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

function drawScene(canvas: HTMLCanvasElement, game: GameState, phase: Phase): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  const w = rect.width; const h = rect.height;
  const horizon = h * 0.31;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#ef9374"); gradient.addColorStop(0.44, "#463b63"); gradient.addColorStop(1, "#111827");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f7c58c"; ctx.beginPath(); ctx.arc(w * 0.74, horizon * 0.74, Math.max(16, w * 0.045), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#161725"; ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = "#22283a"; ctx.beginPath(); ctx.moveTo(w * 0.42, horizon); ctx.lineTo(w * 0.58, horizon); ctx.lineTo(w * 0.94, h); ctx.lineTo(w * 0.06, h); ctx.closePath(); ctx.fill();
  const offset = (game.distanceMm / 1000) % 16;
  for (let index = 0; index < 12; index += 1) {
    const progress = ((index * 1.45 + offset / 10) % 18) / 18;
    const y = horizon + progress * progress * (h - horizon);
    const center = w / 2; const spread = 14 + progress * w * 0.43;
    ctx.strokeStyle = "rgba(255,224,176,.58)"; ctx.lineWidth = Math.max(1, progress * 6);
    ctx.beginPath(); ctx.moveTo(center - spread, y); ctx.lineTo(center + spread, y); ctx.stroke();
  }
  for (const lane of [1 / 3, 2 / 3]) {
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * (0.48 + (lane - 0.5) * 0.12), horizon); ctx.lineTo(w * (0.5 + (lane - 0.5) * 0.9), h); ctx.stroke();
  }
  const laneX = [w * 0.29, w * 0.5, w * 0.71][game.lane];
  const runnerY = h * 0.76 - (game.jumpUntilTick > game.tick ? 30 : 0);
  drawRunner(ctx, laneX, runnerY, Math.max(26, w * 0.05));
  const zombies = Math.min(18, 6 + 3 * Math.floor(game.distanceMm / 250_000));
  for (let index = 0; index < zombies; index += 1) {
    const random = hash32(game.tick + index * 723) / 0xffff_ffff;
    const x = w * (0.18 + random * 0.64); const y = horizon + (index % 5) * 13 + random * h * 0.15;
    drawZombie(ctx, x, y, 7 + (index % 3) * 2);
  }
  if (phase === "ended" || phase === "saving") {
    ctx.fillStyle = "rgba(7,9,18,.55)"; ctx.fillRect(0, 0, w, h);
  }
}

function drawRunner(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = "#f0b08a"; ctx.beginPath(); ctx.arc(x, y - size * 1.35, size * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e9eef6"; ctx.fillRect(x - size * 0.26, y - size, size * 0.52, size * 0.72);
  ctx.strokeStyle = "#e9eef6"; ctx.lineWidth = size * 0.14; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x - size * 0.14, y - size * 0.3); ctx.lineTo(x - size * 0.4, y + size * 0.2); ctx.moveTo(x + size * 0.14, y - size * 0.3); ctx.lineTo(x + size * 0.42, y + size * 0.2); ctx.moveTo(x - size * 0.14, y - size * 0.88); ctx.lineTo(x - size * 0.46, y - size * 0.58); ctx.moveTo(x + size * 0.14, y - size * 0.88); ctx.lineTo(x + size * 0.46, y - size * 0.58); ctx.stroke();
}

function drawZombie(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = "#7b8a72"; ctx.beginPath(); ctx.arc(x, y - size, size * 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#9eac96"; ctx.lineWidth = Math.max(1, size * 0.2); ctx.beginPath(); ctx.moveTo(x, y - size * 0.5); ctx.lineTo(x, y + size); ctx.moveTo(x - size * 0.65, y); ctx.lineTo(x + size * 0.65, y + size * 0.25); ctx.stroke();
}
