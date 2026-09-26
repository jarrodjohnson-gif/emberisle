import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { hexHeight, worldOfHex } from "@/lib/game/board";
import { HEX_SIZE } from "@/lib/game/hex";
import { mulberry32, hashStr } from "@/lib/utils";
import type { GameState, HexCell, Terrain } from "@/lib/game/types";

const SLAB = 0.26;
const STONE = 0xefeae0;

const SIDE: Record<Terrain, number> = {
  timber: 0x3a5c32,
  wool: 0x5d8a3e,
  grain: 0xb8862a,
  clay: 0x9a3f28,
  ore: 0x4a5360,
  waste: 0xb89b6a,
};

const TEX_URL: Record<Terrain, string> = {
  timber: "/textures/forest.jpg",
  wool: "/textures/pasture.jpg",
  grain: "/textures/fields.jpg",
  clay: "/textures/hills.jpg",
  ore: "/textures/mountains.jpg",
  waste: "/textures/desert.jpg",
};

type Highlights = { vertices: string[]; edges: string[]; hexes: string[] };
type Sheep = { g: THREE.Group; ox: number; oz: number; tx: number; tz: number; wait: number; graze: number };

export class IsleRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private land = new THREE.Group();
  private pieces = new THREE.Group();
  private marks = new THREE.Group();
  private living = new THREE.Group();
  private pickables: THREE.Object3D[] = [];
  private composer!: EffectComposer;
  private ssao!: SSAOPass;
  private wayfarer: THREE.Group;
  private sheep: Sheep[] = [];
  private boats: THREE.Group[] = [];
  private trees: THREE.Object3D[] = [];
  private wheat: THREE.Object3D[] = [];
  private textures: Partial<Record<Terrain, THREE.Texture>> = {};
  private lastSeed: number | null = null;
  private lastSeq = -1;
  private lastState: GameState | null = null;
  private lastHi: Highlights = { vertices: [], edges: [], hexes: [] };
  private lastInteractive = false;
  private down = { x: 0, y: 0 };
  private stopped = false;
  private robberTarget = new THREE.Vector3();
  private clock = new THREE.Timer();
  private onPick: (kind: "hex" | "vertex" | "edge", id: string) => void;

  constructor(canvas: HTMLCanvasElement, onPick: (kind: "hex" | "vertex" | "edge", id: string) => void) {
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x6a93a0, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    this.camera.position.set(6.6, 9.1, 7.4);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 18;
    this.controls.maxPolarAngle = 1.02;
    this.controls.minPolarAngle = 0.7;
    this.controls.target.set(0.15, 0.05, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.28;

    this.scene.fog = new THREE.Fog(0x6a93a0, 26, 52);
    this.scene.add(new THREE.HemisphereLight(0xf3fbff, 0xe8c9a0, 1.15));
    const sun = new THREE.DirectionalLight(0xfff7e8, 1.35);
    sun.position.set(8, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xfffaf0, 0.62));
    const fill = new THREE.DirectionalLight(0xcfe8ff, 0.45);
    fill.position.set(-8, 8, -4);
    this.scene.add(fill);

    const ocean = new THREE.Mesh(
      new THREE.CircleGeometry(48, 96),
      new THREE.MeshStandardMaterial({ color: 0x2a6a78, roughness: 0.28, metalness: 0.06 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0;
    this.scene.add(ocean);

    const foam = new THREE.Mesh(
      new THREE.RingGeometry(5.15, 5.85, 72),
      new THREE.MeshBasicMaterial({ color: 0xe8f8f8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.03;
    this.scene.add(foam);

    const shelf = new THREE.Mesh(
      new THREE.CylinderGeometry(5.45, 5.7, 0.55, 48),
      new THREE.MeshStandardMaterial({ color: 0x3aa8a8, roughness: 0.85 }),
    );
    shelf.position.y = -0.32;
    shelf.receiveShadow = true;
    this.scene.add(shelf);

    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(5.35, 5.4, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: 0xe8d7b0, roughness: 1 }),
    );
    sand.position.y = 0.0;
    sand.receiveShadow = true;
    this.scene.add(sand);

    this.wayfarer = makeWayfarer();
    this.living.add(this.wayfarer);
    this.scene.add(this.land, this.living, this.pieces, this.marks);

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.loadTextures();
    this.clock.connect(document);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ssao = new SSAOPass(this.scene, this.camera, 1, 1);
    this.ssao.kernelRadius = 10;
    this.ssao.minDistance = 0.001;
    this.ssao.maxDistance = 0.08;
    this.composer.addPass(this.ssao);
    this.composer.addPass(new OutputPass());
    this.renderer.setAnimationLoop(this.tick);
  }

  setTitleMode(v: boolean) {
    this.controls.autoRotate = v;
  }

  setBoard(state: GameState, highlights: Highlights, interactive: boolean) {
    this.lastState = state;
    this.lastHi = highlights;
    this.lastInteractive = interactive;
    if (this.lastSeed !== state.seed) {
      this.buildLand(state);
      this.lastSeed = state.seed;
    }
    if (this.lastSeq !== state.seq) {
      this.buildPieces(state);
      this.lastSeq = state.seq;
    }
    this.buildMarks(state, highlights, interactive);
    const rh = state.hexes.find((h) => h.id === state.robberHex);
    if (rh) {
      const w = worldOfHex(rh);
      this.robberTarget.set(w.x, hexHeight(rh.terrain) + 0.08, w.z);
    }
  }

  dispose() {
    this.stopped = true;
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    window.removeEventListener("resize", this.resize);
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onUp);
    this.renderer.dispose();
  }

  private loadTextures() {
    const loader = new THREE.TextureLoader();
    const kinds = Object.keys(TEX_URL) as Terrain[];
    let left = kinds.length;
    for (const k of kinds) {
      loader.load(TEX_URL[k], (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        this.textures[k] = tex;
        left -= 1;
        if (left === 0 && this.lastState) {
          this.lastSeed = null;
          this.setBoard(this.lastState, this.lastHi, this.lastInteractive);
        }
      });
    }
  }

  private resize = () => {
    const c = this.renderer.domElement;
    const w = c.clientWidth || 1;
    const h = c.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.ssao?.setSize(w, h);
  };

  private onDown = (e: PointerEvent) => {
    this.down.x = e.clientX;
    this.down.y = e.clientY;
  };

  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    const hit = hits.find((h) => h.object.userData.id);
    if (hit) this.onPick(hit.object.userData.kind, hit.object.userData.id);
  };

  private tick = () => {
    if (this.stopped) return;
    this.clock.update();
    const t = this.clock.getElapsed();
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.controls.update();
    for (const tr of this.trees) tr.rotation.z = Math.sin(t * 1.05 + tr.position.x * 2) * 0.028;
    this.wayfarer.position.lerp(this.robberTarget, 1 - Math.exp(-dt * 3.2));
    this.wayfarer.position.y = this.robberTarget.y + Math.sin(t * 2.4) * 0.025;
    for (const s of this.sheep) {
      s.wait -= dt;
      if (s.wait <= 0) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.22 + Math.random() * 0.32;
        s.tx = s.ox + Math.cos(a) * r;
        s.tz = s.oz + Math.sin(a) * r;
        s.wait = 1.8 + Math.random() * 2.8;
        s.graze = Math.random() > 0.4 ? 1.1 : 0;
      }
      s.g.position.x += (s.tx - s.g.position.x) * (1 - Math.exp(-dt * 1.6));
      s.g.position.z += (s.tz - s.g.position.z) * (1 - Math.exp(-dt * 1.6));
      const heading = Math.atan2(s.tx - s.g.position.x, s.tz - s.g.position.z);
      s.g.rotation.y += (heading - s.g.rotation.y) * (1 - Math.exp(-dt * 3));
      s.g.rotation.x = s.graze > 0 ? 0.32 : 0;
      if (s.graze > 0) s.graze -= dt;
    }
    for (const b of this.boats) {
      b.position.y = 0.06 + Math.sin(t * 1.6 + b.position.x) * 0.04;
      b.rotation.z = Math.sin(t * 1.35 + b.position.z) * 0.07;
      b.rotation.x = Math.sin(t * 1.1) * 0.035;
    }
    this.composer.render();
  };

  private buildLand(state: GameState) {
    disposeGroup(this.land);
    disposeGroup(this.living);
    this.sheep = [];
    this.boats = [];
    this.trees = [];
    this.wheat = [];
    this.living.add(this.wayfarer);
    this.pickables = [];

    for (const h of state.hexes) {
      const { x, z } = worldOfHex(h);
      const height = hexHeight(h.terrain);
      const tile = makeHexTile(HEX_SIZE * 0.995, height, this.textures[h.terrain], SIDE[h.terrain]);
      tile.position.set(x, 0.04, z);
      tile.userData = { kind: "hex", id: h.id };
      tile.traverse((o) => {
        o.userData = tile.userData;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      this.land.add(tile);
      this.pickables.push(tile);
      decorate(this.living, this.trees, this.wheat, this.sheep, h, x, z, height);
      if (h.pip != null) {
        const tok = numberToken(h.pip);
        tok.position.set(x, SLAB + height * 0.35 + 0.08, z);
        this.land.add(tok);
      }
    }

    for (const v of state.vertices) {
      if (!v.harbor) continue;
      const len = Math.hypot(v.x, v.z) || 1;
      const px = v.x + (v.x / len) * 0.62;
      const pz = v.z + (v.z / len) * 0.62;
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.05, 0.72),
        new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.82 }),
      );
      pier.position.set(px, 0.1, pz);
      pier.lookAt(0, 0.1, 0);
      this.land.add(pier);
      const boat = makeBoat();
      boat.position.set(px + (v.x / len) * 0.5, 0.08, pz + (v.z / len) * 0.5);
      boat.lookAt(v.x, 0.08, v.z);
      boat.userData.vid = v.id;
      this.living.add(boat);
      this.boats.push(boat);
    }
  }

  private buildPieces(state: GameState) {
    disposeGroup(this.pieces);
    const vmap = new Map(state.vertices.map((v) => [v.id, v]));
    const pmap = new Map(state.players.map((p) => [p.id, p]));

    for (const e of state.edges) {
      if (!e.path) continue;
      const a = vmap.get(e.va)!;
      const b = vmap.get(e.vb)!;
      const color = pmap.get(e.path)?.color ?? "#ccc";
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.07, Math.hypot(dx, dz) * 0.9),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
      );
      road.position.set((a.x + b.x) / 2, 0.3, (a.z + b.z) / 2);
      road.rotation.y = Math.atan2(dx, dz);
      road.castShadow = true;
      this.pieces.add(road);
    }

    for (const v of state.vertices) {
      if (!v.building) continue;
      const pl = pmap.get(v.building.playerId);
      const h = Math.max(
        ...v.hexes.map((id) => hexHeight(state.hexes.find((x) => x.id === id)!.terrain)),
        0.14,
      );
      const house = makeHouse(pl?.color ?? "#ccc", v.building.kind === "stronghold");
      house.position.set(v.x, h + 0.12, v.z);
      this.pieces.add(house);
    }

    for (const b of this.boats) {
      const v = vmap.get(b.userData.vid as string);
      const claimed = v?.building?.playerId;
      const sail = b.getObjectByName("sail") as THREE.Mesh | undefined;
      if (sail && sail.material instanceof THREE.MeshStandardMaterial) {
        sail.material.color.set(claimed ? pmap.get(claimed)?.color ?? "#eee" : "#f4efe4");
      }
    }
  }

  private buildMarks(state: GameState, hi: Highlights, interactive: boolean) {
    disposeGroup(this.marks);
    this.pickables = this.pickables.filter((o) => o.userData.kind === "hex");
    if (!interactive) return;
    const vset = new Set(hi.vertices);
    const eset = new Set(hi.edges);
    const hset = new Set(hi.hexes);
    const vmap = new Map(state.vertices.map((v) => [v.id, v]));

    for (const v of state.vertices) {
      if (!vset.has(v.id)) continue;
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.025, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xfff6e8, emissiveIntensity: 0.8 }),
      );
      m.rotation.x = Math.PI / 2;
      m.position.set(v.x, 0.36, v.z);
      m.userData = { kind: "vertex", id: v.id };
      this.marks.add(m);
      this.pickables.push(m);
    }
    for (const e of state.edges) {
      if (!eset.has(e.id)) continue;
      const a = vmap.get(e.va)!;
      const b = vmap.get(e.vb)!;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.07, Math.hypot(b.x - a.x, b.z - a.z) * 0.72),
        new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0x2a8f8a, emissiveIntensity: 0.45 }),
      );
      m.position.set((a.x + b.x) / 2, 0.34, (a.z + b.z) / 2);
      m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      m.userData = { kind: "edge", id: e.id };
      this.marks.add(m);
      this.pickables.push(m);
    }
    for (const h of state.hexes) {
      if (!hset.has(h.id)) continue;
      const { x, z } = worldOfHex(h);
      const ring = hexCap(HEX_SIZE * 0.9, undefined, 0xc45c3e);
      ring.position.set(x, hexHeight(h.terrain) + 0.14, z);
      ring.userData = { kind: "hex", id: h.id };
      const mat = ring.material as THREE.MeshStandardMaterial;
      mat.emissive = new THREE.Color(0xc45c3e);
      mat.emissiveIntensity = 0.55;
      this.marks.add(ring);
      this.pickables.push(ring);
    }
  }
}

