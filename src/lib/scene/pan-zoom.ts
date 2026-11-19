// Pan limit calculation, offset clamping, and touch gesture bounds.

export const PAN_RADIUS = 5;
export const PAN_VIEW = 0.6;
export const PAN_DEAD = 8;

// Calculates maximum pan distance from island center.
export function calcPanLimit(halfExtent: number, grow = 0): number {
  const safeHalf = Number.isFinite(halfExtent) && halfExtent > 0 ? halfExtent : 0;
  const safeGrow = Number.isFinite(grow) ? grow : 0;
  const limit = Math.min(PAN_RADIUS + safeGrow, PAN_VIEW * safeHalf);
  return Math.max(0, Number.isFinite(limit) ? limit : 0);
}

export type PanClampResult = {
  x: number;
  z: number;
  clamped: boolean;
  shiftX: number;
  shiftZ: number;
};

// Clamps pan target coordinates to stay within maximum radius of home.
export function clampPanOffset(
  targetX: number,
  targetZ: number,
  homeX: number,
  homeZ: number,
  maxPan: number,
): PanClampResult {
  const safeHomeX = Number.isFinite(homeX) ? homeX : 0;
  const safeHomeZ = Number.isFinite(homeZ) ? homeZ : 0;
  const curX = Number.isFinite(targetX) ? targetX : safeHomeX;
  const curZ = Number.isFinite(targetZ) ? targetZ : safeHomeZ;
  const max = Math.max(0, Number.isFinite(maxPan) ? maxPan : 0);
  const dx = curX - safeHomeX;
  const dz = curZ - safeHomeZ;
  const d = Math.hypot(dx, dz);
  if (!Number.isFinite(d) || d <= max || d === 0) {
    return { x: curX, z: curZ, clamped: curX !== targetX || curZ !== targetZ, shiftX: 0, shiftZ: 0 };
  }
  const k = max / d - 1;
  return {
    x: curX + dx * k,
    z: curZ + dz * k,
    clamped: true,
    shiftX: dx * k,
    shiftZ: dz * k,
  };
}

// Tracks pointer gestures and suppresses taps during pinches.
export class TouchGestureTracker {
  pointers = new Map<number, { x: number; y: number }>();
  private hadTwo = false;

  down(id: number, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.pointers.set(id, { x, y });
    if (this.pointers.size >= 2) this.hadTwo = true;
  }

  move(id: number, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.pointers.has(id)) this.pointers.set(id, { x, y });
  }

  up(id: number): boolean {
    this.pointers.delete(id);
    const pinch = this.hadTwo;
    if (this.pointers.size === 0) this.hadTwo = false;
    return pinch;
  }

  cancel(id: number) {
    this.pointers.delete(id);
    if (this.pointers.size === 0) this.hadTwo = false;
  }

  reset() {
    this.pointers.clear();
    this.hadTwo = false;
  }
}
