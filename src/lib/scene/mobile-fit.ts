// Camera fit and touch picking for phones (docs/design/mobile-camera-touch.md, issue #171). Pure math, no THREE
// imports, so scripts/touch-place-prove.mjs can run it directly.

// Half-extent of the island plus its docks, padded 8%, in world units (HEX_SIZE 1.12).
export const ISLE_HALF = { x: 6.0, z: 5.6 };

export type Insets = { top: number; right: number; bottom: number; left: number };

export type Rect = { left: number; top: number; right: number; bottom: number };

// A chip this close to a canvas edge, or to chrome already counted on that edge, extends that edge's chrome (the HUD's
// own p-3 rhythm plus a little slack); the island keeps PAD of room from the chrome, or from the bare edge.
const CHROME_GAP = 16;
const CHROME_PAD = 12;

// The rectangle the HUD actually leaves for the island, from the rects of the chrome that takes pointer events (what a tap
// cannot pass through), so a taller phase bar or a rail never hides a corner. Wide chips (at least half the canvas) are bands
// and stack from the top or bottom edge, each one that touches the edge or the band before it; narrower ones that touch the
// left or right edge the same way are a rail when together they span at least a quarter of the canvas (a seat rail, an open
// chat), not a lone button. Floating chips (a toast, a centred sheet) and overlays that cover nearly everything (a dialog's
// backdrop) count for nothing. `safe` is the device's safe area, used where no chrome is.
export function chromeInsets(cssW: number, cssH: number, solids: Rect[], safe: Partial<Insets> = {}): Insets {
  const chrome = solids.filter((r) => {
    const w = r.right - r.left;
    const h = r.bottom - r.top;
    return w >= 2 && h >= 2 && w * h < 0.9 * cssW * cssH;
  });
  const bands = chrome.filter((r) => r.right - r.left >= cssW / 2);
  const rails = chrome.filter((r) => r.right - r.left < cssW / 2);
  // The chips on an edge: each within CHROME_GAP of the edge or of a chip already counted. `near` is a chip's distance
  // from the edge, `reach` how far from the edge it extends. The edge starts at the safe area, since the HUD keeps clear of
  // a notch or a home bar (#475): chrome set in by one still touches the edge.
  const onEdge = (chips: Rect[], near: (r: Rect) => number, reach: (r: Rect) => number, from = 0) => {
    const found: Rect[] = [];
    let edge = from;
    for (let again = true; again; ) {
      again = false;
      for (const r of chips) {
        if (!found.includes(r) && near(r) <= edge + CHROME_GAP) {
          found.push(r);
          edge = Math.max(edge, reach(r));
          again = true;
        }
      }
    }
    return { found, edge };
  };
  const top = onEdge(bands.filter((r) => r.bottom < cssH / 2), (r) => r.top, (r) => r.bottom, safe.top).edge;
  const bottom = onEdge(bands.filter((r) => r.top > cssH / 2), (r) => cssH - r.bottom, (r) => cssH - r.top, safe.bottom).edge;
  const rail = (side: ReturnType<typeof onEdge>) => {
    if (!side.found.length) return 0;
    const span = Math.max(...side.found.map((r) => r.bottom)) - Math.min(...side.found.map((r) => r.top));
    return span >= cssH / 4 ? side.edge : 0;
  };
  // A rail is on the side its centre is on: a column set in by a notch may cross the middle (#422, 667x375).
  const left = rail(onEdge(rails.filter((r) => r.left + r.right < cssW), (r) => r.left, (r) => r.right, safe.left));
  const right = rail(onEdge(rails.filter((r) => r.left + r.right > cssW), (r) => cssW - r.right, (r) => cssW - r.left, safe.right));
  const inset = (chrome: number, safe: number) => (chrome > 0 ? chrome : safe) + CHROME_PAD;
  return { top: inset(top, safe.top ?? 0), right: inset(right, safe.right ?? 0), bottom: inset(bottom, safe.bottom ?? 0), left: inset(left, safe.left ?? 0) };
}

// The design's HUD footprint (docs/design/mobile-camera-touch.md): the free camera's dolly limit on the title and the lobby,
// where there is no HUD to measure, and the fallback before one has been. `coarse` is matchMedia("(pointer: coarse)").
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

// Overhead frustum sized to the island inside the hole, then the camera's look-at point is shifted so the world center
// lands at the hole center. Screen-up is -Z, screen-right is +X. `lean` is radians off straight down; it shortens the
// island's screen depth by cos(lean), so a screen shift on the ground is that much longer.
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
    z: (ndcY * worldH * 0.5) / Math.cos(lean),
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
