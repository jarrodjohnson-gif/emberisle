// Camera fit and touch picking for phones (docs/design/mobile-camera-touch.md, issue #171). Pure math, no THREE
// imports, so scripts/touch-place-prove.mjs can run it directly.

// Half-extent of the island plus its docks, padded 8%, in world units (HEX_SIZE 1.12).
export const ISLE_HALF = { x: 6.0, z: 5.6 };

export type Insets = { top: number; right: number; bottom: number; left: number };

// The rectangle the HUD chrome leaves for the island. `coarse` is matchMedia("(pointer: coarse)").
export function hudInsets(cssW: number, cssH: number, coarse: boolean, safe: Partial<Insets> = {}): Insets {
  let i: Insets;
  if (coarse && cssH > cssW) i = { top: 116, right: 12, bottom: 196, left: 12 };
  // Landscape bottom is 184, not the design's 96: until #177 builds the compact strip, the hand and phase bars are ~180 px tall.
  else if (coarse) i = { top: 56, right: 12, bottom: 184, left: 12 };
  else i = { top: 72, right: 312, bottom: 168, left: 248 };
  return {
    top: i.top + (safe.top ?? 0),
    right: i.right + (safe.right ?? 0),
    bottom: i.bottom + (safe.bottom ?? 0),
    left: i.left + (safe.left ?? 0),
  };
}

export type OrthoFit = { left: number; right: number; top: number; bottom: number; x: number; z: number };

// The overhead camera leans this far off straight down, toward the player (#135, polish.md "The board look target"):
// the slabs show a side and the trees a silhouette, like a board seen by someone leaning over the table, while a
// token still reads as a disc. It looks at cap level; the tallest prop (a pine) rises LEAN_RISE above that, and the
// far row's tree tops lift up-screen by that much times sin(lean), so the frustum keeps the room.
export const OVERHEAD_LEAN = (25 * Math.PI) / 180;
export const CAP_LEVEL = 0.35;
const LEAN_RISE = 1.15;

// Overhead frustum sized to the island inside the hole, then the camera is shifted so the world center lands
// at the hole center. Screen-up is -Z, screen-right is +X. `lean` is radians off straight down; it shortens the
// island's screen depth by cos(lean).
export function fitOrtho(cssW: number, cssH: number, insets: Insets, lean = 0): OrthoFit {
  const holeW = Math.max(1, cssW - insets.left - insets.right);
  const holeH = Math.max(1, cssH - insets.top - insets.bottom);
  const aspect = holeW / holeH;
  const halfX = ISLE_HALF.x;
  const halfZ = ISLE_HALF.z * Math.cos(lean) + LEAN_RISE * Math.sin(lean);
  // The frustum spans the whole canvas, so scale the hole's world size up by canvas / hole.
  let hw: number;
  let hh: number;
  if (halfX / halfZ > aspect) {
    hw = halfX;
    hh = halfX / aspect;
  } else {
    hh = halfZ;
    hw = halfZ * aspect;
  }
  const worldW = hw * 2 * (cssW / holeW);
  const worldH = hh * 2 * (cssH / holeH);
  const holeCx = insets.left + holeW / 2;
  const holeCy = insets.top + holeH / 2;
  const ndcX = (holeCx / cssW) * 2 - 1;
  const ndcY = -((holeCy / cssH) * 2 - 1);
  return {
    left: -worldW / 2,
    right: worldW / 2,
    top: worldH / 2,
    bottom: -worldH / 2,
    // Centered on the island (0, 0), not the 0.15 orbit target: ISLE_HALF is symmetric about the origin.
    x: -ndcX * worldW * 0.5,
    z: ndcY * worldH * 0.5,
  };
}

const FOV = (32 * Math.PI) / 180;

// Free-mode farthest dolly: far enough to see the whole isle inside the hole, never below 18. Desktop keeps 18
// exactly (the design's own formula gives ~29 there, which would change the shipped desktop view); the design's
// worked values 23.6 / 26.4 disagree with its formula, so the formula wins: 31.0 portrait (top inset 116 with the #177 seat strip); landscape hits the 36 cap.
export function freeMaxDistance(cssH: number, insets: Insets, coarse: boolean): number {
  if (!coarse) return 18;
  const usable = Math.max(1, cssH - insets.top - insets.bottom) / cssH;
  const d = (ISLE_HALF.z * 2) / usable / (2 * Math.tan(FOV / 2));
  return Math.min(36, Math.max(18, d));
}

// Pixels a pointer may drift between down and up and still be a tap.
export function tapSlop(pointerType: string, coarse: boolean): number {
  return pointerType === "touch" || coarse ? 24 : 8;
}

// Invisible pick volumes, world units. Visual meshes are unchanged.
export const PICK_VERTEX_RADIUS = 0.28;
export const PICK_EDGE = { w: 0.36, h: 0.16, lengthScale: 0.9 };

const RANK = { vertex: 0, edge: 1, hex: 2 } as const;

// Vertices beat edges beat hexes, then nearest. Not purely by distance: a vertex sphere sits on an edge box.
export function pickBest<T extends { kind: keyof typeof RANK; distance: number }>(hits: T[]): T | undefined {
  return [...hits].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.distance - b.distance)[0];
}

// Coarse pointers select first and confirm on a second tap of the same mark.
export function isSelectTap(coarse: boolean, pointerType: string, pendingId: string | null, hitId: string) {
  const touch = pointerType === "touch" || coarse;
  return touch && pendingId !== hitId;
}

// Tracks the fingers on the canvas. Once a second finger lands, the whole gesture is a pinch: every lift in it,
// including the last one, is swallowed so it can't select or place a mark. The flag clears when all fingers are up.
export class TouchGesture {
  pointers = new Map<number, { x: number; y: number }>();
  private hadTwo = false;

  down(id: number, x: number, y: number) {
    this.pointers.set(id, { x, y });
    if (this.pointers.size >= 2) this.hadTwo = true;
  }

  move(id: number, x: number, y: number) {
    this.pointers.set(id, { x, y });
  }

  // True when this lift belongs to a pinch and must not be treated as a tap.
  up(id: number): boolean {
    this.pointers.delete(id);
    const pinch = this.hadTwo;
    if (this.pointers.size === 0) this.hadTwo = false;
    return pinch;
  }
}
