export const LATERAL_DRAG_DEAD_ZONE_PX = 8;

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
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= LATERAL_DRAG_DEAD_ZONE_PX) return { drag, targetXmm: null };
    // The first 8px only decides tap versus drag. Do not turn it into a lateral jump.
    drag = {
      ...drag,
      moved: true,
      lastX: drag.startX + (deltaX * LATERAL_DRAG_DEAD_ZONE_PX) / distance,
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
