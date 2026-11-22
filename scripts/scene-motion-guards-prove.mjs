// Scene animation and lifecycle guards for Wobble, LandingDust, and Bruno.
import assert from "node:assert/strict";
import * as THREE from "three";
import { Wobble } from "../src/lib/scene/wobble.ts";
import { LandingDust } from "../src/lib/scene/landing-dust.ts";
import { makeBruno } from "../src/lib/scene/bruno.ts";

let checks = 0;
function check(label, ok) {
  assert.ok(ok, label);
  checks++;
  console.log(`ok ${label}`);
}

const finiteVec = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

// 1. Wobble: normal curve, mid-wobble re-tap, board-rebuild object swap, expired start, and non-finite guards.
{
  const w = new Wobble();
  const tok = new THREE.Object3D();
  tok.position.set(1, 0.34, 2);
  w.start("h0", [tok], 0.04, 100);
  w.step(160);
  const mid = tok.scale.x;
  check("wobble swells on tap", mid > 1.01 && mid <= 1.031 && tok.position.y > 0.34);
  w.start("h0", [tok], 0.04, 180);
  w.step(185);
  check("mid-wobble re-tap on same object stays swollen", tok.scale.x > 1.005);
  w.step(500);
  check("wobble settles back to rest scale and height", tok.scale.x === 1 && Math.abs(tok.position.y - 0.34) < 1e-9);
}

{
  // Board rebuild swaps the Object3D for an existing hex id while the previous wobble is still live.
  const w = new Wobble();
  const oldTok = new THREE.Object3D();
  oldTok.position.set(0, 0.34, 0);
  const newTok = new THREE.Object3D();
  newTok.position.set(0, 0.34, 0);
  w.start("h0", [oldTok], 0.04, 100);
  w.step(140);
  assert.ok(oldTok.scale.x > 1.01);
  w.start("h0", [newTok], 0.04, 150);
  check("wobble restores replaced old object to rest", oldTok.scale.x === 1 && Math.abs(oldTok.position.y - 0.34) < 1e-9);
  w.step(190);
  check("wobble animates new rebuilt object instead of stale old object", newTok.scale.x > 1.01 && oldTok.scale.x === 1);
  w.step(450);
  check("rebuilt object settles cleanly back to rest", newTok.scale.x === 1 && Math.abs(newTok.position.y - 0.34) < 1e-9);
}

{
  // Re-tap after elapsed duration before step() runs starts fresh with new objects and never poisons on NaN.
  const w = new Wobble();
  const a = new THREE.Object3D();
  a.position.set(0, 0.34, 0);
  w.start("h1", [a], 0.04, 100);
  w.step(140);
  w.start("h1", [a], 0.04, 500);
  check("expired start before step() restores rest before restarting", a.scale.x === 1 && Math.abs(a.position.y - 0.34) < 1e-9);
  w.step(540);
  check("restarted expired wobble swells normally", a.scale.x > 1.01);

  w.step(NaN);
  w.step(Infinity);
  w.start("h2", [a], NaN, 600);
  w.start("h2", [a], 0.04, NaN);
  check("non-finite wobble inputs keep transforms finite", finiteVec(a.scale) && finiteVec(a.position));
  const sc = w.scales(NaN);
  check("scales(NaN) returns finite 1 values", Object.values(sc).every((v) => v === 1));
  w.step(1000);
  check("live wobble clears cleanly after NaN steps", Object.keys(w.scales(1000)).length === 0 && a.scale.x === 1);
}

// 2. LandingDust: non-finite/negative dt and non-finite emit never poison or trap active grains.
{
  const dust = new LandingDust();
  dust.emit(NaN, 0.3, 0);
  dust.emit(0, Infinity, 0);
  dust.emit(0, 0, -Infinity);
  check("non-finite emit is ignored without spawning grains", !dust.active && dust.count === 0 && dust.puffCount === 0);

  dust.emit(1, 0.3, 2);
  check("valid emit spawns 8 grains", dust.active && dust.count === 8 && dust.puffCount === 1);
  const first = dust.group.children[0];
  const beforePos = first.position.clone();
  const beforeScale = first.scale.x;
  dust.step(NaN);
  dust.step(Infinity);
  dust.step(-0.5);
  dust.step(0);
  const mat = first.material;
  check(
    "non-finite, negative, and zero dt leave grains finite and untouched",
    dust.count === 8 && finiteVec(first.position) && first.position.equals(beforePos) && first.scale.x === beforeScale && mat.opacity === 1,
  );
  dust.step(0.1);
  check("normal dt advances grains smoothly", dust.active && finiteVec(first.position) && mat.opacity > 0 && mat.opacity < 1);
  dust.step(0.4);
  check("grains expire and clear active state cleanly after bad dt calls", !dust.active && dust.count === 0 && dust.group.children.length === 0);
  dust.dispose();
}

// 3. Bruno: non-finite t never poisons piece transforms.
{
  const bruno = makeBruno();
  bruno.update(1.25, true);
  const allFinite = () => {
    let ok = true;
    bruno.g.traverse((o) => {
      if (!finiteVec(o.position) || !finiteVec(o.scale) || !Number.isFinite(o.rotation.x) || !Number.isFinite(o.rotation.y) || !Number.isFinite(o.rotation.z)) {
        ok = false;
      }
    });
    return ok;
  };
  check("bruno finite update keeps all transforms finite", allFinite());
  bruno.update(NaN, true);
  bruno.update(Infinity, false);
  bruno.update(-Infinity, true);
  check("bruno non-finite update keeps all transforms finite", allFinite());
  bruno.dispose();
}

console.log(`scene-motion-guards-prove: ${checks} checks passed`);
