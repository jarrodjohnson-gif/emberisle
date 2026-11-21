// Camera fit and pan-zoom bounds regression guards.
// Ensures all dimensions, aspect ratios, zoom limits, and pan offsets remain finite and bounded.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  safeAspect,
  safeDimension,
  safeInsets,
} from "../src/lib/scene/board-fit.ts";
import {
  clampZoom,
  glideProgress,
  safeEyeDistance,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../src/lib/scene/camera.ts";
import {
  calcPanLimit,
  clampPanOffset,
  PAN_RADIUS,
} from "../src/lib/scene/pan-zoom.ts";
import {
  fitDiorama,
  fitOrtho,
  freeMaxDistance,
  TouchGesture,
} from "../src/lib/scene/mobile-fit.ts";

let passed = 0;
function check(ok, desc) {
  assert.ok(ok, desc);
  passed++;
  console.log(`ok ${desc}`);
}

const zeroInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// 1. safeDimension guards
check(safeDimension(100) === 100, "safeDimension preserves valid positive number");
check(safeDimension(0, 42) === 42, "safeDimension replaces zero with fallback");
check(safeDimension(-10, 42) === 42, "safeDimension replaces negative with fallback");
check(safeDimension(NaN, 50) === 50, "safeDimension replaces NaN with fallback");
check(safeDimension(Infinity, 60) === 60, "safeDimension replaces Infinity with fallback");

// 2. safeAspect guards
check(Math.abs(safeAspect(800, 400) - 2) < 1e-6, "safeAspect computes valid aspect");
check(safeAspect(0, 0, 1) === 1, "safeAspect handles zero by zero gracefully");
check(safeAspect(NaN, 400, 1) === 1 / 400, "safeAspect replaces NaN numerator");
check(safeAspect(800, NaN, 1) === 800, "safeAspect replaces NaN denominator");

// 3. safeInsets guards
const sanitized = safeInsets({ top: 12, right: NaN, bottom: -5 });
check(sanitized.top === 12 && sanitized.right === 0 && sanitized.bottom === -5 && sanitized.left === 0, "safeInsets sanitizes missing and NaN fields");

// 4. fitOrtho with zero/negative/NaN dimensions
const zeroOrtho = fitOrtho(0, 0, zeroInsets);
check(Number.isFinite(zeroOrtho.x) && Number.isFinite(zeroOrtho.z), "fitOrtho with zero dimensions yields finite offsets");
check(zeroOrtho.left < zeroOrtho.right && zeroOrtho.bottom < zeroOrtho.top, "fitOrtho with zero dimensions yields valid frustum");

const edgeZeroOrtho = fitOrtho(0, 0, zeroInsets, 0, true);
check(Number.isFinite(edgeZeroOrtho.x) && Number.isFinite(edgeZeroOrtho.z), "fitOrtho edge mode with zero dimensions yields finite offsets");
check(edgeZeroOrtho.left < edgeZeroOrtho.right && edgeZeroOrtho.bottom < edgeZeroOrtho.top, "fitOrtho edge mode with zero dimensions yields valid frustum");

const nanOrtho = fitOrtho(NaN, NaN, zeroInsets);
check(Number.isFinite(nanOrtho.x) && Number.isFinite(nanOrtho.z), "fitOrtho with NaN dimensions yields finite offsets");
check(nanOrtho.left < nanOrtho.right && nanOrtho.bottom < nanOrtho.top, "fitOrtho with NaN dimensions yields valid frustum");

// 7. fitDiorama with NaN dimensions
const nanDiorama = fitDiorama(NaN, NaN, zeroInsets);
check(Number.isFinite(nanDiorama.focal) && nanDiorama.focal > 0, "fitDiorama with NaN dimensions yields positive focal");
check(Number.isFinite(nanDiorama.dist) && nanDiorama.dist > 0, "fitDiorama with NaN dimensions yields positive dist");
check(Number.isFinite(nanDiorama.cx) && Number.isFinite(nanDiorama.cy), "fitDiorama with NaN dimensions yields finite center");

// 8. freeMaxDistance guards
const nanDolly = freeMaxDistance(NaN, zeroInsets, true);
check(Number.isFinite(nanDolly) && nanDolly >= 18 && nanDolly <= 36, "freeMaxDistance with NaN height yields bounded distance");

// 9. clampZoom guards
check(clampZoom(1.5) === 1.5, "clampZoom preserves normal zoom");
check(clampZoom(0.2) === MIN_ZOOM, "clampZoom clamps underflow to MIN_ZOOM");
check(clampZoom(5.0) === MAX_ZOOM, "clampZoom clamps overflow to MAX_ZOOM");
check(clampZoom(NaN) === 1, "clampZoom replaces NaN with default zoom");
check(clampZoom(-1) === 1, "clampZoom replaces negative zoom with default zoom");

// 10. safeEyeDistance guards
check(Math.abs(safeEyeDistance(24, 2.0) - 12) < 1e-6, "safeEyeDistance scales eye distance by zoom");
check(Number.isFinite(safeEyeDistance(NaN, NaN)), "safeEyeDistance handles NaN distance and zoom");

// 11. glideProgress guards
const calmGlide = glideProgress(50, 0, 280, true);
check(calmGlide.done && calmGlide.u === 1 && calmGlide.e === 1, "glideProgress completes instantly under reduced motion");

const jitterGlide = glideProgress(-50, 0, 280, false);
check(jitterGlide.u === 0 && jitterGlide.e === 0 && !jitterGlide.done, "glideProgress clamps negative elapsed time to start");

const nanGlide = glideProgress(NaN, 0, 280, false);
check(nanGlide.done && nanGlide.u === 1 && nanGlide.e === 1, "glideProgress handles NaN timestamp cleanly");

const midGlide = glideProgress(140, 0, 280, false);
check(Math.abs(midGlide.u - 0.5) < 1e-6 && midGlide.e > 0.5 && !midGlide.done, "glideProgress eases mid-glide progress");

// 12. calcPanLimit guards
check(calcPanLimit(10, 0) === PAN_RADIUS, "calcPanLimit caps at PAN_RADIUS for large view");
check(calcPanLimit(2, 0) === 1.2, "calcPanLimit scales with short view half extent");
check(calcPanLimit(NaN, NaN) === 0, "calcPanLimit handles NaN inputs gracefully");

// 13. clampPanOffset guards
const inBounds = clampPanOffset(1, 1, 0, 0, 5);
check(!inBounds.clamped && inBounds.x === 1 && inBounds.z === 1, "clampPanOffset preserves position within pan radius");

const outBounds = clampPanOffset(10, 0, 0, 0, 5);
check(outBounds.clamped && Math.abs(outBounds.x - 5) < 1e-6 && outBounds.z === 0, "clampPanOffset constrains target to pan radius");

const nanPan = clampPanOffset(NaN, NaN, 2, 3, 5);
check(nanPan.clamped && nanPan.x === 2 && nanPan.z === 3, "clampPanOffset resets NaN target to home position");

// 14. TouchGesture pinch lifecycle and safeEyeDistance bounds
const touch = new TouchGesture();
touch.down(1, NaN, 10);
check(touch.pointers.size === 0, "TouchGesture ignores non-finite pointer coordinates");
touch.down(1, 10, 20);
touch.down(2, 30, 40);
check(touch.pointers.size === 2, "TouchGesture registers multiple pointers");
check(touch.up(1), "TouchGesture flags pinch on multi-touch lift");
touch.cancel(2);
check(touch.pointers.size === 0, "TouchGesture cancel clears canceled pointer");
touch.down(1, 10, 20);
touch.reset();
check(touch.pointers.size === 0 && !touch.up(99), "TouchGesture reset clears pointers and pinch state");

check(safeEyeDistance(NaN, 1) === 24, "safeEyeDistance defaults NaN distance to 24");
check(safeEyeDistance(12, NaN) === 12, "safeEyeDistance clamps NaN zoom to 1");
check(safeEyeDistance(-5, 0.5) === 24 / 0.8, "safeEyeDistance guards non-positive distance and clamps zoom");

// 15. Renderer wiring. IsleRenderer needs WebGL, so these read its source: each check fails if that line is removed.
const raw = readFileSync(new URL("../src/lib/scene/isle-renderer.ts", import.meta.url), "utf8");
// Strip comments so a commented-out line cannot satisfy a check.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
const body = (head) => {
  const at = src.indexOf(head);
  return at < 0 ? "" : src.slice(at, src.indexOf("\n  }\n", at));
};
const dispose = body("  dispose() {");
const applyPose = body("  private applyPose(p: Pose) {");
check(dispose.length > 100, "found IsleRenderer.dispose");
check(applyPose.length > 300, "found IsleRenderer.applyPose");
check(/^\s*this\.gesture\.reset\(\);/m.test(dispose), "dispose resets the touch gesture");
check(/^\s*this\.fingers\.clear\(\);/m.test(dispose), "dispose clears tracked fingers");
for (const t of ["focusin", "focusout"]) {
  check(dispose.includes(`this.parent.removeEventListener("${t}", this.remeasure)`), `dispose detaches parent ${t} listener`);
}
check(/GATE_EVENTS\) this\.parent\.removeEventListener\(t, this\.gate, true\)/.test(dispose), "dispose detaches parent gate listeners");
check(/this\.parent = canvas\.parentElement;/.test(src), "constructor keeps the canvas parent for the pinch gate");
check(/const zoom = clampZoom\(p\.zoom, this\.orbit\.minZoom, this\.orbit\.maxZoom\);/.test(applyPose), "applyPose clamps the pose zoom");
check(/const tx = Number\.isFinite\(p\.tx\) \? p\.tx : this\.isle\.cx;/.test(applyPose), "applyPose guards a non-finite tx");
check(/const tz = Number\.isFinite\(p\.tz\) \? p\.tz : this\.isle\.cz;/.test(applyPose), "applyPose guards a non-finite tz");
check(/const focal = Number\.isFinite\(p\.focal\) && p\.focal > 0 \? p\.focal : fullH \/ 2;/.test(applyPose), "applyPose falls back when focal is bad");
check(/const eyeDist = safeEyeDistance\(p\.dist, zoom\);/.test(applyPose), "applyPose computes the eye distance through safeEyeDistance");
check(/setFromSphericalCoords\(eyeDist, p\.polar, p\.azimuth\)/.test(applyPose), "diorama camera is placed at the guarded eye distance");
check(/o\.zoom = zoom;/.test(applyPose) && !/o\.zoom = p\.zoom/.test(applyPose), "ortho camera takes the clamped zoom");
check(/clampPanOffset\(t\.x, t\.z, home\.tx, home\.tz, this\.panLimit\(\)\)/.test(src), "pan clamp runs clampPanOffset against the home point");

console.log(`camera-fit-guards-prove: ${passed} checks passed`);
