// Camera fit and touch picking for phones (docs/design/mobile-camera-touch.md, issue #171). Pure math, no THREE
// imports, so scripts/touch-place-prove.mjs can run it directly.

// Half-extent of the island plus its docks, padded for all corners and docks, in world units (HEX_SIZE 1.12).
export const ISLE_HALF = { x: 5.8, z: 5.4 };

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
  const bandWidth = Math.min(cssW / 2, 480);
  const bands = chrome.filter((r) => r.right - r.left >= bandWidth);
  const rails = chrome.filter((r) => r.right - r.left < bandWidth);
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
  const top = onEdge(bands.filter((r) => (r.top + r.bottom) / 2 < cssH / 2), (r) => r.top, (r) => r.bottom, safe.top).edge;
  const bottom = onEdge(bands.filter((r) => (r.top + r.bottom) / 2 > cssH / 2), (r) => cssH - r.bottom, (r) => cssH - r.top, safe.bottom).edge;
  const rail = (side: ReturnType<typeof onEdge>) => {
    if (!side.found.length) return 0;
    const span = Math.max(...side.found.map((r) => r.bottom)) - Math.min(...side.found.map((r) => r.top));
    return span >= Math.min(cssH / 4, 132) ? side.edge : 0;
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

// The hole the island is fitted to in play (#625): a declared table of the HUD's persistent footprint, not a measure of whatever
// is on screen. Everything else (the Fortunes tray, the chat, the trade sheet and offers, the PlaceList, the discard and take
// bars, toasts) overlays the board and never counts, so opening or closing one never moves the map. The footprint is the
// largest of the roll, main and robber layouts, measured at the sizes below with the HUD at rest (`insets()` against the
// live `liveInsets()` in rotate-prove and pan-prove keeps it honest). `safe` is added to the sides the HUD is inset from.
// A phone upright: the top bar over a bottom tray, taller on a narrow phone (the action row wraps up to TRAY_WRAP_MAX).
// A phone on its side: a 284 px column on the left. A desktop: the seat rail on the left, and, from RAIL_FROM to RAIL_FULL px
// wide, the docked right rail (chat, offer, PlaceList: 312 px) and the offer's taller bottom stack (220 px) ramp in.
// The widest upright phone whose main-phase action row takes two lines: styles.css forces the wrap up to here and forbids it above.
// The declared bottom carries 4 px for sub-pixel font differences. #1509: the upright build row lost its 4 px tray padding
// above and below, so the upright bottoms are 8 px lower than the 322 / 274 they were.
// A desktop tray carries 6 px more at the top for the +N / -N pill (#825: 22 to 28 px), so its bottom is 186, not 180.
export const TRAY_WRAP_MAX = 400;
const RAIL_FROM = 960;
const RAIL_FULL = 1024;
export function playHole(cssW: number, cssH: number, phone: boolean, safe: Partial<Insets> = {}): Insets {
  let i: Insets;
  // #1539 one tray: the upright tray is one height at every width (measured 228 px with its 12 px gap), so the action
  // row no longer wraps on a narrow phone. It was 318 up to 400 px wide and 270 above.
  if (phone && cssH > cssW) i = { top: 68, right: 12, bottom: 228 + 4, left: 12 };
  else if (phone) i = { top: 68, right: 12, bottom: 12, left: 284 };
  else {
    const t = Math.min(1, Math.max(0, (cssW - RAIL_FROM) / (RAIL_FULL - RAIL_FROM)));
    // #1539: the desktop tray is one row, the hand beside the buttons (measured 164 px with its gaps); it was 186, or 226 with the rail.
    i = { top: 68, right: 12 + 300 * t, bottom: 164 + 4, left: 216 };
  }
  return { top: i.top + Math.max(0, (safe.top ?? 0) - 12), right: i.right + (safe.right ?? 0), bottom: i.bottom + (safe.bottom ?? 0), left: i.left + (safe.left ?? 0) };
}

// `lean` is the polar angle the fit was made for, so the eye goes home to it.
export type OrthoFit = { left: number; right: number; top: number; bottom: number; x: number; z: number; lean: number };

// The overhead camera leans this far off straight down, toward the player (#135, polish.md "The board look target"):
// the slabs show a side and the trees a silhouette, like a board seen by someone leaning over the table, while a
// token still reads as a disc. It looks at cap level; the tallest prop (a pine) rises LEAN_RISE above that, and the
// far row's tree tops lift up-screen by that much times sin(lean), so the frustum keeps the room.
export const OVERHEAD_LEAN = (25 * Math.PI) / 180;
export const CAP_LEVEL = 0.35;
const LEAN_RISE = 1.15;

// #1509 (option A, owner card q1508-table-goal): on an upright phone the island fills the width. The shore is the coast's
// pale foam band, 0.42 past the outer hex edges (isle-renderer's foam strip); the middle row's coast is 2.5 hex widths from
// the centre. The shore comes to EDGE_GAP px from each screen edge (422 px of 430). A side dock's boat reaches further
// (DOCK_HALF_X, below) and runs off the screen edge: the owner chose that (card q1515-table-look, B, "crop the side boats,
// keep every dock button on screen"); DockInspection keeps each dock's 44 px button on screen. No corner, number or piece
// leaves the hole.
export const SHORE_HALF_X = 2.5 * Math.sqrt(3) * 1.12 + 0.42;
export const EDGE_GAP = 4;
// #1509: the goods pile on a pier (#846, 2.5x) stays wholly on screen even where the boat beside it is cropped; it is part of
// the dock, not the boat. The outermost pile reaches 5.72 world units across (harbor-jelly's packed goods, measured over
// eight seeds on a side dock); PILE_HALF_X holds that with a little room, and the fit never puts it past PILE_GAP px from
// the screen edge. Where the piles bind, the shore stops a few pixels short of EDGE_GAP.
export const PILE_HALF_X = 5.75;
export const PILE_GAP = 2;
// #1509: the upright phone's default lean. The owner found the 25° board hard to see and always tilted it; 40° shows the
// slabs' sides and the pieces standing, while a number token still reads as a disc. Only depth shrinks (by cos), and an
// upright phone has height to spare: its island is bound by the width.
export const UPRIGHT_LEAN = (40 * Math.PI) / 180;

// The overhead fit in play: on an upright phone the shore spans the screen and the island sits low in the hole, nearer
// the thumb (`edge`); elsewhere the island and its docks are centred in the hole. The renderer and the proofs share this.
export function playOrtho(cssW: number, cssH: number, insets: Insets, phone: boolean, isle?: IsleShape): OrthoFit {
  const upright = phone && cssH > cssW;
  return fitOrtho(cssW, cssH, insets, upright ? UPRIGHT_LEAN : OVERHEAD_LEAN, upright, isle);
}
export function playLean(cssW: number, cssH: number, phone: boolean) {
  return phone && cssH > cssW ? UPRIGHT_LEAN : OVERHEAD_LEAN;
}

// Overhead frustum sized to the island inside the hole, then the camera's look-at point is shifted so the world center
// lands at the hole center. Screen-up is -Z, screen-right is +X. `lean` is radians off straight down; it shortens the
// island's screen depth by cos(lean), so a screen shift on the ground is that much longer.
// `edge` (#1509): the shore spans the canvas's width less EDGE_GAP each side (past the hole's 12 px sides), unless that would
// take a goods pile off the screen or the island and its docks past the hole's height; the island sits at the hole's bottom edge instead of its centre.
// #1607: `isle` gives the island's measured extents; the fit is about its middle (the renderer adds (isle.cx, isle.cz)).
export function fitOrtho(cssW: number, cssH: number, insets: Insets, lean = 0, edge = false, isle = CLASSIC_ISLE): OrthoFit {
  const halfZ = isle.half.z * Math.cos(lean) + LEAN_RISE * Math.sin(lean);
  if (edge) {
    const sides = { left: Math.max(EDGE_GAP, insets.left - 12 + EDGE_GAP), right: Math.max(EDGE_GAP, insets.right - 12 + EDGE_GAP) };
    const holeW = Math.max(1, cssW - sides.left - sides.right);
    const holeH = Math.max(1, cssH - insets.top - insets.bottom);
    // A hole too short for that (a 375x667 phone) scales the island to its height instead, which is then centred in it.
    const px = Math.min(holeW / (2 * isle.shoreHalfX), (cssW / 2 - PILE_GAP) / isle.pileHalfX, holeH / (2 * halfZ));
    const hw = cssW / 2 / px;
    const hh = cssH / 2 / px;
    const cx = sides.left + holeW / 2;
    const cy = cssH - insets.bottom - halfZ * px;
    const ndcX = (cx / cssW) * 2 - 1;
    const ndcY = -((cy / cssH) * 2 - 1);
    return { left: -hw, right: hw, top: hh, bottom: -hh, x: -ndcX * hw, z: (ndcY * hh) / Math.cos(lean), lean };
  }
  const holeW = Math.max(1, cssW - insets.left - insets.right);
  const holeH = Math.max(1, cssH - insets.top - insets.bottom);
  const aspect = holeW / holeH;
  const halfX = isle.half.x;
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
    // Centered on the island's middle, not the 0.15 orbit target: its extents are symmetric about it.
    x: -ndcX * worldW * 0.5,
    z: (ndcY * worldH * 0.5) / Math.cos(lean),
    lean,
  };
}

