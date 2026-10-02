// #175: the phone camera fit and touch picking from docs/design/mobile-camera-touch.md, checked on the pure math
// in src/lib/scene/mobile-fit.ts (no browser). Run: npm run touch-place-prove
import assert from "node:assert/strict";
import {
  ISLE_HALF,
  PICK_VERTEX_RADIUS,
  fitOrtho,
  freeMaxDistance,
  hudInsets,
  isSelectTap,
  pickBest,
  tapSlop,
  TouchGesture,
} from "../src/lib/scene/mobile-fit.ts";

// Where a world point (x, z) lands in CSS pixels under the fitted overhead camera.
function project(f, w, h, x, z) {
  const sx = (x - f.x) / (f.right - f.left) + 0.5;
  const sy = (z - f.z) / (f.top - f.bottom) + 0.5; // screen-up is -Z, so +z moves down the screen
  return { x: sx * w, y: sy * h };
}

for (const [w, h] of [
  [390, 844],
  [844, 390],
]) {
  const ins = hudInsets(w, h, true);
  const f = fitOrtho(w, h, ins);
  const hole = { l: ins.left, r: w - ins.right, t: ins.top, b: h - ins.bottom };
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const p = project(f, w, h, sx * ISLE_HALF.x, sz * ISLE_HALF.z);
    const eps = 0.5;
    assert.ok(p.x >= hole.l - eps && p.x <= hole.r + eps && p.y >= hole.t - eps && p.y <= hole.b + eps, `${w}x${h}: island corner (${sx},${sz}) at ${p.x.toFixed(1)},${p.y.toFixed(1)} is outside the hole`);
  }
  const c = project(f, w, h, 0, 0);
  assert.ok(Math.abs(c.x - (hole.l + hole.r) / 2) < 1 && Math.abs(c.y - (hole.t + hole.b) / 2) < 1, `${w}x${h}: island center is not at the hole center`);
  console.log(`${w}x${h}: island fits the hole, centered`);
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
