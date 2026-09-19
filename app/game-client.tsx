"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameScene } from "./game-scene";
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
  const setupHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const phaseRef = useRef<Phase>("ready");
  const [game, setGame] = useState<GameState>(() => createDifficultyGameState());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [notice, setNotice] = useState("主人公とレベルを選んで開始してください。");
  const [alias, setAlias] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => seedForDate(challengeDateInTokyo()));
  const [characterStatus, setCharacterStatus] = useState<CharacterStatus>("loading");
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>("runner_001");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("beginner");
  const [runDifficulty, setRunDifficulty] = useState<Difficulty>("beginner");
  const [runCharacterId, setRunCharacterId] = useState<CharacterId>("runner_001");
  const [setupOpen, setSetupOpen] = useState(true);
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
    try {
      const rulesetId = DIFFICULTY_RULESET_IDS[difficulty];
      const response = await fetch(`/api/v1/leaderboards/daily?ruleset_id=${encodeURIComponent(rulesetId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { entries: LeaderboardEntry[] };
      setLeaderboard(data.entries);
    } catch {
      // The play surface remains available if the ranking service is unavailable.
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadLeaderboard(selectedDifficulty); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadLeaderboard, selectedDifficulty]);

  const finish = useCallback(async (final: GameState) => {
    window.clearInterval(timerRef.current ?? undefined);
    timerRef.current = null;
    keyboardDirectionRef.current = 0;
    jumpQueuedRef.current = false;
    phaseRef.current = "saving";
    setPhase("saving");
    const difficulty = runDifficultyRef.current;
    const official = officialRunRef.current;
    if (!official) {
      const result = final.terminalReason === "TIME_LIMIT" ? "30:00完走" : "スタミナ切れ";
      setNotice(`${DIFFICULTIES[difficulty].label}の練習結果 ${formatMeters(final.distanceMm)}m（${result}）。`);
      phaseRef.current = "ended";
      setPhase("ended");
      window.setTimeout(() => resultHeadingRef.current?.focus({ preventScroll: true }), 0);
      return;
    }
    try {
      const response = await fetch(`/api/v1/runs/${official.run_id}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: "4.0.0",
          submission_id: crypto.randomUUID(),
          final_tick: final.tick,
          terminal_reason: final.terminalReason,
          input_b64: encodeDifficultyInputs(inputsRef.current),
        }),
      });
      const data = (await response.json()) as { run?: { distance_m: number; time_limit_completed: boolean }; was_personal_best?: boolean; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "SAVE_FAILED");
      setNotice(data.run.time_limit_completed
        ? `${DIFFICULTIES[difficulty].label}で30:00完走！ ${data.run.distance_m}mを記録しました。`
        : `${DIFFICULTIES[difficulty].label}で${data.run.distance_m}mを記録しました${data.was_personal_best ? "。自己ベストです！" : "。"}`);
      void loadLeaderboard(difficulty);
    } catch {
      setNotice(`結果は ${formatMeters(final.distanceMm)}m。記録サービスへ送れなかったためランキングには登録していません。`);
    }
    phaseRef.current = "ended";
    setPhase("ended");
    window.setTimeout(() => resultHeadingRef.current?.focus({ preventScroll: true }), 0);
  }, [loadLeaderboard]);

  const queueJump = useCallback(() => {
    if (phaseRef.current === "running") jumpQueuedRef.current = true;
  }, []);

  const setTargetX = useCallback((targetXmm: number) => {
    if (phaseRef.current !== "running") return;
    targetXRef.current = Math.max(-ROAD_HALF_WIDTH_MM, Math.min(ROAD_HALF_WIDTH_MM, Math.round(targetXmm / 10) * 10));
  }, []);

  const start = useCallback(async () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "ended") return;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (characterStatus !== "ready") {
      setSetupOpen(true);
      setNotice("人物3Dを読み込めないため開始できません。通信を確認して再読み込みしてください。");
      return;
    }
    const difficulty = selectedDifficulty;
    const characterId = selectedCharacterId;
    runDifficultyRef.current = difficulty;
    runCharacterRef.current = characterId;
    setRunDifficulty(difficulty);
    setRunCharacterId(characterId);
    setSetupOpen(false);
    phaseRef.current = "starting";
    setPhase("starting");
    keyboardDirectionRef.current = 0;
    jumpQueuedRef.current = false;
    let runSeed = seedForDate(challengeDateInTokyo());
    officialRunRef.current = null;
    setAlias(null);

    if (signedIn) {
      try {
        const response = await fetch("/api/v1/runs/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ difficulty, input_schema_version: "4.0.0" }),
        });
        const data = (await response.json()) as { run?: OfficialRun; error?: string };
        if (response.ok && data.run && data.run.difficulty === difficulty && data.run.ruleset_id === DIFFICULTY_RULESET_IDS[difficulty] && data.run.input_schema_version === "4.0.0") {
          officialRunRef.current = data.run;
          runSeed = data.run.seed;
          setAlias(data.run.display_name);
          setNotice(`${DIFFICULTIES[difficulty].label}のランク戦を開始しました。`);
        } else {
          phaseRef.current = "ready";
          setPhase("ready");
          setSetupOpen(true);
          setNotice(`ランク戦を開始できませんでした（${data.error ?? "SESSION_UNAVAILABLE"}）。選択は保存されています。`);
          window.setTimeout(() => setupHeadingRef.current?.focus({ preventScroll: true }), 0);
          return;
        }
      } catch {
        phaseRef.current = "ready";
        setPhase("ready");
        setSetupOpen(true);
        setNotice("ランク戦を開始できませんでした。選択は保存されています。通信またはサインイン状態を確認してください。");
        window.setTimeout(() => setupHeadingRef.current?.focus({ preventScroll: true }), 0);
        return;
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
  }, [characterStatus, finish, selectedCharacterId, selectedDifficulty, signedIn]);

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

  const crowdCount = 6 + 3 * Math.floor(game.distanceMm / 250_000);
  const displayDifficulty = isActive || phase === "ended" ? runDifficulty : selectedDifficulty;
  const displayCharacter = isActive || phase === "ended" ? activeRunCharacter : selectedCharacter;

  return (
    <main className={`zdr-shell ${isActive ? "is-active" : ""}`}>
      <section className={`zdr-game ${isActive ? "is-active" : ""} ${isResult ? "is-result" : ""}`} aria-label="ゾンビ逃走ゲーム">
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
            <button className="zdr-start" type="button" onClick={() => void start()} disabled={characterStatus !== "ready"}>
              {characterStatus === "loading" ? "読み込み中" : characterStatus === "error" ? "読込エラー" : signedIn ? "ランク戦を開始" : "練習を開始"}
            </button>
          </section>
        )}

        <div className="zdr-playfield">
          <div className="zdr-scene-title" aria-hidden="true"><b>ZOMBIE</b><span>DISTANCE RUN</span></div>
          <div className="zdr-hud">
            <div className="zdr-run-label"><span>{displayCharacter.label}</span><strong>{DIFFICULTIES[displayDifficulty].label}</strong></div>
            <div><span>距離</span><strong>{formatMeters(game.distanceMm)}m</strong></div>
            <div className="zdr-stamina"><span>スタミナ {game.stamina}</span><i><b style={{ width: `${game.stamina}%` }} /></i></div>
            <div className="zdr-crowd"><span>群れ</span><strong>{crowdCount}体</strong></div>
          </div>
          <GameScene game={game} seed={seed} phase={phase} character={selectedCharacter} onCharacterStatus={onCharacterStatus} onTargetX={setTargetX} onJump={queueJump} />
          {characterStatus !== "ready" && <div className="zdr-load-state" role="status">{characterStatus === "loading" ? `${selectedCharacter.label}の人物3Dと街を読み込み中…` : `${selectedCharacter.label}の人物3Dを読み込めませんでした。別の人物を選ぶか、再読み込みしてください。`}</div>}
          {game.terminalReason && <div className="zdr-caught" aria-hidden="true">{game.terminalReason === "TIME_LIMIT" ? "30:00 完走" : "スタミナ切れ"}</div>}
          {phase === "starting" && <div className="zdr-phase-overlay" role="status">{DIFFICULTIES[runDifficulty].label}で開始しています…</div>}
        </div>

        {phase !== "ended" && <div className="zdr-game-status" aria-live="polite">
          {phase === "ready" && "主人公とレベルを選んで開始してください。"}
          {phase === "starting" && "走行を開始しています…"}
          {phase === "running" && (alias ? `${alias}として${DIFFICULTIES[runDifficulty].label}ランク戦中` : `${DIFFICULTIES[runDifficulty].label}の練習中`)}
          {phase === "saving" && "結果を表示しています。記録を確認中です…"}
        </div>}

        {phase === "ended" && !setupOpen && (
          <section className="zdr-result-actions" aria-labelledby="result-title">
            <h2 id="result-title" ref={resultHeadingRef} tabIndex={-1}>{displayCharacter.label}・{DIFFICULTIES[runDifficulty].label}の結果</h2>
            <p>{notice}</p>
            <div>
              <button className="zdr-start" type="button" onClick={() => void start()}>同じ設定でもう一度</button>
              <button type="button" onClick={() => { setSetupOpen(true); setSelectedCharacterId(runCharacterRef.current); setSelectedDifficulty(runDifficultyRef.current); window.setTimeout(() => setupHeadingRef.current?.focus({ preventScroll: true }), 0); }}>主人公・レベルを変更</button>
            </div>
          </section>
        )}
      </section>

      {!isActive && (
        <aside className="zdr-panel">
          <p className="zdr-kicker">ZOMBIE DISTANCE RUN</p>
          <h1>走れ。<br />群れが増える前に。</h1>
          <p className="zdr-notice">{notice}</p>
          <dl className="zdr-rules">
            <div><dt>PC</dt><dd>A / D、← / →で移動、Spaceでジャンプ</dd></div>
            <div><dt>スマホ</dt><dd>指ドラッグで左右移動、画面タップでジャンプ</dd></div>
            <div><dt>人物3D</dt><dd>{characterStatus === "ready" ? selectedCharacter.releaseLabel : characterStatus === "loading" ? `${selectedCharacter.label}を読み込み中` : `${selectedCharacter.label}の読み込みエラー`}</dd></div>
            <div><dt>レベル</dt><dd>{DIFFICULTIES[selectedDifficulty].label}</dd></div>
          </dl>
          <div className="zdr-board">
            <div className="zdr-board-title"><h2>今日の{DIFFICULTIES[selectedDifficulty].label}ランキング</h2><button type="button" onClick={() => void loadLeaderboard(selectedDifficulty)}>更新</button></div>
            {leaderboard.length === 0 ? <p>まだ記録がありません。最初の逃走者になろう。</p> : <ol>{leaderboard.map((entry) => <li key={`${entry.rank}-${entry.display_name}`}><span>{entry.rank}</span><b>{entry.display_name}</b><em>{entry.distance_m}m {entry.time_limit_completed ? "完走" : ""}</em></li>)}</ol>}
          </div>
        </aside>
      )}
    </main>
  );
}

function formatMeters(distanceMm: number): string {
  return (distanceMm / 1000).toFixed(1);
}
