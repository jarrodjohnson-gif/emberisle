// Camera fit and pan-zoom bounds regression guards.
// Ensures all dimensions, aspect ratios, zoom limits, and pan offsets remain finite and bounded.
import assert from "node:assert/strict";
import {
  guardDioramaFit,
  guardOrthoFit,
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
  TouchGestureTracker,
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

// 4. guardOrthoFit guards
const badOrtho = guardOrthoFit({ left: NaN, right: NaN, top: NaN, bottom: NaN, x: NaN, z: NaN, lean: NaN });
check(Number.isFinite(badOrtho.left) && Number.isFinite(badOrtho.right), "guardOrthoFit restores finite horizontal bounds");
check(Number.isFinite(badOrtho.top) && Number.isFinite(badOrtho.bottom), "guardOrthoFit restores finite vertical bounds");
check(badOrtho.left < badOrtho.right && badOrtho.bottom < badOrtho.top, "guardOrthoFit maintains valid bounding box");
check(badOrtho.x === 0 && badOrtho.z === 0 && badOrtho.lean === 0, "guardOrthoFit clears NaN offsets and lean");

// 5. guardDioramaFit guards
const badDiorama = guardDioramaFit({ focal: NaN, dist: -5, cx: NaN, cy: NaN }, 800, 600);
check(badDiorama.focal === 300, "guardDioramaFit restores positive focal length");
check(badDiorama.dist === 24, "guardDioramaFit restores positive eye distance");
check(badDiorama.cx === 400 && badDiorama.cy === 300, "guardDioramaFit restores canvas center offsets");

// 6. fitOrtho with zero/negative/NaN dimensions
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

// 14. TouchGesture and TouchGestureTracker lifecycle guards
const touch = new TouchGesture();
touch.down(1, NaN, 10);
check(touch.pointers.size === 0, "TouchGesture ignores non-finite pointer coordinates");
touch.down(1, 10, 20);
touch.down(2, 30, 40);
check(touch.pointers.size === 2, "TouchGesture registers multiple pointers");
touch.cancel(1);
check(touch.pointers.size === 1, "TouchGesture cancel removes canceled pointer");
touch.reset();
check(touch.pointers.size === 0 && !touch.up(99), "TouchGesture reset clears pointers and pinch state");

const tracker = new TouchGestureTracker();
tracker.down(1, 10, 20);
tracker.down(2, 30, 40);
check(tracker.up(1), "TouchGestureTracker flags pinch on multi-touch lift");
tracker.reset();
check(tracker.pointers.size === 0, "TouchGestureTracker resets cleanly");

console.log(`camera-fit-guards-prove: ${passed} checks passed`);
