// #175: the phone camera fit and touch picking from docs/design/mobile-camera-touch.md, checked on the pure math
// in src/lib/scene/mobile-fit.ts (no browser). The fit is taken through the leaned overhead camera (#135,
// docs/design/camera-light.md), and the HUD hole from measured chrome rects. Run: npm run touch-place-prove
import assert from "node:assert/strict";
import {
  CAP_LEVEL,
  DIORAMA_AZIMUTH,
  DIORAMA_POLAR,
  ISLE_HALF,
  OVERHEAD_LEAN,
  PICK_MAX,
  PICK_VERTEX_RADIUS,
  chromeInsets,
  defaultView,
  dioramaProject,
  fitDiorama,
  fitOrtho,
  freeMaxDistance,
  hudInsets,
  isSelectTap,
  pickBest,
  pickReach,
  tapSlop,
  TouchGesture,
} from "../src/lib/scene/mobile-fit.ts";

// Where a world point lands in CSS pixels under the fitted overhead camera, leaned `lean` off straight down toward +Z and
// looking at (f.x, CAP_LEVEL, f.z): depth foreshortens by cos(lean), height lifts up-screen by sin(lean).
function project(f, w, h, x, y, z, lean) {
  const sx = (x - f.x) / (f.right - f.left) + 0.5;
  const up = -(z - f.z) * Math.cos(lean) + (y - CAP_LEVEL) * Math.sin(lean);
  const sy = -up / (f.top - f.bottom) + 0.5;
  return { x: sx * w, y: sy * h };
}