// The diorama view (#597), the default in play on a landscape canvas: a perspective camera 38° above the horizon (polar
// 52°), turned 20° off the island's north, looking at cap level over the island's centre. The lens is shifted so the island
// sits in the HUD hole, and the focal length gives DIORAMA_FOV across the hole's height; the fit is the distance at which
// the coast spans COAST_FILL of the hole on its limiting axis, or, if that would push a dock or a tree top past the hole's
// edge, the distance that just holds them. Orbit and zoom work as in the overhead view, around the island's centre.
export type PlayView = "diorama" | "overhead";
export const DIORAMA_POLAR = (52 * Math.PI) / 180;
export const DIORAMA_AZIMUTH = (20 * Math.PI) / 180;
export const DIORAMA_FOV = (24 * Math.PI) / 180;
// How far the docks' piers and boats reach past a coast corner, in world units.
const DOCK_REACH = 0.7;
const COAST_FILL = 0.94;

// The view in play when the player has not chosen one: the diorama on a landscape canvas at least DIORAMA_MIN_WIDTH wide,
// overhead otherwise. Upright, the width-bound island is small and a tilt would crowd its far corners; on a sideways phone
// the tokens, held to 38 % of a hex, read under the 11 px numeral floor in the diorama (docs/design/tokens.md "Angle").
export const DIORAMA_MIN_WIDTH = 900;
export const DIORAMA_MIN_HOLE = 420;
export function defaultView(cssW: number, cssH: number, phone = false): PlayView {
  // The diorama also needs a hole at least DIORAMA_MIN_HOLE tall (#625): in a shorter one its numerals fall under the 11 px floor.
  const hole = playHole(cssW, cssH, phone);
  return cssH > cssW || cssW < DIORAMA_MIN_WIDTH || cssH - hole.top - hole.bottom < DIORAMA_MIN_HOLE ? "overhead" : "diorama";
}

