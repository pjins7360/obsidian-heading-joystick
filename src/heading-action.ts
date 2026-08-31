export type JoystickState =
  | { kind: "deadzone" }
  | { kind: "sector"; level: 1 | 2 | 3 | 4 | 5 | 6 };

const HEADING_PREFIX_RE = /^#{1,6}\s+/;

export function stripHeadingPrefix(line: string): {
  bare: string;
  prefixLen: number;
} {
  const match = line.match(HEADING_PREFIX_RE);
  if (!match) return { bare: line, prefixLen: 0 };
  return { bare: line.slice(match[0].length), prefixLen: match[0].length };
}

export function applyHeadingToLine(line: string, state: JoystickState): string {
  const { bare } = stripHeadingPrefix(line);
  if (state.kind === "deadzone") return bare;
  return "#".repeat(state.level) + " " + bare;
}

export function newPrefixLength(state: JoystickState): number {
  if (state.kind === "deadzone") return 0;
  // level '#' characters plus the single trailing space
  return state.level + 1;
}

export function computeCursorAdjustment(
  oldCh: number,
  oldPrefixLen: number,
  newPrefixLen: number
): number {
  return Math.max(0, oldCh + (newPrefixLen - oldPrefixLen));
}

// angle in degrees, 0-360, 0=right, increasing counterclockwise on screen.
// Callers must pass the normalized angle computed via atan2(-dy, dx).
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

// deadzoneRadius and distance share the same unit (pixels).
export function computeState(
  distance: number,
  angleDeg: number,
  deadzoneRadius: number
): JoystickState {
  if (distance < deadzoneRadius) return { kind: "deadzone" };
  const a = normalizeAngle(angleDeg);
  // each sector spans +/-30 degrees around its center (counterclockwise ordering)
  if (a >= 330 || a < 30) return { kind: "sector", level: 5 };
  if (a < 90) return { kind: "sector", level: 6 };
  if (a < 150) return { kind: "sector", level: 1 };
  if (a < 210) return { kind: "sector", level: 2 };
  if (a < 270) return { kind: "sector", level: 3 };
  return { kind: "sector", level: 4 };
}
