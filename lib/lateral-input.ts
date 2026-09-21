export const LATERAL_DRAG_DEAD_ZONE_PX = 8;
export const JUMP_TAP_MAX_MOVEMENT_PX = 20;
export const JUMP_TAP_MAX_DURATION_MS = 300;

export type LateralDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  rawTargetXmm: number;
  startedAt: number;
  moved: boolean;
};

export function beginLateralDrag(pointerId: number, clientX: number, clientY: number, currentXmm: number, startedAt: number): LateralDrag {
  return { pointerId, startX: clientX, startY: clientY, lastX: clientX, rawTargetXmm: currentXmm, startedAt, moved: false };
}

export function isJumpTap(drag: LateralDrag, clientX: number, clientY: number, endedAt: number): boolean {
  return !drag.moved
    && endedAt >= drag.startedAt
    && endedAt - drag.startedAt <= JUMP_TAP_MAX_DURATION_MS
    && Math.hypot(clientX - drag.startX, clientY - drag.startY) <= JUMP_TAP_MAX_MOVEMENT_PX;
}

export function advanceLateralDrag(
  previous: LateralDrag,
  clientX: number,
  clientY: number,
  travelPx: number,
  roadHalfWidthMm: number,
): { drag: LateralDrag; targetXmm: number | null } {
  let drag = previous;
  if (!drag.moved) {
    const deltaX = clientX - drag.startX;
    const deltaY = clientY - drag.startY;
    // A small vertical wobble should not turn a tap into horizontal movement.
    if (Math.abs(deltaX) <= LATERAL_DRAG_DEAD_ZONE_PX || Math.abs(deltaX) < Math.abs(deltaY)) {
      return { drag, targetXmm: null };
    }
    // The first 8px only decides tap versus horizontal drag.
    drag = {
      ...drag,
      moved: true,
      lastX: drag.startX + Math.sign(deltaX) * LATERAL_DRAG_DEAD_ZONE_PX,
    };
  }

  const rawTargetXmm = clamp(
    drag.rawTargetXmm + ((clientX - drag.lastX) / Math.max(1, travelPx)) * roadHalfWidthMm * 2,
    -roadHalfWidthMm,
    roadHalfWidthMm,
  );
  const next = { ...drag, lastX: clientX, rawTargetXmm };
  return { drag: next, targetXmm: Math.round(rawTargetXmm / 10) * 10 };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