function disposeGroup(g: THREE.Group) {
  while (g.children.length) {
    const c = g.children.pop()!;
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat && !(mat as THREE.Material).userData?.shared) mat.dispose?.();
    });
  }
}

function hexShape(size: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = size * Math.cos(a);
    const y = size * Math.sin(a);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function makeHexTile(size: number, height: number, tex: THREE.Texture | undefined, _side: number) {
  const g = new THREE.Group();
  const slabH = SLAB + height * 0.35;
  const wallGeo = new THREE.ExtrudeGeometry(hexShape(size), { depth: slabH, bevelEnabled: false });
  wallGeo.rotateX(-Math.PI / 2);
  const wall = new THREE.Mesh(
    wallGeo,
    new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.82, metalness: 0.02 }),
  );
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);
  const cap = hexCap(size * 0.992, tex, STONE);
  cap.position.y = slabH + 0.002;
  g.add(cap);
  return g;
}

function hexCap(size: number, tex: THREE.Texture | undefined, color: number) {
  const geo = new THREE.ShapeGeometry(hexShape(size));
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) / size + 1) / 2, (pos.getZ(i) / size + 1) / 2);
  }
  uv.needsUpdate = true;
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map: tex ?? null,
      color: tex ? 0xffffff : color,
      roughness: 0.92,
    }),
  );
}

