"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameScene } from "./game-scene";
import {
  advanceContinuousGameState,
  createGameState,
  type ContinuousInput,
  type GameState,
  challengeDateInTokyo,
  CONTINUOUS_MOVE_PER_TICK_MM,
  ROAD_HALF_WIDTH_MM,
  RULESET_ID,
  seedForDate,
} from "@/lib/game-core";
import { encodeContinuousInputs } from "@/lib/game-api";
import { CHARACTERS, CHARACTER_IDS, isCharacterId, type CharacterId } from "./characters";

type LeaderboardEntry = {
  rank: number;
  display_name: string;
  distance_m: number;
  time_limit_completed: boolean;
};

type OfficialRun = { run_id: string; seed: number; display_name: string; ruleset_id: string };
type Phase = "ready" | "starting" | "running" | "saving" | "ended";
type CharacterStatus = "loading" | "ready" | "error";

export function GameClient({ signedIn }: { signedIn: boolean }) {
  const stateRef = useRef<GameState>(createGameState());
  const inputsRef = useRef<ContinuousInput[]>([]);
  const targetXRef = useRef(0);
  const jumpQueuedRef = useRef(false);
  const sprintRef = useRef(false);
  const keyboardDirectionRef = useRef<-1 | 0 | 1>(0);
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
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>("runner_001");
  const selectedCharacter = CHARACTERS[selectedCharacterId];
  const onCharacterStatus = useCallback((characterId: CharacterId, status: CharacterStatus) => {
    setCharacterStatus((current) => characterId === selectedCharacterId ? status : current);
  }, [selectedCharacterId]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    const saved = window.localStorage.getItem("zdr-selected-character");
    if (isCharacterId(saved) && CHARACTERS[saved].available) {
      queueMicrotask(() => setSelectedCharacterId(saved));
    }
  }, []);
  useEffect(() => {
    if (selectedCharacter.available) window.localStorage.setItem("zdr-selected-character", selectedCharacter.id);
  }, [selectedCharacter]);

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
          schema_version: "2.0.0",
          submission_id: crypto.randomUUID(),
          final_tick: final.tick,
          terminal_reason: final.terminalReason,
          input_b64: encodeContinuousInputs(inputsRef.current),
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

  const queueJump = useCallback(() => {
    if (phaseRef.current !== "running") return;
    jumpQueuedRef.current = true;
  }, []);

  const setTargetX = useCallback((targetXmm: number) => {
    if (phaseRef.current !== "running") return;
    targetXRef.current = Math.max(-ROAD_HALF_WIDTH_MM, Math.min(ROAD_HALF_WIDTH_MM, Math.round(targetXmm / 10) * 10));
  }, []);

  const start = useCallback(async () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "ended") return;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (characterStatus !== "ready") {
      setNotice("人物3Dを読み込めないため開始できません。通信を確認して再読み込みしてください。");
      return;
    }
    phaseRef.current = "starting";
    setPhase("starting");
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
    inputsRef.current = [];
    targetXRef.current = 0;
    jumpQueuedRef.current = false;
    sprintRef.current = false;
    keyboardDirectionRef.current = 0;
    setGame(initial);
    phaseRef.current = "running";
    setPhase("running");
    timerRef.current = window.setInterval(() => {
      const current = stateRef.current;
      if (keyboardDirectionRef.current !== 0) {
        targetXRef.current = Math.max(-ROAD_HALF_WIDTH_MM, Math.min(ROAD_HALF_WIDTH_MM, targetXRef.current + keyboardDirectionRef.current * CONTINUOUS_MOVE_PER_TICK_MM));
      }
      const input: ContinuousInput = { targetXmm: targetXRef.current, jump: jumpQueuedRef.current, sprint: sprintRef.current };
      jumpQueuedRef.current = false;
      inputsRef.current.push(input);
      const next = advanceContinuousGameState(current, runSeed, input);
      stateRef.current = next;
      setGame(next);
      if (next.terminalReason) void finish(next);
    }, 1000 / 30);
  }, [characterStatus, finish, signedIn]);

  const selectCharacter = useCallback((characterId: CharacterId) => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "ended") return;
    const character = CHARACTERS[characterId];
    if (!character.available || characterId === selectedCharacterId) return;
    setCharacterStatus("loading");
    setSelectedCharacterId(characterId);
    setNotice(`${character.label}を読み込んでいます…`);
  }, [selectedCharacterId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keyboardDirectionRef.current = -1;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keyboardDirectionRef.current = 1;
      if (!event.repeat && (event.key === "ArrowUp" || event.key === " ")) queueJump();
      if (event.key === "Shift") sprintRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if ((event.key === "ArrowLeft" || event.key.toLowerCase() === "a") && keyboardDirectionRef.current === -1) keyboardDirectionRef.current = 0;
      if ((event.key === "ArrowRight" || event.key.toLowerCase() === "d") && keyboardDirectionRef.current === 1) keyboardDirectionRef.current = 0;
      if (event.key === "Shift") sprintRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.clearInterval(timerRef.current ?? undefined);
    };
  }, [queueJump]);

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
        <GameScene game={game} seed={seed} phase={phase} character={selectedCharacter} onCharacterStatus={onCharacterStatus} onTargetX={setTargetX} />
        {characterStatus !== "ready" && (
          <div className="zdr-load-state" role="status">
            {characterStatus === "loading" ? `${selectedCharacter.label}の人物3Dと街を読み込み中…` : `${selectedCharacter.label}の人物3Dを読み込めませんでした。別の人物を選ぶか、再読み込みしてください。`}
          </div>
        )}
        {game.terminalReason === "CAUGHT" && <div className="zdr-caught" aria-hidden="true">CAUGHT</div>}
        <div className="zdr-game-status" aria-live="polite">
          {phase === "ready" && "走り出す準備はできています。"}
          {phase === "starting" && "走行を開始しています…"}
          {phase === "running" && (alias ? `${alias}としてランク戦中` : "練習中")}
          {phase === "saving" && "記録を検証しています…"}
          {phase === "ended" && "走行終了"}
        </div>
        <div className="zdr-controls" aria-label="ゲーム操作">
          <button type="button" onPointerDown={() => { keyboardDirectionRef.current = -1; }} onPointerUp={() => { keyboardDirectionRef.current = 0; }} onPointerCancel={() => { keyboardDirectionRef.current = 0; }} aria-label="左へ移動">←</button>
          <button type="button" onPointerDown={queueJump} aria-label="ジャンプ">跳</button>
          <button type="button" onPointerDown={() => { keyboardDirectionRef.current = 1; }} onPointerUp={() => { keyboardDirectionRef.current = 0; }} onPointerCancel={() => { keyboardDirectionRef.current = 0; }} aria-label="右へ移動">→</button>
          <button type="button" onPointerDown={() => { sprintRef.current = true; }} onPointerUp={() => { sprintRef.current = false; }} onPointerCancel={() => { sprintRef.current = false; }} aria-label="スプリント">走</button>
        </div>
        <button className="zdr-start" type="button" onClick={() => void start()} disabled={phase === "starting" || phase === "running" || phase === "saving" || characterStatus !== "ready"}>
          {characterStatus === "loading" ? "読み込み中" : characterStatus === "error" ? "読込エラー" : phase === "starting" ? "開始中" : phase === "ready" ? (signedIn ? "ランク戦を開始" : "練習を開始") : "もう一度走る"}
        </button>
      </section>

      <aside className="zdr-panel">
        <p className="zdr-kicker">ZOMBIE DISTANCE RUN</p>
        <h1>走れ。<br />群れが増える前に。</h1>
        <p className="zdr-notice">{notice}</p>
        <section className="zdr-character-select" aria-labelledby="character-select-title">
          <h2 id="character-select-title">キャラクター</h2>
          <div role="group" aria-label="主人公を選ぶ">
            {CHARACTER_IDS.map((characterId) => {
              const character = CHARACTERS[characterId];
              const selected = character.id === selectedCharacterId;
              const locked = phase === "starting" || phase === "running" || phase === "saving";
              return <button key={character.id} type="button" className={selected ? "is-selected" : ""} aria-pressed={selected} disabled={!character.available || locked} onClick={() => selectCharacter(character.id)}>
                <b>{character.label}</b><span>{character.description}</span>
              </button>;
            })}
          </div>
          <p>{phase === "starting" || phase === "running" || phase === "saving" ? "走行中はキャラクターを変更できません。" : selectedCharacter.available ? `${selectedCharacter.label}を選択中` : "女性はモデル完成後に選べます。"}</p>
        </section>
        <dl className="zdr-rules">
          <div><dt>PC</dt><dd>A / D、← / →、Space、Shift</dd></div>
          <div><dt>スマホ</dt><dd>画面を指で左右に動かす／跳ボタン</dd></div>
          <div><dt>人物3D</dt><dd>{characterStatus === "ready" ? selectedCharacter.releaseLabel : characterStatus === "loading" ? `${selectedCharacter.label}を読み込み中` : `${selectedCharacter.label}の読み込みエラー`}</dd></div>
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
