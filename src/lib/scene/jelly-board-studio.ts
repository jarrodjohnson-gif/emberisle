// The jelly board studio: a standard 19-hex island of Hex Jelly scenes batched by jelly-board.ts, under the studio's light, at
// the diorama's angle. Dev only: scripts/jelly-board.html loads it. Query: t=<seconds> to freeze, roll=<hex index> to roll that
// hex at t-1, robber=<hex index>, az=<degrees>, polar=<degrees>, zoom=<k>.
import * as THREE from "three";
import type { Terrain } from "@/lib/game/types";
import { HEX_SIZE, hexToWorld, hexesInRadius } from "@/lib/game/hex";
import { LIGHT } from "@/lib/scene/palette";
import { JellyBoard } from "@/lib/scene/jelly-board";

const q = new URLSearchParams(location.search);
const KINDS: Terrain[] = ["timber", "wool", "grain", "clay", "ore", "timber", "wool", "grain", "waste", "clay", "ore", "timber", "wool", "grain", "clay", "ore", "timber", "wool", "grain"];
const canvas = document.querySelector("canvas")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0xebe8e1, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, 0.9));
const key = new THREE.DirectionalLight(LIGHT.keyColor, 2.6);
key.position.set(...LIGHT.key).normalize().multiplyScalar(14);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
scene.add(key);

const hexes = hexesInRadius(2).map(({ q: hq, r }, i) => ({ id: `${hq},${r}`, terrain: KINDS[i]!, ...hexToWorld(hq, r, HEX_SIZE), y: 0 }));
const t0 = performance.now();
let longest = 0;
let last = t0;
const board = (await JellyBoard.create(hexes, (k) => 7 + k.length, async () => {
  longest = Math.max(longest, performance.now() - last);
  await new Promise((r) => setTimeout(r, 0));
  last = performance.now();
  return true;
}))!;
longest = Math.max(longest, performance.now() - last);
const buildMs = performance.now() - t0;
scene.add(board.group);

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
const polar = (Number(q.get("polar") ?? 52) * Math.PI) / 180;
const az = (Number(q.get("az") ?? 20) * Math.PI) / 180;
const dist = 22 / Number(q.get("zoom") ?? 1);
camera.position.set(Math.sin(polar) * Math.sin(az) * dist, Math.cos(polar) * dist, Math.sin(polar) * Math.cos(az) * dist);
camera.lookAt(0, 0.2, 0);

const frozen = q.get("t");
const rollIx = q.get("roll");
const robIx = q.get("robber");
if (robIx) board.robber(hexes[Number(robIx)]!.id);
let frameMs = 0;
function draw(t: number) {
  const a = performance.now();
  board.update(t);
  frameMs = performance.now() - a;
  renderer.render(scene, camera);
}
if (frozen) {
  const T = Number(frozen);
  if (rollIx) {
    draw(T - 1);
    board.roll([hexes[Number(rollIx)]!.id]);
  }
  // Step up to T so dulling settles.
  for (let k = 10; k >= 0; k--) draw(T - k * 0.1);
} else renderer.setAnimationLoop((ms) => draw(ms / 1000));
(window as unknown as { __jb: unknown }).__jb = { ready: true, buildMs, longest, frameMs: () => frameMs, stats: board.stats(), info: () => ({ ...renderer.info.render }), board };
