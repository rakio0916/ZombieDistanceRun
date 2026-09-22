"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameScene } from "./game-scene";
import { GameOverVideo } from "./game-over-video";
import {
  advanceDifficultyGameState,
  challengeDateInTokyo,
  CONTINUOUS_MOVE_PER_TICK_MM,
  createDifficultyGameState,
  DIFFICULTY_RULESET_IDS,
  isDifficulty,
  ROAD_HALF_WIDTH_MM,
  seedForDate,
  type Difficulty,
  type DifficultyInput,
  type GameState,
} from "@/lib/game-core";
import { encodeDifficultyInputs } from "@/lib/game-api";
import { CHARACTERS, CHARACTER_IDS, isCharacterId, type CharacterId } from "./characters";

type LeaderboardEntry = { rank: number; display_name: string; distance_m: number; time_limit_completed: boolean };
type LeaderboardStatus = "loading" | "ready" | "error";
type OfficialRun = { run_id: string; seed: number; display_name: string; difficulty: Difficulty; ruleset_id: string; input_schema_version: "4.0.0" };
type Phase = "ready" | "starting" | "running" | "saving" | "ended";
type CharacterStatus = "loading" | "ready" | "error";

const DIFFICULTIES: Record<Difficulty, { label: string }> = {
  beginner: { label: "初級" },
  intermediate: { label: "中級" },
  advanced: { label: "上級" },
};
const DIFFICULTY_IDS = Object.keys(DIFFICULTIES) as Difficulty[];

