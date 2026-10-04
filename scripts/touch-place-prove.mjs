// #175: the phone camera fit and touch picking from docs/design/mobile-camera-touch.md, checked on the pure math
// in src/lib/scene/mobile-fit.ts (no browser). The fit is taken through the leaned overhead camera (#135,
// docs/design/camera-light.md), and the HUD hole from measured chrome rects. Run: npm run touch-place-prove
import assert from "node:assert/strict";
import {
  CAP_LEVEL,
  ISLE_HALF,
  OVERHEAD_LEAN,
  PICK_VERTEX_RADIUS,
  chromeInsets,
  fitOrtho,
  freeMaxDistance,
  hudInsets,
  isSelectTap,
  pickBest,
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
  console.log("chrome insets: desktop 70/12/245/248, phone 124/12/305/12, rails need a quarter of the height, sheets ignored");
}

const near = (a, b) => Math.abs(a - b) < 0.1;
// The design's table says 23.6 / 26.4; its own formula (11.2 / usable / (2 tan 16 deg)) gives these.
assert.ok(near(freeMaxDistance(844, hudInsets(390, 844, true), true), 31.0), "portrait maxDistance");
assert.deepEqual(hudInsets(390, 844, true), { top: 116, right: 12, bottom: 196, left: 12 }, "portrait insets include the 44 px seat strip (#177)");
assert.ok(near(freeMaxDistance(390, hudInsets(844, 390, true), true), 36), "landscape maxDistance");
assert.equal(freeMaxDistance(720, hudInsets(1280, 720, false), false), 18);
console.log("free maxDistance: 31.0 portrait, 36 (capped) landscape, 18 desktop");

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
