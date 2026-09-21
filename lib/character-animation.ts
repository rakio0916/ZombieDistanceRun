import type { TerminalReason } from "./game-core";

export const JUMP_DURATION_TICKS = 24;
export const TERMINAL_LANDING_SECONDS = 0.1;

export type CharacterClip = "Web_Idle" | "Run_03" | "Web_Jump" | "Web_Stumble" | "Web_Caught";

export function getJumpPhase(tick: number, jumpStartTick: number): number | null {
  if (jumpStartTick < 0) return null;
  return tick - jumpStartTick;
}

export function isJumpPoseActive(phase: number | null): boolean {
  return phase !== null && phase >= 0 && phase < JUMP_DURATION_TICKS;
}

export function selectCharacterClip({
  terminalReason,
  stumbleUntilTick,
  tick,
  jumpStartTick,
  running,
}: {
  terminalReason: TerminalReason | null;
  stumbleUntilTick: number;
  tick: number;
  jumpStartTick: number;
  running: boolean;
}): CharacterClip {
  if (terminalReason) return "Web_Caught";
  if (stumbleUntilTick > tick) return "Web_Stumble";
  if (isJumpPoseActive(getJumpPhase(tick, jumpStartTick))) return "Web_Jump";
  return running ? "Run_03" : "Web_Idle";
}

export function jumpClipTime(durationSeconds: number, phase: number | null): number {
  if (phase === null) return 0;
  const clamped = Math.max(0, Math.min(JUMP_DURATION_TICKS, phase));
  return durationSeconds * (clamped / JUMP_DURATION_TICKS);
}

export function jumpRootHeight(phase: number | null, heightMeters = 0.92): number {
  if (phase === null || !isJumpPoseActive(phase)) return 0;
  return Math.sin((phase / JUMP_DURATION_TICKS) * Math.PI) * heightMeters;
}

export function blendCharacterWeights(from: readonly number[], targetIndex: number, progress: number): number[] {
  const source = from.map((weight) => Number.isFinite(weight) ? Math.max(0, weight) : 0);
  const total = source.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return source.map((_, index) => index === targetIndex ? 1 : 0);
  const alpha = Math.max(0, Math.min(1, progress));
  return source.map((weight, index) => (weight / total) * (1 - alpha) + (index === targetIndex ? alpha : 0));
}

export function terminalLandingHeight(entryHeight: number, elapsedSeconds: number): number {
  if (entryHeight <= 0) return 0;
  const progress = Math.max(0, Math.min(1, elapsedSeconds / TERMINAL_LANDING_SECONDS));
  const smooth = progress * progress * (3 - 2 * progress);
  return entryHeight * (1 - smooth);
}

export function visibleFrameDelta(
  previousTimestampMs: number | null,
  timestampMs: number,
  visible: boolean,
): number {
  if (!visible || previousTimestampMs === null || timestampMs <= previousTimestampMs) return 0;
  return (timestampMs - previousTimestampMs) / 1_000;
}