export function GameClient({ signedIn }: { signedIn: boolean }) {
  const stateRef = useRef<GameState>(createDifficultyGameState());
  const inputsRef = useRef<DifficultyInput[]>([]);
  const targetXRef = useRef(0);
  const jumpQueuedRef = useRef(false);
  const keyboardDirectionRef = useRef<-1 | 0 | 1>(0);
  const officialRunRef = useRef<OfficialRun | null>(null);
  const runDifficultyRef = useRef<Difficulty>("beginner");
  const runCharacterRef = useRef<CharacterId>("runner_001");
  const timerRef = useRef<number | null>(null);
  const savePendingRef = useRef(false);
  const abandonPendingRef = useRef(false);
  const gameOverVideoRef = useRef(false);
  const finishSubmissionRef = useRef<{ run: OfficialRun; body: string; difficulty: Difficulty; distanceMm: number } | null>(null);
  const setupHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const leaderboardRequestRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const phaseRef = useRef<Phase>("ready");
  const [game, setGame] = useState<GameState>(() => createDifficultyGameState());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardStatus, setLeaderboardStatus] = useState<LeaderboardStatus>("loading");
  const [notice, setNotice] = useState("主人公とレベルを選んで開始してください。");
  const [startError, setStartError] = useState<string | null>(null);
  const [blockedRunId, setBlockedRunId] = useState<string | null>(null);
  const [abandonPending, setAbandonPending] = useState(false);
  const [alias, setAlias] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => seedForDate(challengeDateInTokyo()));
  const [characterStatus, setCharacterStatus] = useState<CharacterStatus>("loading");
  const [zombieStatus, setZombieStatus] = useState<CharacterStatus>("loading");
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>("runner_001");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("beginner");
  const [runDifficulty, setRunDifficulty] = useState<Difficulty>("beginner");
  const [runCharacterId, setRunCharacterId] = useState<CharacterId>("runner_001");
  const [setupOpen, setSetupOpen] = useState(true);
  const [showGameOverVideo, setShowGameOverVideo] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "failed">("idle");
  const [hydrated, setHydrated] = useState(false);
  const selectedCharacter = CHARACTERS[selectedCharacterId];
  const activeRunCharacter = CHARACTERS[runCharacterId];
  const isActive = phase === "starting" || phase === "running" || phase === "saving";
  const showSetup = setupOpen && (phase === "ready" || phase === "ended");
  const isResult = phase === "ended" && !setupOpen;

  const onCharacterStatus = useCallback((characterId: CharacterId, status: CharacterStatus) => {
    setCharacterStatus((current) => characterId === selectedCharacterId ? status : current);
  }, [selectedCharacterId]);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setupHeadingRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const savedCharacter = window.localStorage.getItem("zdr-selected-character");
      const savedDifficulty = window.localStorage.getItem("zdr-selected-difficulty");
      if (isCharacterId(savedCharacter) && CHARACTERS[savedCharacter].available) setSelectedCharacterId(savedCharacter);
      if (isDifficulty(savedDifficulty)) setSelectedDifficulty(savedDifficulty);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (hydrated && selectedCharacter.available) window.localStorage.setItem("zdr-selected-character", selectedCharacter.id);
  }, [hydrated, selectedCharacter]);
  useEffect(() => {
    if (hydrated) window.localStorage.setItem("zdr-selected-difficulty", selectedDifficulty);
  }, [hydrated, selectedDifficulty]);

  const loadLeaderboard = useCallback(async (difficulty: Difficulty) => {
    const requestId = ++leaderboardRequestRef.current;
    setLeaderboardStatus("loading");
    setLeaderboard([]);
    try {
      const rulesetId = DIFFICULTY_RULESET_IDS[difficulty];
      const response = await fetch(`/api/v1/leaderboards/daily?ruleset_id=${encodeURIComponent(rulesetId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("LEADERBOARD_UNAVAILABLE");
      const data = (await response.json()) as { ruleset_id: string; entries: LeaderboardEntry[] };
      if (data.ruleset_id !== rulesetId || !Array.isArray(data.entries)) throw new Error("LEADERBOARD_MISMATCH");
      if (requestId !== leaderboardRequestRef.current) return;
      setLeaderboard(data.entries.slice(0, 3));
      setLeaderboardStatus("ready");
    } catch {
      if (requestId !== leaderboardRequestRef.current) return;
      setLeaderboardStatus("error");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadLeaderboard(selectedDifficulty); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadLeaderboard, selectedDifficulty]);

  const submitFinish = useCallback(async () => {
    const submission = finishSubmissionRef.current;
    if (!submission || saveStatus === "pending") return;
    setSaveStatus("pending");
    try {
      const response = await fetch(`/api/v1/runs/${submission.run.run_id}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: submission.body,
      });
      const data = (await response.json()) as { run?: { distance_m: number; time_limit_completed: boolean }; was_personal_best?: boolean; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "SAVE_FAILED");
      setNotice(data.run.time_limit_completed
        ? `${DIFFICULTIES[submission.difficulty].label}で30:00完走！ ${data.run.distance_m}mを記録しました。`
        : `${DIFFICULTIES[submission.difficulty].label}で${data.run.distance_m}mを記録しました${data.was_personal_best ? "。自己ベストです！" : "。"}`);
      finishSubmissionRef.current = null;
      savePendingRef.current = false;
      setSaveStatus("idle");
      void loadLeaderboard(submission.difficulty);
    } catch {
      setNotice(`結果は ${formatMeters(submission.distanceMm)}m。記録を確認できませんでした。同じ記録を再送してください。`);
      setSaveStatus("failed");
    }
  }, [loadLeaderboard, saveStatus]);

  const finish = useCallback((final: GameState) => {
    if (phaseRef.current !== "running") return;
    window.clearInterval(timerRef.current ?? undefined);
    timerRef.current = null;
    keyboardDirectionRef.current = 0;
    jumpQueuedRef.current = false;
    phaseRef.current = "ended";
    setPhase("ended");
    const playVideo = final.terminalReason === "EXHAUSTED";
    gameOverVideoRef.current = playVideo;
    setShowGameOverVideo(playVideo);
    const difficulty = runDifficultyRef.current;
    const official = officialRunRef.current;
    if (!official) {
      const result = final.terminalReason === "TIME_LIMIT" ? "30:00完走" : "スタミナ切れ";
      setNotice(`${DIFFICULTIES[difficulty].label}の練習結果 ${formatMeters(final.distanceMm)}m（${result}）。`);
      if (!playVideo) window.setTimeout(() => resultHeadingRef.current?.focus({ preventScroll: true }), 0);
      return;
    }
    savePendingRef.current = true;
    finishSubmissionRef.current = {
      run: official,
      difficulty,
      distanceMm: final.distanceMm,
      body: JSON.stringify({
          schema_version: "4.0.0",
          submission_id: crypto.randomUUID(),
          final_tick: final.tick,
          terminal_reason: final.terminalReason,
          input_b64: encodeDifficultyInputs(inputsRef.current),
      }),
    };
    setNotice(`結果は ${formatMeters(final.distanceMm)}m。記録を確認中です…`);
    void submitFinish();
    if (!playVideo) window.setTimeout(() => resultHeadingRef.current?.focus({ preventScroll: true }), 0);
  }, [submitFinish]);

  const completeGameOverVideo = useCallback(() => {
    if (!gameOverVideoRef.current) return;
    gameOverVideoRef.current = false;
    setShowGameOverVideo(false);
    window.setTimeout(() => resultHeadingRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  const queueJump = useCallback(() => {
    if (phaseRef.current === "running") jumpQueuedRef.current = true;
  }, []);

  const setTargetX = useCallback((targetXmm: number) => {
    if (phaseRef.current !== "running") return;
    targetXRef.current = Math.max(-ROAD_HALF_WIDTH_MM, Math.min(ROAD_HALF_WIDTH_MM, Math.round(targetXmm / 10) * 10));
  }, []);

  const stopHorizontalMovement = useCallback(() => {
    if (phaseRef.current !== "running") return;
    targetXRef.current = stateRef.current.xMm;
  }, []);

  const start = useCallback(async () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "ended") return;
    if (savePendingRef.current || gameOverVideoRef.current || abandonPendingRef.current) return;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (characterStatus !== "ready") {
      setSetupOpen(true);
      setNotice("人物3Dを読み込めないため開始できません。通信を確認して再読み込みしてください。");
      return;
    }
    if (zombieStatus !== "ready") {
      setSetupOpen(true);
      setNotice("ゾンビ3Dを読み込めないため開始できません。通信を確認して再読み込みしてください。");
      return;
    }
    const difficulty = selectedDifficulty;
    const characterId = selectedCharacterId;
    runDifficultyRef.current = difficulty;
    runCharacterRef.current = characterId;
    setRunDifficulty(difficulty);
    setRunCharacterId(characterId);
    setSetupOpen(false);
    setShowGameOverVideo(false);
    phaseRef.current = "starting";
    setPhase("starting");
    setStartError(null);
    setBlockedRunId(null);
    keyboardDirectionRef.current = 0;
    jumpQueuedRef.current = false;
    let runSeed = seedForDate(challengeDateInTokyo());
    officialRunRef.current = null;
    setAlias(null);

    if (signedIn) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch("/api/v1/runs/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ difficulty, input_schema_version: "4.0.0" }),
          signal: controller.signal,
        });
        const data = (await response.json()) as { run?: OfficialRun; error?: string; active_run_id?: string };
        if (response.ok && data.run && data.run.difficulty === difficulty && data.run.ruleset_id === DIFFICULTY_RULESET_IDS[difficulty] && data.run.input_schema_version === "4.0.0") {
          officialRunRef.current = data.run;
          runSeed = data.run.seed;
          setAlias(data.run.display_name);
          setNotice(`${DIFFICULTIES[difficulty].label}のランキングに挑戦しています。`);
        } else {
          phaseRef.current = "ready";
          setPhase("ready");
          setSetupOpen(true);
          const blocked = response.status === 409 && data.error === "ACTIVE_RUN_EXISTS" && typeof data.active_run_id === "string";
          if (blocked) setBlockedRunId(data.active_run_id ?? null);
          const message = blocked
            ? "前のランキング走行が残っているため、開始できません。"
            : data.error === "AUTH_REQUIRED"
              ? "サインインを確認できませんでした。サインインし直してから試してください。"
              : response.ok && data.run
                ? "ゲームの更新が必要です。ページを再読み込みしてから試してください。"
                : `ランキングへの挑戦を開始できませんでした（${data.error ?? "SESSION_UNAVAILABLE"}）。`;
          setStartError(message);
          setNotice(message);
          window.setTimeout(() => setupHeadingRef.current?.focus({ preventScroll: true }), 0);
          return;
        }
      } catch {
        phaseRef.current = "ready";
        setPhase("ready");
        setSetupOpen(true);
        const message = "開始結果を確認できませんでした。通信を確認してもう一度押してください。前の走行が残っていた場合は、破棄して再挑戦できます。";
        setStartError(message);
        setNotice(message);
        window.setTimeout(() => setupHeadingRef.current?.focus({ preventScroll: true }), 0);
        return;
      } finally {
        window.clearTimeout(timeout);
      }
    } else {
      setNotice(`${DIFFICULTIES[difficulty].label}の練習を開始しました。`);
    }

    const initial = createDifficultyGameState();
    setSeed(runSeed);
    stateRef.current = initial;
    inputsRef.current = [];
    targetXRef.current = 0;
    jumpQueuedRef.current = false;
    keyboardDirectionRef.current = 0;
    setGame(initial);
    phaseRef.current = "running";
    setPhase("running");
    timerRef.current = window.setInterval(() => {
      const current = stateRef.current;
      if (keyboardDirectionRef.current !== 0) {
        targetXRef.current = Math.max(-ROAD_HALF_WIDTH_MM, Math.min(ROAD_HALF_WIDTH_MM, targetXRef.current + keyboardDirectionRef.current * CONTINUOUS_MOVE_PER_TICK_MM));
      }
      const input: DifficultyInput = { targetXmm: targetXRef.current, jump: jumpQueuedRef.current };
      jumpQueuedRef.current = false;
      inputsRef.current.push(input);
      const next = advanceDifficultyGameState(current, runSeed, input, difficulty);
      stateRef.current = next;
      setGame(next);
      if (next.terminalReason) void finish(next);
    }, 1000 / 30);
  }, [characterStatus, zombieStatus, finish, selectedCharacterId, selectedDifficulty, signedIn]);

  const abandonAndRetry = useCallback(async () => {
    if (!blockedRunId || abandonPendingRef.current || phaseRef.current !== "ready") return;
    abandonPendingRef.current = true;
    setAbandonPending(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      // The previous page's tick count is unavailable after reload; the abandoned run receives no score.
      const response = await fetch(`/api/v1/runs/${encodeURIComponent(blockedRunId)}/abandon`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema_version: "1.0.0", reason: "USER_EXIT", at_tick: 0 }),
        signal: controller.signal,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok && response.status !== 404 && data.error !== "RUN_STATE_CONFLICT") {
        throw new Error(data.error ?? "ABANDON_FAILED");
      }
      setBlockedRunId(null);
      abandonPendingRef.current = false;
      setAbandonPending(false);
      await start();
    } catch {
      setStartError("前の走行を終了できませんでした。通信またはサインイン状態を確認して、もう一度お試しください。");
      setNotice("前の走行を終了できませんでした。通信またはサインイン状態を確認して、もう一度お試しください。");
    } finally {
      window.clearTimeout(timeout);
      abandonPendingRef.current = false;
      setAbandonPending(false);
    }
  }, [blockedRunId, start]);

  const selectCharacter = useCallback((characterId: CharacterId) => {
    if (!setupOpen || (phaseRef.current !== "ready" && phaseRef.current !== "ended")) return;
    const character = CHARACTERS[characterId];
    if (!character.available || characterId === selectedCharacterId) return;
    setCharacterStatus("loading");
    setSelectedCharacterId(characterId);
    setNotice(`${character.label}を読み込んでいます…`);
  }, [selectedCharacterId, setupOpen]);

  useEffect(() => {
    const clearHeldInput = () => { keyboardDirectionRef.current = 0; jumpQueuedRef.current = false; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (phaseRef.current !== "running") return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keyboardDirectionRef.current = -1;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keyboardDirectionRef.current = 1;
      if (!event.repeat && (event.key === "ArrowUp" || event.key === " ")) queueJump();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if ((event.key === "ArrowLeft" || event.key.toLowerCase() === "a") && keyboardDirectionRef.current === -1) keyboardDirectionRef.current = 0;
      if ((event.key === "ArrowRight" || event.key.toLowerCase() === "d") && keyboardDirectionRef.current === 1) keyboardDirectionRef.current = 0;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearHeldInput);
    window.addEventListener("resize", clearHeldInput);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearHeldInput);
      window.removeEventListener("resize", clearHeldInput);
      window.clearInterval(timerRef.current ?? undefined);
    };
  }, [queueJump]);

  const displayDifficulty = isActive || phase === "ended" ? runDifficulty : selectedDifficulty;
  const displayCharacter = isActive || phase === "ended" ? activeRunCharacter : selectedCharacter;
  const rankingBoard = (
    <section className="zdr-board" aria-labelledby="ranking-title">
      <div className="zdr-board-title">
        <div><h2 id="ranking-title">ランキング</h2><p>今日・{DIFFICULTIES[selectedDifficulty].label} 上位3人</p></div>
        <button type="button" onClick={() => void loadLeaderboard(selectedDifficulty)}>更新</button>
      </div>
      {leaderboardStatus === "loading" && <p role="status">ランキングを読み込み中…</p>}
      {leaderboardStatus === "error" && <p role="status">ランキングを取得できませんでした。更新を押して再試行してください。</p>}
      {leaderboardStatus === "ready" && leaderboard.length === 0 && <p>まだ記録がありません。</p>}
      {leaderboardStatus === "ready" && leaderboard.length > 0 && (
        <table className="zdr-top-three-table">
          <thead><tr><th scope="col">順位</th><th scope="col">名前</th><th scope="col">距離</th></tr></thead>
          <tbody>{leaderboard.map((entry) => (
            <tr key={`${entry.rank}-${entry.display_name}`}>
              <th scope="row">{entry.rank}位</th>
              <td>{entry.display_name}{entry.time_limit_completed && <small>30:00完走</small>}</td>
              <td>{entry.distance_m.toFixed(2)} m</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );

  return (
    <main className={`zdr-shell ${isActive ? "is-active" : ""}`}>
      <section className={`zdr-game ${isActive ? "is-active" : ""} ${isResult ? "is-result" : ""} ${showSetup ? "is-setup" : ""}`} aria-label="ゾンビ逃走ゲーム">
        {showSetup && (
          <section className="zdr-setup" aria-labelledby="setup-title">
            <h2 id="setup-title" ref={setupHeadingRef} tabIndex={-1}>走る設定を選ぶ</h2>
            <div className="zdr-setting-block">
              <h3>主人公を選ぶ</h3>
              <div className="zdr-choice-grid zdr-choice-grid--characters" role="group" aria-label="主人公を選ぶ">
                {CHARACTER_IDS.map((characterId) => {
                  const character = CHARACTERS[characterId];
                  const selected = character.id === selectedCharacterId;
                  return <button key={character.id} type="button" className={selected ? "is-selected" : ""} aria-pressed={selected} disabled={!character.available} onClick={() => selectCharacter(character.id)}><b>{character.label}</b></button>;
                })}
              </div>
            </div>
            <div className="zdr-setting-block">
              <h3>レベルを選ぶ</h3>
              <div className="zdr-choice-grid zdr-choice-grid--levels" role="group" aria-label="レベルを選ぶ">
                {DIFFICULTY_IDS.map((difficulty) => (
                  <button key={difficulty} type="button" className={difficulty === selectedDifficulty ? "is-selected" : ""} aria-pressed={difficulty === selectedDifficulty} onClick={() => setSelectedDifficulty(difficulty)}>
                    <b>{DIFFICULTIES[difficulty].label}</b>
                  </button>
                ))}
              </div>
            </div>
            <button className="zdr-start" type="button" onClick={() => void start()} disabled={characterStatus !== "ready" || zombieStatus !== "ready" || saveStatus !== "idle" || abandonPending}>
              {saveStatus === "pending" ? "記録を確認中…" : saveStatus === "failed" ? "記録の再送が必要" : characterStatus === "loading" || zombieStatus === "loading" ? "読み込み中" : characterStatus === "error" || zombieStatus === "error" ? "読込エラー" : signedIn ? "ランキングに挑戦" : "練習を開始"}
            </button>
            {startError && <div className="zdr-start-error" role="alert">
              <p>{startError}</p>
              {blockedRunId && <>
                <p>別のタブで走行中なら、その走行を続けてください。破棄すると前の走行はランキングに登録されません。</p>
                <button type="button" onClick={() => void abandonAndRetry()} disabled={abandonPending}>{abandonPending ? "前の走行を終了中…" : "前の走行を破棄して再挑戦"}</button>
              </>}
            </div>}
          </section>
        )}

        {showSetup && rankingBoard}

        <div className="zdr-playfield" hidden={showSetup}>
          <div className="zdr-scene-title" aria-hidden="true"><b>ZOMBIE</b><span>DISTANCE RUN</span></div>
          <div className="zdr-hud">
            <div className="zdr-run-label"><span>{displayCharacter.label}</span><strong>{DIFFICULTIES[displayDifficulty].label}</strong></div>
            <div><span>距離</span><strong>{formatMeters(game.distanceMm)}m</strong></div>
            <div className="zdr-stamina"><span>スタミナ {game.stamina}</span><i><b style={{ width: `${game.stamina}%` }} /></i></div>
          </div>
          <GameScene game={game} seed={seed} phase={phase} suspended={showGameOverVideo} character={selectedCharacter} onCharacterStatus={onCharacterStatus} onZombieStatus={setZombieStatus} onTargetX={setTargetX} onStopHorizontal={stopHorizontalMovement} onJump={queueJump} />
          {(characterStatus !== "ready" || zombieStatus !== "ready") && <div className="zdr-load-state" role="status">{characterStatus === "error" || zombieStatus === "error" ? "必要な3Dモデルを読み込めませんでした。通信を確認して再読み込みしてください。" : "人物3D、ゾンビ3Dと街を読み込み中…"}</div>}
          {game.terminalReason && <div className="zdr-caught" aria-hidden="true">{game.terminalReason === "TIME_LIMIT" ? "30:00 完走" : "スタミナ切れ"}</div>}
          {phase === "starting" && <div className="zdr-phase-overlay" role="status">{DIFFICULTIES[runDifficulty].label}で開始しています…</div>}
        </div>

        {phase !== "ended" && <div className="zdr-game-status" aria-live="polite">
          {phase === "ready" && "主人公とレベルを選んで開始してください。"}
          {phase === "starting" && "走行を開始しています…"}
          {phase === "running" && (alias ? `${alias}として${DIFFICULTIES[runDifficulty].label}ランキングに挑戦中` : `${DIFFICULTIES[runDifficulty].label}の練習中`)}
          {phase === "saving" && "結果を表示しています。記録を確認中です…"}
        </div>}

        {phase === "ended" && !setupOpen && (
          <section className="zdr-result-actions" aria-labelledby="result-title">
            <h2 id="result-title" ref={resultHeadingRef} tabIndex={-1}>{displayCharacter.label}・{DIFFICULTIES[runDifficulty].label}の結果</h2>
            <p>{notice}</p>
            <div>
              <button className="zdr-start" type="button" onClick={() => void start()} disabled={saveStatus !== "idle"}>同じ設定でもう一度</button>
              <button type="button" onClick={() => { setSetupOpen(true); setSelectedCharacterId(runCharacterRef.current); setSelectedDifficulty(runDifficultyRef.current); window.setTimeout(() => setupHeadingRef.current?.focus({ preventScroll: true }), 0); }}>主人公・レベルを変更</button>
            </div>
            {saveStatus === "pending" && <p role="status">記録を確認中です。確認後に再挑戦できます。</p>}
            {saveStatus === "failed" && <button type="button" onClick={() => void submitFinish()}>同じ記録を再送</button>}
          </section>
        )}
      </section>

      {!isActive && (
        <aside className="zdr-panel">
          <p className="zdr-kicker">ZOMBIE DISTANCE RUN</p>
          <h1>走れ。<br />ゾンビを避けて、走り抜けろ。</h1>
          <p className="zdr-notice">{notice}</p>
          <dl className="zdr-rules">
            <div><dt>PC</dt><dd>A / D、← / →で移動、Spaceでジャンプ</dd></div>
            <div><dt>スマホ</dt><dd>指ドラッグで左右移動、画面タップでジャンプ</dd></div>
            <div><dt>人物3D</dt><dd>{characterStatus === "ready" ? selectedCharacter.releaseLabel : characterStatus === "loading" ? `${selectedCharacter.label}を読み込み中` : `${selectedCharacter.label}の読み込みエラー`}</dd></div>
            <div><dt>レベル</dt><dd>{DIFFICULTIES[selectedDifficulty].label}</dd></div>
          </dl>
          {!showSetup && rankingBoard}
        </aside>
      )}
      {showGameOverVideo && <GameOverVideo onComplete={completeGameOverVideo} />}
    </main>
  );
}

function formatMeters(distanceMm: number): string {
  return (distanceMm / 1000).toFixed(1);
}