function numberToken(n: number) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32),
    new THREE.MeshStandardMaterial({ color: 0xf4ead6, roughness: 0.45 }),
  );
  disc.castShadow = true;
  g.add(disc);
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4ead6";
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  const hot = n === 6 || n === 8;
  ctx.fillStyle = hot ? "#c0392b" : "#1c1916";
  ctx.font = "bold 118px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 128, 108);
  const pips = 6 - Math.abs(n - 7);
  ctx.fillStyle = hot ? "#c0392b" : "#3a342c";
  const span = (pips - 1) * 16;
  for (let i = 0; i < pips; i++) {
    ctx.beginPath();
    ctx.arc(128 - span / 2 + i * 16, 188, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ map: tex }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.03;
  g.add(label);
  return g;
}

function decorate(
  living: THREE.Group,
  trees: THREE.Object3D[],
  _wheat: THREE.Object3D[],
  sheep: Sheep[],
  h: HexCell,
  x: number,
  z: number,
  height: number,
) {
  const rng = mulberry32(hashStr(h.id + h.terrain));
  const place = (minR: number, maxR: number) => {
    const a = rng() * Math.PI * 2;
    const rad = minR + Math.sqrt(rng()) * (maxR - minR);
    return { px: x + Math.cos(a) * rad, pz: z + Math.sin(a) * rad };
  };
  if (h.terrain === "timber") {
    const n = 16 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const { px, pz } = place(0.4, 0.88);
      const tree = rng() > 0.42 ? makePine(0.85 + rng() * 0.45) : makeDeciduous(0.8 + rng() * 0.4);
      tree.position.set(px, height + 0.03, pz);
      tree.rotation.y = rng() * Math.PI * 2;
      living.add(tree);
      trees.push(tree);
    }
  }
  if (h.terrain === "wool") {
    const n = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const { px, pz } = place(0.36, 0.7);
      const s = makeSheep();
      s.position.set(px, height + 0.05, pz);
      living.add(s);
      sheep.push({ g: s, ox: x, oz: z, tx: px, tz: pz, wait: rng() * 2, graze: 0 });
    }
  }
  if (h.terrain === "ore") {
    for (let i = 0; i < 5; i++) {
      const { px, pz } = place(0.4, 0.78);
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.12 + rng() * 0.12, 0),
        new THREE.MeshStandardMaterial({ color: 0x6a737c, roughness: 0.95, flatShading: true }),
      );
      rock.position.set(px, height + 0.08, pz);
      rock.rotation.set(rng(), rng(), rng());
      rock.castShadow = true;
      living.add(rock);
    }
  }
}

