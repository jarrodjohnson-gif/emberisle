// @ts-nocheck: the old studio, built on terrain v1 (legacy/terrain-v1); it no longer runs against the current terrain.
// The hex studio (docs/design/terrain.md "The studio"): one sculpted hex, large, seen as the diorama sees the board (38° up,
// 20° off north, from the board's eye distance) under the board's own light rig, on the paper; or the hex in a ring of six
// neighbours of mixed kinds. Dev only: scripts/hex-studio.html loads it and `npm run hex-studio` screenshots it. Nothing in
// the app imports it.
//
// Query: terrain=<kind> (default timber); ring=1 for the neighbours; props=0 for the bare ground; variant=<n> for the n-th
// hex of that kind on the demo board (its id seeds the sculpt and the props, as on the board).
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { AXIAL_DIRS } from "@/lib/game/hex";
import { demoBoard, worldOfHex } from "@/lib/game/board";
import type { HexCell, Terrain } from "@/lib/game/types";
import { DIORAMA_AZIMUTH, DIORAMA_POLAR, CAP_LEVEL } from "@/lib/scene/mobile-fit";
import { PAPER } from "@/lib/scene/crystal-water";
import { TOKEN_LIFT, TOKEN_TILT, landHex, lightRig, makeWayfarer, topOf } from "@/lib/scene/isle-renderer";
import { PropKit, coastOf, type Life } from "@/lib/scene/terrain";

// The diorama's eye distance on a 1280x720 board (docs/design/camera-light.md), so a hex keeps the board's perspective.
const EYE = 18.8;
const KINDS: Terrain[] = ["timber", "wool", "grain", "clay", "ore", "waste"];
// The ring around the hex, from +x round to +z (the side nearest the eye last), every other kind once.
const PIPS = [5, 9, 4, 10, 3, 11];

const q = new URLSearchParams(location.search);
const terrain = (KINDS.includes(q.get("terrain") as Terrain) ? q.get("terrain") : "timber") as Terrain;
const ring = q.get("ring") === "1";
const props = q.get("props") !== "0";
const variant = Number(q.get("variant") ?? 0);

// The demo board's hexes of a kind give the studio real ids (the seed) and pips; every one is drawn at the origin's ring.
const demo = demoBoard().hexes;
const ofKind = (t: Terrain, n: number) => {
  const all = demo.filter((h) => h.terrain === t);
  return all[n % all.length]!;
};
const at = (h: HexCell, cq: number, cr: number): HexCell => ({ ...h, q: cq, r: cr });

const hexes: HexCell[] = [at(ofKind(terrain, variant), 0, 0)];
if (ring) {
  const others = KINDS.filter((t) => t !== terrain);
  AXIAL_DIRS.forEach(([dq, dr], i) => {
    const t = i < others.length ? others[i]! : terrain;
    const h = ofKind(t, variant + 1);
    hexes.push({ ...h, id: `${dq},${dr}`, q: dq, r: dr, pip: t === "waste" ? null : PIPS[i]! });
  });
}

const canvas = document.querySelector("canvas")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(PAPER, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
lightRig(scene);
// The paper takes the slab's shadow, so the hex stands on the table rather than floating in the page.
const paper = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.16 }));
paper.rotation.x = -Math.PI / 2;
paper.receiveShadow = true;
scene.add(paper);

const living = new THREE.Group();
scene.add(living);
const kit = new PropKit(living);
const life: Life = { sheep: [], oreWork: [], farmWork: [], tall: [] };
const camera = new THREE.PerspectiveCamera(10, window.innerWidth / window.innerHeight, 1, 60);
camera.position.setFromSphericalCoords(EYE, DIORAMA_POLAR, DIORAMA_AZIMUTH).add(new THREE.Vector3(0, CAP_LEVEL, 0));
camera.lookAt(0, CAP_LEVEL, 0);

// The ring's outer edges face the sea; the hex alone faces it on its two edges nearest the eye, as on the board's near coast.
const isLand = new Set(hexes.map((h) => `${h.q},${h.r}`));
for (const h of hexes) {
  const l = landHex(h, ring ? coastOf(h, (cq, cr) => isLand.has(`${cq},${cr}`)) : [false, true, true, false, false, false]);
  scene.add(l.tile);
  if (l.token) {
    // The diorama pose at the token's own size (poseTokens, zoomed in): turned to the eye, tilted toward it, on its near edge.
    l.token.rotation.set(TOKEN_TILT, DIORAMA_AZIMUTH, 0, "YXZ");
    l.token.position.y += TOKEN_LIFT;
    scene.add(l.token);
  } else if (h.terrain === "waste") {
    const w = makeWayfarer();
    w.position.set(l.tile.position.x, topOf("waste"), l.tile.position.z);
    w.rotation.y = DIORAMA_AZIMUTH;
    living.add(w);
  }
  if (props) l.decorate(kit, life);
}
kit.finish();

// Frame what is drawn: the eye stays on the diorama's line; the lens narrows until the slabs (their corners, base and top) and
// every prop's box fill 88 % of the frame, and the look-at point slides so they sit in its middle.
scene.updateMatrixWorld(true);
const points: THREE.Vector3[] = [];
const part = new THREE.Box3();
for (const h of hexes) {
  const c = worldOfHex(h);
  for (let i = 0; i < 6; i++) {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    for (const y of [0, topOf(h.terrain)]) points.push(new THREE.Vector3(c.x + Math.cos(a) * 1.12, y, c.z + Math.sin(a) * 1.12));
  }
}
scene.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || m === paper || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.land) return;
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  part.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
  for (let i = 0; i < 8; i++) points.push(new THREE.Vector3(i & 1 ? part.max.x : part.min.x, i & 2 ? part.max.y : part.min.y, i & 4 ? part.max.z : part.min.z));
});
const look = new THREE.Vector3(0, CAP_LEVEL, 0);
const dir = camera.position.clone().sub(look).normalize();
for (let k = 0; k < 4; k++) {
  camera.position.copy(look).addScaledVector(dir, EYE);
  camera.lookAt(look);
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const back = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const c of points) {
    const v = c.clone().sub(camera.position);
    const depth = -v.dot(back);
    const [sx, sy] = [v.dot(right) / depth, v.dot(up) / depth];
    [x0, x1, y0, y1] = [Math.min(x0, sx), Math.max(x1, sx), Math.min(y0, sy), Math.max(y1, sy)];
  }
  look.addScaledVector(right, ((x0 + x1) / 2) * EYE).addScaledVector(up, ((y0 + y1) / 2) * EYE);
  const half = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / camera.aspect) / 0.88;
  camera.fov = (2 * Math.atan(half) * 180) / Math.PI;
  camera.updateProjectionMatrix();
}

const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
kit.sync();
composer.render();
composer.render();
(window as unknown as { __studio: unknown }).__studio = { ready: true, terrain, ring, props, ids: hexes.map((h) => h.id), scene, camera, kit };
