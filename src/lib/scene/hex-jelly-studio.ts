// The Hex Jelly studio (docs/design/hex-jelly-prompt.md): one tile built to the prompt, large, at the diorama's angle (38 degrees
// up, 20 round from the south), under the prompt's light, on the paper, with a subtle tilt-shift. Dev only: scripts/hex-jelly.html
// loads it and scripts/hex-jelly.mjs screenshots it. Query: kind=<terrain> (default timber), seed=<n>, pip=<n> (0 for none),
// t=<seconds> to freeze the tile's life at that moment (otherwise it runs live), props=0 for the bare ground, focus=pool|camp|cut
// to frame that corner of the story close up, ring=1 for six neighbours round it at board spacing (to see what the landform
// hides, with birds and cloud shadows crossing it), az=<degrees> to orbit the eye, roll=<t0> to start the roll payoff at t0,
// robber=1 to stand the robber on the centre tile, night=1 for the night lighting.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { Terrain } from "@/lib/game/types";
import { LIGHT } from "@/lib/scene/palette";
import { BLOCK_H, CORNER_R, SIZE, buildTile, gull } from "@/lib/scene/hex-jelly";
import { TOKEN_LIFT, TOKEN_TILT, numberToken } from "@/lib/scene/isle-renderer";

const q = new URLSearchParams(location.search);
const kind = (q.get("kind") ?? "timber") as Terrain;
const seed = Number(q.get("seed") ?? 7);
const pip = Number(q.get("pip") ?? 10);
const frozen = q.get("t");
const focus = q.get("focus");
const PAPER = 0xebe8e1;
const POLAR = (52 * Math.PI) / 180;
const AZ = (Number(q.get("az") ?? 20) * Math.PI) / 180;
const ring = q.get("ring") === "1";
const night = q.get("night") === "1" ? 1 : 0;
const rollAt = q.get("roll");
const robber = q.get("robber") === "1";
const EYE = 18.8;

const canvas = document.querySelector("canvas")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(night ? 0x2a3142 : PAPER, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = night ? 0.95 : 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// Night: a cool low moon and a dim blue sky in place of the warm key.
scene.add(night ? new THREE.HemisphereLight(0x3e4f7a, 0x1c1c28, 0.5) : new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, 0.9));
const key = new THREE.DirectionalLight(night ? 0x9fb4ff : LIGHT.keyColor, night ? 0.65 : 2.6);
key.position.set(...LIGHT.key).normalize().multiplyScalar(8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 3;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
const reach = q.get("ring") === "1" ? 5 : 2;
// (With the ring, clouds high above cast too, so the lamp's box is taller.)
Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 20 });
scene.add(key);
const back = new THREE.DirectionalLight(night ? 0x8aa0d0 : 0xd6eef0, night ? 0.25 : 0.45);
back.position.set(-LIGHT.key[0] * 5, 4, -LIGHT.key[2] * 5 - 3);
scene.add(back);

// The paper takes the block's shadow, fading out with distance so it never streaks across the page.
const paper = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.ShadowMaterial({ opacity: 0.22, transparent: true }),
);
paper.rotation.x = -Math.PI / 2;
paper.receiveShadow = true;
scene.add(paper);

const tile = buildTile(kind, seed);
scene.add(tile.group);
if (q.get("props") === "0") tile.group.children.slice(2).forEach((o) => (o.visible = false));
// The ring: six more tiles of the same kind (other seeds) at the board's spacing, each with a token.
const others: ReturnType<typeof buildTile>[] = [];
if (ring)
  for (let k = 0; k < 6; k++) {
    const t = buildTile(kind, seed + 101 * (k + 1));
    const a = (k * Math.PI) / 3;
    t.group.position.set(Math.cos(a) * CORNER_R * Math.sqrt(3), 0, Math.sin(a) * CORNER_R * Math.sqrt(3));
    scene.add(t.group);
    others.push(t);
    const tk = numberToken([3, 5, 9, 4, 11, 6][k]!);
    tk.position.set(t.group.position.x, BLOCK_H + 0.04 + TOKEN_LIFT, t.group.position.z);
    tk.rotation.set(TOKEN_TILT, AZ, 0, "YXZ");
    scene.add(tk);
  }
if (pip) {
  const t = numberToken(pip);
  t.position.set(0, BLOCK_H + 0.04 + TOKEN_LIFT, 0);
  t.rotation.set(TOKEN_TILT, AZ, 0, "YXZ");
  scene.add(t);
}