function makePine(s: number) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025 * s, 0.04 * s, 0.22 * s, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a3220 }),
  );
  trunk.position.y = 0.1 * s;
  g.add(trunk);
  const shades = [0x163d28, 0x1f5a38, 0x2a6e44, 0x1a4a30];
  for (let i = 0; i < 4; i++) {
    const r = (0.22 - i * 0.035) * s;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, 0.28 * s, 8),
      new THREE.MeshLambertMaterial({ color: shades[i % shades.length] }),
    );
    cone.position.y = (0.22 + i * 0.14) * s;
    cone.rotation.y = i * 0.4;
    cone.scale.x = 0.92 + (i % 2) * 0.12;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

function makeDeciduous(s: number) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028 * s, 0.04 * s, 0.24 * s, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a3220 }),
  );
  trunk.position.y = 0.12 * s;
  g.add(trunk);
  const shades = [0x2f7a43, 0x3d8f52, 0x246638, 0x4a9a5c];
  for (let i = 0; i < 6; i++) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.13 * s, 0),
      new THREE.MeshLambertMaterial({ color: shades[i % shades.length] }),
    );
    const a = (i / 6) * Math.PI * 2;
    blob.position.set(Math.cos(a) * 0.1 * s, (0.3 + (i % 3) * 0.08) * s, Math.sin(a) * 0.1 * s);
    blob.scale.setScalar(0.75 + (i % 3) * 0.15);
    blob.castShadow = true;
    g.add(blob);
  }
  return g;
}

