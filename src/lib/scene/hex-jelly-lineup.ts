// The Hex Jelly size ladder (docs/design/hex-jelly-prompt.md "SCALE"): one of every figure and building from the built tiles,
// side by side on the paper by height, with a number token for scale and a label under each, at the diorama's angle. Dev
// only: scripts/hex-jelly-lineup.html loads it and `node scripts/hex-jelly.mjs --lineup` screenshots it.
import * as THREE from "three";
import type { Terrain } from "@/lib/game/types";
import { LIGHT } from "@/lib/scene/palette";
import { buildTile } from "@/lib/scene/hex-jelly";
import { TOKEN_LIFT, TOKEN_TILT, numberToken } from "@/lib/scene/isle-renderer";

const ORDER = ["hen", "duck", "crow", "hare", "lamb", "dog", "sheep", "fawn", "deer", "person", "barrow", "trough", "gate", "wagon", "tent", "scarecrow", "hut", "house", "barn", "silo", "windmill"];
const canvas = document.querySelector("canvas")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0xebe8e1, 1);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, 0.9));
const key = new THREE.DirectionalLight(LIGHT.keyColor, 2.6);
key.position.set(...LIGHT.key).normalize().multiplyScalar(8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.2 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// One of each, from the tiles that hold them.
const found = new Map<string, THREE.Object3D>();
for (const kind of ["timber", "wool", "grain"] as Terrain[])
  for (const seed of [7, 11, 23]) {
    const t = buildTile(kind, seed);
    t.update(0);
    t.group.traverse((o) => {
      const ref = o.userData.ref as string | undefined;
      if (ref && !found.has(ref)) found.set(ref, o);
    });
  }
const row = new THREE.Group();
scene.add(row);
let x = 0;
const labels: { name: string; at: THREE.Vector3 }[] = [];
const place = (o: THREE.Object3D, name: string) => {
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o);
  const w = b.max.x - b.min.x;
  o.position.set(x - b.min.x, -b.min.y, -(b.min.z + b.max.z) / 2);
  row.add(o);
  labels.push({ name: `${name} ${(b.max.y - b.min.y).toFixed(2)}`, at: new THREE.Vector3(x + w / 2, 0, 0.05) });
  x += Math.max(w, 0.09) + 0.05;
};
const token = numberToken(8);
token.rotation.set(TOKEN_TILT, (20 * Math.PI) / 180, 0, "YXZ");
const tk = new THREE.Group();
token.position.y = 0.04 + TOKEN_LIFT;
tk.add(token);
place(tk, "token");
for (const name of ORDER) {
  const o = found.get(name);
  if (!o) continue;
  const c = o.clone(true);
  c.traverse((m) => (m.visible = true));
  place(c, name);
}
row.position.x = -x / 2;
row.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = true), (o.receiveShadow = true))));

// An orthographic eye at the diorama's height angle, so near and far compare honestly.
const half = x / 2 + 0.1;
const camera = new THREE.OrthographicCamera(-half, half, (half * innerHeight) / innerWidth, (-half * innerHeight) / innerWidth, 0.1, 80);
camera.position.setFromSphericalCoords(20, (62 * Math.PI) / 180, 0).add(new THREE.Vector3(0, 0.15, 0));
camera.lookAt(0, 0.15, 0);
renderer.render(scene, camera);
renderer.render(scene, camera);
// Labels under each, in HTML.
for (const l of labels) {
  const p = l.at.clone().add(row.position).project(camera);
  const d = document.createElement("div");
  d.textContent = l.name;
  Object.assign(d.style, { position: "fixed", left: `${((p.x + 1) / 2) * innerWidth}px`, top: `${((1 - p.y) / 2) * innerHeight}px`, transform: "translate(-50%, 4px)", transformOrigin: "50% 0", font: "600 10px system-ui", color: "#3a3530", whiteSpace: "nowrap" });
  document.body.appendChild(d);
}
(window as unknown as { __jelly: unknown }).__jelly = { ready: true, found: [...found.keys()] };