// The island's coast corners (19 hexes, |q|,|r|,|s| <= 2, pointy-top at HEX_SIZE 1.12): a corner shared by fewer than three
// hexes. Inlined from src/lib/game/hex.ts so this file stays importable by the node proofs. (mx, mz) is the renderer's coast
// miter (coastLoop): away from the mean of the corner's hexes' centres, the bisector of its two coast edges' normals, scaled
// by 1 / cos 30° so an offset along it keeps that distance from both edges.
const COAST: { x: number; z: number; mx: number; mz: number }[] = (() => {
  const size = 1.12;
  const seen = new Map<string, { x: number; z: number; n: number; sx: number; sz: number }>();
  for (let q = -2; q <= 2; q++) {
    for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
      const cx = size * Math.sqrt(3) * (q + r / 2);
      const cz = size * 1.5 * r;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const x = cx + size * Math.cos(a);
        const z = cz + size * Math.sin(a);
        const k = `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
        const v = seen.get(k) ?? { x, z, n: 0, sx: 0, sz: 0 };
        v.n++;
        v.sx += cx;
        v.sz += cz;
        seen.set(k, v);
      }
    }
  }
  return [...seen.values()]
    .filter((v) => v.n < 3)
    .map(({ x, z, n, sx, sz }) => {
      const [dx, dz] = [x - sx / n, z - sz / n];
      const k = 1 / Math.hypot(dx, dz) / Math.cos(Math.PI / 6);
      return { x, z, mx: dx * k, mz: dz * k };
    });
})();

// The centres of the outer ring's 12 hexes.
const OUTER_RING: { x: number; z: number }[] = [];
for (let q = -2; q <= 2; q++) {
  for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 2) OUTER_RING.push({ x: 1.12 * Math.sqrt(3) * (q + r / 2), z: 1.12 * 1.5 * r });
  }
}

// What the diorama fit measures: each coast corner at cap level, and (held inside the hole) a dock's reach past it at the
// waterline and the tallest prop's top wherever one can stand on the outer ring: up to 0.86 from its hex's centre
// (decorate's tree ring) and LEAN_RISE over cap level.
// #1509: how far across a dock's pier and boat can reach, at any coast corner (the diorama fit's DOCK_REACH along its miter).
// The upright fit lets it pass the screen's side edges (q1515-table-look, B); proofs use it.
export const DOCK_HALF_X = Math.max(...COAST.map(({ x, mx }) => Math.abs(x + mx * DOCK_REACH)));
type Pt = [number, number, number];
type CoastPt = { x: number; z: number; mx: number; mz: number };
const coastPoints = (coast: CoastPt[]) => coast.map(({ x, z }): Pt => [x, CAP_LEVEL, z]);
const dioramaPoints = (coast: CoastPt[], ring: { x: number; z: number }[]): Pt[] => [
  ...coast.flatMap(({ x, z, mx, mz }): Pt[] => [
    [x, CAP_LEVEL, z],
    [x + mx * DOCK_REACH, 0.1, z + mz * DOCK_REACH],
  ]),
  ...ring.flatMap(({ x, z }) =>
    Array.from({ length: 12 }, (_, i): Pt => [x + 0.86 * Math.cos((i * Math.PI) / 6), CAP_LEVEL + LEAN_RISE, z + 0.86 * Math.sin((i * Math.PI) / 6)]),
  ),
];

// #1607 (docs/design/six-players.md, "Board generator, coast, docks, and camera"): the island the fits measure. The classic
// island is the constants above. Another island (the expanded one) is measured from the renderer's coast loop and the
// centres of its hexes that touch the coast, taken from (cx, cz), the middle of its hex centres' bounds: the fits centre that
// point, and the renderer looks at it. Its `half`, `shoreHalfX` and `pileHalfX` are the classic constants plus
// how much farther its coast reaches than the classic coast on that axis, so it keeps the classic padding for its docks,
// piles and trees; `grow` is the larger of the two gains (the visitors' lanes and the pan reach out by it).
export type IsleShape = {
  cx: number;
  cz: number;
  half: { x: number; z: number };
  shoreHalfX: number;
  pileHalfX: number;
  grow: number;
  coastPoints: Pt[];
  dioramaPoints: Pt[];
};
export const CLASSIC_ISLE: IsleShape = {
  cx: 0,
  cz: 0,
  half: ISLE_HALF,
  shoreHalfX: SHORE_HALF_X,
  pileHalfX: PILE_HALF_X,
  grow: 0,
  coastPoints: coastPoints(COAST),
  dioramaPoints: dioramaPoints(COAST, OUTER_RING),
};
const reach = (coast: CoastPt[], k: "x" | "z") => Math.max(...coast.map((c) => Math.abs(c[k])));
export function isleShape(coast: CoastPt[], ring: { x: number; z: number }[], cx: number, cz: number): IsleShape {
  const local = coast.map((c) => ({ ...c, x: c.x - cx, z: c.z - cz }));
  const gx = reach(local, "x") - reach(COAST, "x");
  const gz = reach(local, "z") - reach(COAST, "z");
  return {
    cx,
    cz,
    half: { x: ISLE_HALF.x + gx, z: ISLE_HALF.z + gz },
    shoreHalfX: SHORE_HALF_X + gx,
    pileHalfX: PILE_HALF_X + gx,
    grow: Math.max(gx, gz),
    coastPoints: coastPoints(local),
    dioramaPoints: dioramaPoints(local, ring.map((r) => ({ x: r.x - cx, z: r.z - cz }))),
  };
}

// focal: px per unit of tan at the lens; dist: the eye's distance from the look-at point at zoom 1; cx, cy: where the lens
// axis meets the canvas, in CSS px from its top left.
export type DioramaFit = { focal: number; dist: number; cx: number; cy: number };

// Where a world point lands on the canvas, in CSS px, for a diorama eye `dist` from (0, CAP_LEVEL, 0) at polar and azimuth
// (three's Spherical: +Y up, azimuth from +Z toward +X). `depth` is along the lens axis.
export function dioramaProject(f: DioramaFit, polar: number, azimuth: number, x: number, y: number, z: number, dist = f.dist) {
  const ex = Math.sin(polar) * Math.sin(azimuth);
  const ey = Math.cos(polar);
  const ez = Math.sin(polar) * Math.cos(azimuth);
  const rl = Math.hypot(ez, ex);
  const [rx, rz] = [ez / rl, -ex / rl];
  // up = e x right
  const ux = ey * rz;
  const uy = ez * rx - ex * rz;
  const uz = -ey * rx;
  const vy = y - CAP_LEVEL;
  const xc = x * rx + z * rz;
  const yc = x * ux + vy * uy + z * uz;
  const depth = dist - (x * ex + vy * ey + z * ez);
  return { x: f.cx + (f.focal * xc) / depth, y: f.cy - (f.focal * yc) / depth, depth };
}

export function fitDiorama(cssW: number, cssH: number, insets: Insets, polar = DIORAMA_POLAR, azimuth = DIORAMA_AZIMUTH, isle = CLASSIC_ISLE): DioramaFit {
  const holeW = Math.max(1, cssW - insets.left - insets.right);
  const holeH = Math.max(1, cssH - insets.top - insets.bottom);
  const focal = holeH / 2 / Math.tan(DIORAMA_FOV / 2);
  const span = (dist: number, pts = isle.dioramaPoints) => {
    const lens = { focal, dist, cx: 0, cy: 0 };
    let [l, r, t, b] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y, z] of pts) {
      const p = dioramaProject(lens, polar, azimuth, x, y, z);
      [l, r, t, b] = [Math.min(l, p.x), Math.max(r, p.x), Math.min(t, p.y), Math.max(b, p.y)];
    }
    return { l, r, t, b, over: Math.max((r - l) / holeW, (b - t) / holeH) };
  };
  // The island's size on screen falls as the eye backs off: bisect for the distance where a span just fills `fill`.
  const fit = (fill: number, pts?: [number, number, number][]) => {
    let lo = 8;
    let hi = 400;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (span(mid, pts).over > fill) lo = mid;
      else hi = mid;
    }
    return hi;
  };
  const dist = Math.max(fit(COAST_FILL, isle.coastPoints), fit(1));
  const s = span(dist);
  return {
    focal,
    dist,
    cx: insets.left + holeW / 2 - (s.l + s.r) / 2,
    cy: insets.top + holeH / 2 - (s.t + s.b) / 2,
  };
}

// The pick reach around a legal corner or path in the diorama view, in world units, for a ray that meets it `depth` along
// the lens axis: at least `px` CSS px on screen there (a far corner is smaller than a near one), never less than the
// overhead pick volume, and under half the corner spacing so two corners never share a pick.
export const PICK_MAX = 0.5;
export function pickReach(depth: number, focal: number, coarse: boolean, floor = PICK_VERTEX_RADIUS): number {
  const px = coarse ? 14 : 8;
  return Math.min(PICK_MAX, Math.max(floor, (px * depth) / focal));
}

const FOV = (32 * Math.PI) / 180;

// Free-mode farthest dolly: far enough to see the whole isle inside the hole, never below 18. Desktop keeps 18
// exactly (the design's own formula gives ~29 there, which would change the shipped desktop view); the design's
// worked values 23.6 / 26.4 disagree with its formula, so the formula wins: 31.0 portrait (top inset 116 with the #177 seat strip); landscape hits the 36 cap.
export function freeMaxDistance(cssH: number, insets: Insets, coarse: boolean, isle = CLASSIC_ISLE): number {
  if (!coarse) return 18;
  const usable = Math.max(1, cssH - insets.top - insets.bottom) / cssH;
  const d = (isle.half.z * 2) / usable / (2 * Math.tan(FOV / 2));
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