function makeHouse(color: string, city: boolean) {
  const g = new THREE.Group();
  const w = city ? 0.28 : 0.2;
  const d = city ? 0.24 : 0.18;
  const h = city ? 0.16 : 0.12;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48 }),
  );
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);
  const shape = new THREE.Shape();
  shape.moveTo(-w * 0.58, 0);
  shape.lineTo(w * 0.58, 0);
  shape.lineTo(0, 0.14);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d * 1.08, bevelEnabled: false });
  roofGeo.rotateX(Math.PI / 2);
  roofGeo.translate(0, 0, -d * 0.54);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x4a3022, roughness: 0.7 }));
  roof.position.y = h;
  roof.castShadow = true;
  g.add(roof);
  if (city) {
    const keep = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.18, 0.12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.48 }),
    );
    keep.position.set(w * 0.25, h + 0.04, 0);
    g.add(keep);
  }
  return g;
}

function makeWayfarer() {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.38, 8),
    new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.7 }),
  );
  robe.position.y = 0.19;
  g.add(robe);
  const wrap = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.5 }),
  );
  wrap.position.y = 0.4;
  g.add(wrap);
  for (const sx of [-0.024, 0.024]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    eye.position.set(sx, 0.4, 0.065);
    g.add(eye);
  }
  return g;
}

function makeBoat() {
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.07, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.7 }),
    ),
  );
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a }),
  );
  mast.position.y = 0.2;
  g.add(mast);
  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.26),
    new THREE.MeshStandardMaterial({ color: 0xf4efe4, side: THREE.DoubleSide, roughness: 0.6 }),
  );
  sail.name = "sail";
  sail.position.set(0.04, 0.22, 0);
  g.add(sail);
  return g;
}

function makeSheep() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.95 }),
  );
  body.scale.set(1.35, 0.9, 1);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a }),
  );
  head.position.set(0, 0.03, 0.1);
  for (const [lx, lz] of [[-0.05, 0.05], [0.05, 0.05], [-0.05, -0.05], [0.05, -0.05]]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.06, 5),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a }),
    );
    leg.position.set(lx, -0.07, lz);
    g.add(leg);
  }
  g.add(body, head);
  return g;
}