// Pose the tile's life before measuring it (smoke, embers and leaping fish start at the origin).
for (const t of [tile, ...others]) t.env.night = night;
if (rollAt !== null) tile.roll(Number(rollAt));
if (robber) tile.robber(true, frozen !== null ? Number(frozen) : 0);
tile.update(frozen !== null ? Number(frozen) : 0);
others.forEach((o) => o.update(frozen !== null ? Number(frozen) : 0));
// Fit: the eye on the diorama's line, the lens narrowed until the block and its props fill 92 % of the frame.
const camera = new THREE.PerspectiveCamera(10, innerWidth / innerHeight, 1, 60);
scene.updateMatrixWorld(true);
const pts: THREE.Vector3[] = [];
for (let i = 0; i < 6; i++) {
  const a = ((30 + 60 * i) * Math.PI) / 180;
  for (const y of [0, BLOCK_H]) pts.push(new THREE.Vector3(Math.cos(a) * CORNER_R, y, Math.sin(a) * CORNER_R));
}
// The block and its standing props only: smoke and embers drift up out of frame.
const box = new THREE.Box3();
[tile, ...others].forEach((tl) => tl.group.traverse((o) => {
  if ((o as THREE.Mesh).isMesh && !o.userData.loose) box.expandByObject(o);
}));
for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
// A close-up frames a disc round the story's spot instead of the whole tile.
const campAt = (da: number, d: number) => tile.layout.camp && { x: Math.cos(tile.layout.camp.a + da) * d, z: Math.sin(tile.layout.camp.a + da) * d };
const spot = focus === "pool" ? tile.layout.pool : focus === "camp" ? campAt(0, 0.58) : focus === "cut" ? campAt(-0.62, 0.6) : null;
if (spot) {
  pts.length = 0;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (const y of [BLOCK_H - 0.02, BLOCK_H + 0.14]) pts.push(new THREE.Vector3(spot.x + Math.cos(a) * 0.24, y, spot.z + Math.sin(a) * 0.24));
  }
}
const look = new THREE.Vector3(0, BLOCK_H, 0);
const dir = new THREE.Vector3().setFromSphericalCoords(1, POLAR, AZ);
for (let k = 0; k < 4; k++) {
  camera.position.copy(look).addScaledVector(dir, EYE);
  camera.lookAt(look);
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const bk = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const c of pts) {
    const v = c.clone().sub(camera.position);
    const depth = -v.dot(bk);
    const [sx, sy] = [v.dot(right) / depth, v.dot(up) / depth];
    [x0, x1, y0, y1] = [Math.min(x0, sx), Math.max(x1, sx), Math.min(y0, sy), Math.max(y1, sy)];
  }
  look.addScaledVector(right, ((x0 + x1) / 2) * EYE).addScaledVector(up, ((y0 + y1) / 2) * EYE);
  const half = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / camera.aspect) / 0.92;
  camera.fov = (2 * Math.atan(half) * 180) / Math.PI;
  camera.updateProjectionMatrix();
}

// Tilt-shift: a blur that grows toward the top and bottom of the frame, run across then down.
const tilt = (dx: number, dy: number) =>
  new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2(dx / innerWidth, dy / innerHeight) } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uStep; varying vec2 vUv;
      void main() {
        float k = smoothstep( 0.22, 0.5, abs( vUv.y - 0.5 ) ) * 2.2;
        vec4 s = vec4( 0.0 ); float w = 0.0;
        for ( int i = -4; i <= 4; i++ ) { float g = exp( -float( i * i ) / 8.0 ); s += texture2D( tDiffuse, vUv + uStep * float( i ) * k ) * g; w += g; }
        gl_FragColor = s / w;
      }`,
  });
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
composer.addPass(tilt(1, 0));
composer.addPass(tilt(0, 1));
// Board-wide life over the ring: three small flocks of birds crossing, and cloud shadows (invisible clouds that only cast)
// drifting over the tiles.
const sky: ((t: number) => void)[] = [];
if (ring) {
  // Seagulls in loose twos and threes, each on its own wide gliding loop over the ring, banking into the turn, flapping now
  // and then.
  const gullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  for (let f = 0; f < 3; f++) {
    const n = 2 + (f % 2);
    const birds = Array.from({ length: n }, (_, i) => {
      const b = gull(gullMat);
      b.g.scale.setScalar(SIZE.small * 1.6);
      scene.add(b.g);
      return { ...b, i };
    });
    const c = { x: Math.cos(f * 2.1) * 1.2, z: Math.sin(f * 2.1) * 1.0 };
    const R = 1.1 + f * 0.35;
    sky.push((t) => {
      for (const k of birds) {
        const w = (0.22 - f * 0.03) * (f % 2 ? -1 : 1);
        const a = t * w + k.i * 0.35 + f;
        const r = R + k.i * 0.12;
        k.g.position.set(c.x + Math.cos(a) * r, 0.75 + f * 0.12 + 0.03 * Math.sin(t * 0.7 + k.i), c.z + Math.sin(a) * r);
        // Heading along the loop, banked in toward its centre.
        k.g.rotation.set(0, 0, 0);
        k.g.rotation.order = "YXZ";
        k.g.rotation.y = -(a + (w > 0 ? Math.PI / 2 : -Math.PI / 2));
        k.g.rotation.x = (w > 0 ? 1 : -1) * 0.35;
        const cyc = (t + k.i * 1.3 + f * 2) % 5;
        k.pose(t, cyc < 0.9 ? Math.sin((cyc / 0.9) * Math.PI) : 0);
      }
    });
  }
  const cloudMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (let c = 0; c < 3; c++) {
    const cloud = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat);
      p.scale.set(0.6 + i * 0.12, 0.12, 0.45);
      p.position.set(i * 0.4 - 0.6, 0, (i % 2) * 0.2);
      p.castShadow = true;
      cloud.add(p);
    }
    scene.add(cloud);
    sky.push((t) => {
      const u = ((t * 0.02 + c * 0.33) % 1) * 2 - 1;
      // The shadow lands down the key's line from the cloud: aim the shadow across the ring's middle.
      const [sx, sz] = [u * 2.2 + (c - 1) * 0.6, -0.9 + c * 0.9 - u * 0.4];
      cloud.position.set(sx + (LIGHT.key[0] / LIGHT.key[1]) * 2.4, 2.4, sz + (LIGHT.key[2] / LIGHT.key[1]) * 2.4);
    });
  }
}
const draw = (t: number) => {
  sky.forEach((f) => f(t));
  tile.update(t);
  others.forEach((o) => o.update(t));
  composer.render();
};
if (frozen !== null) {
  draw(Number(frozen));
  draw(Number(frozen));
} else {
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => draw(clock.getElapsedTime()));
}
(window as unknown as { __jelly: unknown }).__jelly = { ready: true, kind, seed, info: renderer.info.render, scene };