const LEAN_RISE = 1.15; // the tallest prop, a pine, over cap level
for (const [w, h] of [
  [390, 844],
  [844, 390],
  [1280, 720],
]) {
  const ins = hudInsets(w, h, w < 1000);
  const f = fitOrtho(w, h, ins, OVERHEAD_LEAN);
  const hole = { l: ins.left, r: w - ins.right, t: ins.top, b: h - ins.bottom };
  const eps = 0.5;
  const inHole = (p) => p.x >= hole.l - eps && p.x <= hole.r + eps && p.y >= hole.t - eps && p.y <= hole.b + eps;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const p = project(f, w, h, sx * ISLE_HALF.x, CAP_LEVEL, sz * ISLE_HALF.z, OVERHEAD_LEAN);
    assert.ok(inHole(p), `${w}x${h}: island corner (${sx},${sz}) at ${p.x.toFixed(1)},${p.y.toFixed(1)} is outside the hole`);
  }
  // The far row's tree tops lift up-screen under the lean; the frustum keeps that room.
  const tree = project(f, w, h, 0, CAP_LEVEL + LEAN_RISE, -ISLE_HALF.z, OVERHEAD_LEAN);
  assert.ok(inHole(tree), `${w}x${h}: a far pine top at ${tree.y.toFixed(1)} is above the hole (${hole.t})`);
  const c = project(f, w, h, 0, CAP_LEVEL, 0, OVERHEAD_LEAN);
  assert.ok(Math.abs(c.x - (hole.l + hole.r) / 2) < 1 && Math.abs(c.y - (hole.t + hole.b) / 2) < 1, `${w}x${h}: island center at ${c.x.toFixed(1)},${c.y.toFixed(1)} is not at the hole center ${(hole.l + hole.r) / 2},${(hole.t + hole.b) / 2}`);
  console.log(`${w}x${h}: leaned island fits the hole, centered`);
}
// The diorama view (#597), the default in play on a landscape screen: 38° above the horizon, 20° off north, fitted to the
// same holes (the measured ones from the HUD: desktop, the sideways phone's left column, with and without an offer open;
// portrait too, for a player who chooses it there). Every coast corner, every dock's reach (0.7 past its corner at the
// waterline) and every tree top the outer ring can hold (0.86 from a hex centre, 1.15 over cap level) lands in the hole;
// the coast spans at least 94 % of the hole on its limiting axis unless that would push a dock or a tree top past the edge,
// in which case those touch it. On a landscape screen, adjacent corners stay at least 18 px apart.
{
  const coast = [];
  const ring = [];
  const seen = new Map();
  for (let q = -2; q <= 2; q++)
    for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
      const [cx, cz] = [1.12 * Math.sqrt(3) * (q + r / 2), 1.12 * 1.5 * r];
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 2) ring.push({ x: cx, z: cz });
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const x = cx + 1.12 * Math.cos(a);
        const z = cz + 1.12 * Math.sin(a);
        const k = `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
        const v = seen.get(k) ?? { x, z, n: 0, sx: 0, sz: 0 };
        seen.set(k, { ...v, n: v.n + 1, sx: v.sx + cx, sz: v.sz + cz });
      }
    }
  for (const v of seen.values()) if (v.n < 3) coast.push(v);
  assert.equal(coast.length, 30, "30 coast corners");
  assert.equal(defaultView(1280, 720), "diorama", "desktop defaults to the diorama");
  assert.equal(defaultView(844, 390), "diorama", "a sideways phone defaults to the diorama");
  assert.equal(defaultView(390, 844), "overhead", "an upright phone defaults to overhead");
  for (const [w, h, ins, tag] of [
    [1280, 720, { top: 68, right: 12, bottom: 180, left: 200 }, "desktop"],
    [1280, 720, { top: 68, right: 12, bottom: 240, left: 200 }, "desktop, offer open"],
    [844, 390, { top: 68, right: 12, bottom: 12, left: 284 }, "sideways"],
    [390, 844, { top: 68, right: 12, bottom: 270, left: 12 }, "portrait (by choice)"],
  ]) {
    const f = fitDiorama(w, h, ins);
    const hole = { l: ins.left, r: w - ins.right, t: ins.top, b: h - ins.bottom, w: w - ins.left - ins.right, h: h - ins.top - ins.bottom };
    const at = (x, y, z) => dioramaProject(f, DIORAMA_POLAR, DIORAMA_AZIMUTH, x, y, z);
    const shore = coast.map(({ x, z }) => at(x, CAP_LEVEL, z));
    // A dock reaches 0.7 along the coast miter (the renderer's coastLoop: the bisector of the corner's two coast edges'
    // normals, which is away from the mean of its hexes' centres, at 1 / cos 30° so it keeps 0.7 from both edges).
    const docks = coast.map(({ x, z, sx, sz, n }) => {
      const [dx, dz] = [x - sx / n, z - sz / n];
      const k = 0.7 / Math.hypot(dx, dz) / Math.cos(Math.PI / 6);
      return at(x + dx * k, 0.1, z + dz * k);
    });
    const trees = ring.flatMap(({ x, z }) => Array.from({ length: 12 }, (_, i) => at(x + 0.86 * Math.cos((i * Math.PI) / 6), CAP_LEVEL + 1.15, z + 0.86 * Math.sin((i * Math.PI) / 6))));
    const all = [...shore, ...docks, ...trees];
    const out = all.filter((p) => p.x < hole.l - 0.5 || p.x > hole.r + 0.5 || p.y < hole.t - 0.5 || p.y > hole.b + 0.5);
    assert.deepEqual(out, [], `${w}x${h} ${tag}: every corner, tree top and dock inside the hole`);
    const fill = (pts) => {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return Math.max((Math.max(...xs) - Math.min(...xs)) / hole.w, (Math.max(...ys) - Math.min(...ys)) / hole.h);
    };
    const [coastFill, allFill] = [fill(shore), fill(all)];
    assert.ok(coastFill > 0.935 || allFill > 0.995, `${w}x${h} ${tag}: the coast fills ${coastFill.toFixed(3)} of the hole, docks and tree tops ${allFill.toFixed(3)}`);
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - (hole.l + hole.r) / 2) < 0.5 && Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - (hole.t + hole.b) / 2) < 0.5, `${w}x${h} ${tag}: centred in the hole`);
    // The far (north) corners are smaller on screen than the near ones, and a corner-to-corner step along the line of sight
    // is foreshortened by the tilt. On a landscape screen they stay 18 px apart (the overhead view keeps 24; a tap dead on a
    // corner is still outside its neighbour's 14 px touch reach). Portrait is overhead by default and only reported here.
    const corners = [...seen.values()];
    const apart = Math.min(...corners.flatMap((a) => corners.filter((c) => c !== a && Math.hypot(c.x - a.x, c.z - a.z) < 1.2).map((c) => {
      const [p, q] = [at(a.x, CAP_LEVEL, a.z), at(c.x, CAP_LEVEL, c.z)];
      return Math.hypot(p.x - q.x, p.y - q.y);
    })));
    if (w > h) assert.ok(apart >= 18, `${w}x${h} ${tag}: adjacent corners ${apart.toFixed(1)} px apart`);
    console.log(`${w}x${h} ${tag}: diorama fit at ${f.dist.toFixed(1)} units, coast fills ${coastFill.toFixed(3)} (docks and tree tops ${allFill.toFixed(3)}), adjacent corners >= ${apart.toFixed(1)} px`);
  }
  // The pick reach grows with depth (a far corner is smaller on screen), never under the overhead volume and never as far
  // as half the corner spacing, so two corners never share a pick.
  const f = fitDiorama(844, 390, { top: 68, right: 12, bottom: 12, left: 284 });
  const near = pickReach(f.dist - 4, f.focal, true);
  const far = pickReach(f.dist + 4, f.focal, true);
  assert.ok(far > near && near >= PICK_VERTEX_RADIUS && 2 * PICK_MAX < 1.12, `pick reach ${near.toFixed(3)} near, ${far.toFixed(3)} far`);
  assert.ok(Math.abs((far * f.focal) / (f.dist + 4) - 14) < 1e-9 || far === PICK_MAX, "a touch reaches 14 px around a far corner");
  assert.equal(pickReach(1, 1000, false), PICK_VERTEX_RADIUS, "a near mouse pick keeps the overhead volume");
  console.log(`diorama pick reach at 844x390, touch: ${near.toFixed(3)} near, ${far.toFixed(3)} far (14 px)`);
}

// Straight down, the shift is the plain one; leaned, the ground shift is longer by 1/cos(lean).
{
  const ins = { top: 100, right: 0, bottom: 300, left: 0 };
  const flat = fitOrtho(390, 844, ins, 0);
  const leaned = fitOrtho(390, 844, ins, OVERHEAD_LEAN);
  assert.ok(Math.abs(leaned.z * Math.cos(OVERHEAD_LEAN) - (leaned.top - leaned.bottom) / (flat.top - flat.bottom) * flat.z) < 1e-9, "the leaned shift is the screen shift over cos(lean)");
  console.log("leaned centre shift accounts for the lean");
}

// The hole from measured chrome: the desktop HUD (header chips, four seat cards down the left, the bottom stack, a chat
// button top right), then the phone (header, seat strip under it, hand bar, chat button). 12 px of room past the chrome.
{
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
  const desktop = [
    rect(128, 12, 1152, 58), // header
    rect(12, 80, 236, 142), rect(12, 150, 236, 212), rect(12, 220, 236, 282), rect(12, 290, 236, 352), // seat rail
    rect(256, 487, 1024, 708), // bottom stack
    rect(1224, 64, 1268, 108), // chat button: a lone button is no rail
    rect(-1, -1, 0, 0), // sr-only
  ];
  assert.deepEqual(chromeInsets(1280, 720, desktop), { top: 70, right: 12, bottom: 245, left: 248 }, "desktop hole");
  // The chat open: a 288 px column down the right is a rail.
  assert.equal(chromeInsets(1280, 720, [...desktop, rect(980, 64, 1268, 400)]).right, 312, "open chat is a right rail");
  // An armed-build banner sits under the header and extends the top chrome; a centred sheet and a backdrop count for nothing.
  assert.equal(chromeInsets(1280, 720, [...desktop, rect(12, 68, 1268, 110)]).top, 122, "a band under the header extends the top");
  assert.deepEqual(chromeInsets(1280, 720, [...desktop, rect(440, 160, 840, 560), rect(0, 0, 1280, 720)]), { top: 70, right: 12, bottom: 245, left: 248 }, "sheets and backdrops are ignored");
  const phone = [rect(12, 12, 378, 58), rect(12, 68, 378, 112), rect(12, 551, 378, 832), rect(334, 560, 378, 604)];
  assert.deepEqual(chromeInsets(390, 844, phone), { top: 124, right: 12, bottom: 305, left: 12 }, "phone hole");
  // No chrome at all: the safe area plus the room.
  assert.deepEqual(chromeInsets(390, 844, [], { top: 47, bottom: 34 }), { top: 59, right: 12, bottom: 46, left: 12 }, "bare edges keep the safe area");
  // Chrome on an edge already covers its safe area (the header pads for the notch itself).
  assert.equal(chromeInsets(390, 844, phone, { top: 47 }).top, 124, "a header already clear of the notch is not padded twice");
  // Chrome set in by the safe area still touches its edge (#422): the portrait HUD under a notch and over a home bar, and
  // the sideways phone's left column beside a notch. Before, each started 47 or 34 px in and counted for nothing.
  const notched = [rect(0, 59, 390, 103), rect(12, 115, 378, 159), rect(12, 500, 378, 810)];
  assert.deepEqual(chromeInsets(390, 844, notched, { top: 47, bottom: 34 }), { top: 171, right: 12, bottom: 356, left: 12 }, "a notched portrait HUD is chrome");
  const column = [rect(47, 12, 797, 56), rect(47, 68, 367, 369)];
  assert.deepEqual(chromeInsets(844, 390, column, { left: 47, right: 47, bottom: 21 }), { top: 68, right: 59, bottom: 33, left: 379 }, "a column beside the notch is a left rail");
  // At 667x375 the same column, set in 44 px, crosses the middle (44..364); its centre is still on the left.
  assert.deepEqual(chromeInsets(667, 375, [rect(44, 12, 623, 56), rect(44, 68, 364, 354)], { left: 44, right: 44, bottom: 21 }), { top: 68, right: 56, bottom: 33, left: 376 }, "a rail past the middle is on its centre's side");
  console.log("chrome insets: desktop 70/12/245/248, phone 124/12/305/12, rails need a quarter of the height, sheets ignored");
}

const near = (a, b) => Math.abs(a - b) < 0.1;
// The design's table says 23.6 / 26.4; its own formula (11.2 / usable / (2 tan 16 deg)) gives these.
assert.ok(near(freeMaxDistance(844, hudInsets(390, 844, true), true), 29.9), "portrait maxDistance");
assert.deepEqual(hudInsets(390, 844, true), { top: 116, right: 12, bottom: 196, left: 12 }, "portrait insets include the 44 px seat strip (#177)");
assert.ok(near(freeMaxDistance(390, hudInsets(844, 390, true), true), 36), "landscape maxDistance");
assert.equal(freeMaxDistance(720, hudInsets(1280, 720, false), false), 18);
console.log("free maxDistance: 29.9 portrait, 36 (capped) landscape, 18 desktop");

// Two legal vertices one HEX_SIZE apart; a ray 0.40 along from the midpoint toward A is 0.16 from A, 0.96 from B.
const SPACING = 1.12;
const mid = SPACING / 2;
const rayAt = mid + 0.4;
assert.ok(Math.abs(rayAt - SPACING) <= PICK_VERTEX_RADIUS, "A is hit");
assert.ok(Math.abs(rayAt - 0) > PICK_VERTEX_RADIUS, "B is not hit");
assert.ok(2 * PICK_VERTEX_RADIUS < SPACING, "two vertex spheres never overlap");
// A vertex sphere sitting on an edge box wins even when the edge is nearer.
assert.equal(pickBest([{ kind: "edge", id: "e", distance: 5 }, { kind: "vertex", id: "v", distance: 5.2 }, { kind: "hex", id: "h", distance: 4 }]).id, "v");
console.log("adjacent vertices and vertex-over-edge ranking ok");

assert.equal(tapSlop("mouse", false), 8);
assert.equal(tapSlop("touch", false), 24);
assert.equal(tapSlop("mouse", true), 24);
const isTap = (type, drag) => drag <= tapSlop(type, false);
assert.ok(isTap("touch", 20) && !isTap("touch", 30), "touch: 20 px is a tap, 30 px is a drag");
assert.ok(isTap("mouse", 8) && !isTap("mouse", 9));
console.log("slop: touch 20 px taps, 30 px does not; mouse stays 8");

assert.equal(isSelectTap(false, "mouse", null, "v1"), false, "desktop mouse places on one click");
assert.equal(isSelectTap(false, "touch", null, "v1"), true, "touch first tap selects");
assert.equal(isSelectTap(true, "touch", "v1", "v1"), false, "touch second tap on the same mark confirms");
assert.equal(isSelectTap(true, "touch", "v1", "v2"), true, "touch tap on another mark retargets");
console.log("tap-then-confirm rules ok");
// A pinch must not tap when either finger lifts, in either order, and the next single tap works again.
for (const order of [[1, 2], [2, 1]]) {
  const g = new TouchGesture();
  g.down(1, 0, 0);
  g.down(2, 50, 0);
  assert.equal(g.up(order[0]), true, `pinch: first lift (${order[0]}) is swallowed`);
  assert.equal(g.up(order[1]), true, `pinch: second lift (${order[1]}) is swallowed`);
  g.down(3, 0, 0);
  assert.equal(g.up(3), false, "a single tap after a pinch still taps");
}
{
  const g = new TouchGesture();
  g.down(1, 0, 0);
  g.down(2, 50, 0);
  g.up(1);
  g.down(3, 10, 10); // a third finger lands mid-gesture; still a pinch
  assert.equal(g.up(3), true);
  assert.equal(g.up(2), true);
  g.down(4, 0, 0);
  assert.equal(g.up(4), false);
}
console.log("pinch lifts never tap, the next single tap does");
console.log("touch place prove ok");
