import * as THREE from "three";
import {
  CAP_LEVEL,
  OVERHEAD_LEAN,
  TouchGesture,
  PICK_EDGE,
  PICK_VERTEX_RADIUS,
  chromeInsets,
  fitOrtho,
  freeMaxDistance,
  hudInsets,
  isSelectTap,
  pickBest,
  tapSlop,
  type Insets,
  type OrthoFit,
  type Rect,
} from "@/lib/scene/mobile-fit";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hexHeight, worldOfHex } from "@/lib/game/board";
import { HEX_SIZE, SQRT3, hexCorners, hexesInRadius, vertexId } from "@/lib/game/hex";
import { LAND_MS } from "@/lib/scene/landing";
import { mulberry32, hashStr } from "@/lib/utils";
import { PAINT, RIM } from "@/lib/scene/palette";
import { foldOverRidge, markParts } from "@/lib/scene/seat-mark";
import { payingHexes } from "@/lib/game/rules";
import { seatMark, type GameState, type HarborKind, type HexCell, type Terrain, type Vertex } from "@/lib/game/types";

const SLAB = 0.26;
const TILE_Y = 0.04;

// The y of a hex's top surface: where makeHexTile puts its cap. Everything that sits on a hex sits here.
export function topOf(terrain: Terrain) {
  return TILE_Y + SLAB + hexHeight(terrain) * 0.35;
}
const STONE = 0xefeae0;

const SIDE: Record<Terrain, number> = {
  timber: 0x3a5c32,
  wool: 0x5d8a3e,
  grain: 0xb8862a,
  clay: 0x9a3f28,
  ore: 0x4a5360,
  waste: 0xb89b6a,
};

const TEX_FILE: Record<Terrain, string> = {
  timber: "forest.jpg",
  wool: "pasture.jpg",
  grain: "fields.jpg",
  clay: "hills.jpg",
  ore: "mountains.jpg",
  waste: "desert.jpg",
};

// Drop photo textures into src/assets/textures/ to use them. Missing ones are painted, with no request.
const PHOTOS = import.meta.glob("../../assets/textures/*.jpg", { eager: true, import: "default", query: "?url" }) as Record<
  string,
  string
>;

function photoUrl(kind: Terrain): string | undefined {
  return PHOTOS[`../../assets/textures/${TEX_FILE[kind]}`];
}

type Highlights = { vertices: string[]; edges: string[]; hexes: string[] };
// The paying-hex flash (docs/design/dice.md): the cap glows in over --duration-base, then fades linearly out by 600 ms.
const FLASH_IN_S = 0.22;
const FLASH_S = 0.6;
const FLASH_PEAK = 0.35;
const FLASH_WARM = new THREE.Color(0xffa94d);
// The pulse token (polish.md "Motion"): legal corners and paths breathe once per 1.2 s.
const LEGAL_PULSE_S = 1.2;
type Sheep = { g: THREE.Object3D; ox: number; oz: number; tx: number; tz: number; wait: number; graze: number };

// The overhead view in play (docs/design/camera-light.md): a frustum and a look-at point from the fit to the HUD hole, and
// the eye on an orbit around that point, ORBIT_RADIUS out. Home is the fitted OVERHEAD_LEAN at zoom 1; a drag orbits, a
// wheel or a pinch zooms, and Home, a double tap or a double click on empty board glides back over GLIDE_MS (instant under
// reduced motion). A HUD that grows or shrinks glides the fit alone and leaves the eye where the player put it.
type Pose = { left: number; right: number; top: number; bottom: number; tx: number; tz: number; polar: number; azimuth: number; zoom: number };
const FIT_KEYS: (keyof Pose)[] = ["left", "right", "top", "bottom", "tx", "tz"];
const EYE_KEYS: (keyof Pose)[] = ["polar", "azimuth", "zoom"];
const ORBIT_RADIUS = 18;
const GLIDE_MS = 280;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 32;
const _eye = new THREE.Vector3();
const _sph = new THREE.Spherical();

export class IsleRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
  private overhead = false;
  private pending: { kind: string; id: string } | null = null;
  private downType = "mouse";
  private gesture = new TouchGesture();
  private lastTap = { t: 0, x: 0, y: 0, empty: false };
  // Set once a single pointer has moved past the tap slop; an out-and-back drag ends where it began and must not place.
  private dragged = false;
  private safeProbe: HTMLDivElement;
  private controls: OrbitControls;
  private orbit: OrbitControls;
  // The fit the overhead view is on, null until the view is first shown; `shownAt` is `renders` when it was switched to.
  private fit: OrthoFit | null = null;
  private shownAt = -1;
  private glide: { from: Pose; to: Pose; keys: (keyof Pose)[]; start: number } | null = null;
  // The hole is re-measured on the next frame after a view or state change (React has committed the HUD by then), never on
  // HUD housekeeping alone (a timed notice leaving, the Place chip): the camera moves with the game, and an idle board idles.
  private refitDue = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private land = new THREE.Group();
  private pieces = new THREE.Group();
  private marks = new THREE.Group();
  private living = new THREE.Group();
  private pickables: THREE.Object3D[] = [];
  private composer!: EffectComposer;
  private ssao!: SSAOPass;
  private renderPass!: RenderPass;
  private wayfarer: THREE.Group;
  private sheep: Sheep[] = [];
  private boats: THREE.Group[] = [];
  private trees: THREE.Object3D[] = [];
  private wheat: THREE.Object3D[] = [];
  private textures: Partial<Record<Terrain, THREE.Texture>> = {};
  private lastLand: string | null = null;
  private lastSeq = -1;
  private lastState: GameState | null = null;
  private lastHi: Highlights = { vertices: [], edges: [], hexes: [] };
  private lastInteractive = false;
  // #438: each piece on the board by key ("e:<edge>" / "v:<vertex>") and its kind, and when the ones still landing were
  // placed (performance.now()), so a rebuild mid-fall carries the fall over to the new mesh instead of restarting it.
  private placed = new Map<string, PieceKind>();
  private landStart = new Map<string, number>();
  private landings: { obj: THREE.Object3D; kind: PieceKind; start: number; restY: number }[] = [];
  private legalIds = new Set<string>();
  private down = { x: 0, y: 0 };
  private stopped = false;
  private robberTarget = new THREE.Vector3();
  private walk: { from: THREE.Vector3; to: THREE.Vector3; start: number; hops: number; dur: number } | null = null;
  private lantern: THREE.MeshStandardMaterial;
  // Each land hex's cap material by hex id, and the flashes under way (age in seconds, advanced by the frame's dt).
  caps = new Map<string, THREE.MeshStandardMaterial>();
  private flashes: { mat: THREE.MeshStandardMaterial; age: number }[] = [];
  private clock = new THREE.Timer();
  private water = makeWater();
  private titleMode = false;
  private lastFrame = 0;
  // Until when the loop runs at full rate: a drag, a camera move, a walk or a state change holds it there for 1 s (#331).
  private busyUntil = 0;
  private lastMarks = "";
  private wasCalm = false;
  // prefers-reduced-motion (#382): nothing ambient moves, and the loop draws only on a change.
  private calmMq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  // Frames drawn; the idle proof counts them.
  renders = 0;
  private foam!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private coastMiter = new Map<string, { mx: number; mz: number }>();
  private onPick: (kind: "hex" | "vertex" | "edge", id: string) => void;
  private onSelect: (sel: { kind: "hex" | "vertex" | "edge"; id: string } | null) => void;

  constructor(
    canvas: HTMLCanvasElement,
    onPick: (kind: "hex" | "vertex" | "edge", id: string) => void,
    onSelect: (sel: { kind: "hex" | "vertex" | "edge"; id: string } | null) => void = () => {},
  ) {
    this.onPick = onPick;
    this.onSelect = onSelect;
    this.safeProbe = document.createElement("div");
    this.safeProbe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(this.safeProbe);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    // Frame cost tracks pixels (#310): 1.5 on a phone is 2.25x the pixels of 1, against 4x at 2.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.coarse() ? 1.5 : 2));
    this.renderer.setClearColor(0x6a93a0, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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
    this.controls.autoRotateSpeed = 0.28;
    this.calmMq?.addEventListener("change", this.onCalm);
    this.controls.addEventListener("start", this.wake);
    this.controls.addEventListener("change", this.wake);
    this.orbit = new OrbitControls(this.ortho, canvas);
    this.orbit.enabled = false;
    // No damping: the board stops where the pointer stops, and nothing drifts after a glide home.
    this.orbit.enableDamping = false;
    this.orbit.enablePan = false;
    this.orbit.minZoom = 0.8;
    this.orbit.maxZoom = 2.4;
    this.orbit.minPolarAngle = 0.12;
    this.orbit.maxPolarAngle = 1.15;
    this.orbit.addEventListener("start", this.wake);
    this.orbit.addEventListener("change", this.wake);

    this.scene.fog = new THREE.Fog(0x6a93a0, 26, 52);
    // A lit board on a table (polish.md "The board look target", #135): one warm key lamp carries the light, so the
    // slabs shade on their sides and every prop casts a soft shadow; the sky and ground bounce are low and nearly grey,
    // so the caps' own paint is the colour on screen. No flat ambient: that was what washed the caps out.
    this.scene.add(new THREE.HemisphereLight(0xe9e4da, 0xc8ad86, 0.55));
    const sun = new THREE.DirectionalLight(0xffe3bd, 2.1);
    sun.position.set(8, 16, 6);
    sun.castShadow = true;
    // 1024 over 18 units, blurred 6 texels: shadow edges soften over about a tenth of a hex, like a lamp, not the noon sun.
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 6;
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd9e4ea, 0.3);
    fill.position.set(-8, 8, -4);
    this.scene.add(fill);

    // Water, beach, and foam (docs/design/ocean.md). Built once: the outline does not change when the isle is dealt.
    const ocean = new THREE.Mesh(new THREE.CircleGeometry(48, 64), this.water);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.02;
    this.scene.add(ocean);

    const coast = coastLoop();
    for (const c of coast) this.coastMiter.set(c.id, { mx: c.mx, mz: c.mz });
    const beach = new THREE.Mesh(
      coastStrip(coast, -0.04, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xe8d7b0, roughness: 1, metalness: 0 }),
    );
    beach.position.y = 0.015;
    beach.receiveShadow = true;
    this.scene.add(beach);

    this.foam = new THREE.Mesh(
      coastStrip(coast, 0.22, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xe8f8f8, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.foam.position.y = 0.028;
    this.scene.add(this.foam);

    this.wayfarer = makeWayfarer();
    this.lantern = this.wayfarer.userData.lantern as THREE.MeshStandardMaterial;
    this.living.add(this.wayfarer);
    this.scene.add(this.land, this.living, this.pieces, this.marks);

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointercancel", this.onCancel);
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    // Focus moving into or out of the chrome (the keyboard PlaceList shows while focused) changes the hole.
    canvas.parentElement?.addEventListener("focusin", this.remeasure);
    canvas.parentElement?.addEventListener("focusout", this.remeasure);
    this.resize();
    this.loadTextures();
    this.clock.connect(document);
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.ssao = new SSAOPass(this.scene, this.camera, 1, 1);
    this.ssao.kernelRadius = 10;
    this.ssao.minDistance = 0.001;
    this.ssao.maxDistance = 0.08;
    this.composer.addPass(this.ssao);
    this.composer.addPass(new OutputPass());
    this.renderer.setAnimationLoop(this.tick);
  }

  // Off the table (title and lobby) the island is a backdrop under a card: the slow orbit, no SSAO, 30 frames a second.
  // In play it is the overhead board fitted to the HUD hole, which the player may orbit and zoom and snap home again.
  setTitleMode(v: boolean) {
    if (v !== this.titleMode) this.wake();
    this.titleMode = v;
    this.ssao.enabled = !v && !this.overhead;
    this.setView(v ? "free" : "overhead");
  }

  private coarse() {
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  }

  private calm() {
    return this.calmMq?.matches ?? false;
  }

  // The preference flipped: draw the island as it stands now. The event comes a frame after `matches` changes, so tick reads that.
  private onCalm = () => this.wake();

  private safe(): Insets {
    const cs = getComputedStyle(this.safeProbe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }

  // The hole the HUD leaves for the island right now, measured from the chrome around the canvas. Proofs read it too.
  insets(): Insets {
    const c = this.renderer.domElement;
    const shell = c.parentElement;
    return chromeInsets(c.clientWidth, c.clientHeight, shell ? solidRects(shell, c) : [], this.safe());
  }

  // Overhead is one orthographic camera fitted to the HUD hole, on its own orbit; Free is the tilted title view.
  setView(view: "overhead" | "free") {
    const over = view === "overhead";
    if (over === this.overhead) return;
    this.wake();
    this.overhead = over;
    this.controls.enabled = !over;
    this.orbit.enabled = over;
    this.ssao.enabled = !over && !this.titleMode;
    const cam = over ? this.ortho : this.camera;
    this.renderPass.camera = cam;
    this.ssao.camera = cam;
    // Each entry to the table starts from home.
    this.fit = null;
    this.glide = null;
    this.shownAt = this.renders;
    this.refitDue = true;
    this.resize();
  }

  // The mark a coarse pointer has selected, waiting for the Place chip. Pulses it and locks orbit meanwhile.
  setPending(p: { kind: string; id: string } | null) {
    if (p?.id !== this.pending?.id) this.wake();
    this.pending = p;
    this.controls.enableRotate = !p;
    this.orbit.enableRotate = !p;
    for (const o of this.marks.children) {
      const m = o as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      if (m.userData?.id && mat && "emissiveIntensity" in mat) mat.emissiveIntensity = m.userData.id === p?.id ? 1.4 : (m.userData.baseGlow as number);
    }
  }

  // Glow the caps of the hexes that paid. Each rises to the warm tint of its resource colour and fades back, once.
  flashHexes(ids: string[]) {
    for (const id of ids) {
      const mat = this.caps.get(id);
      if (!mat) continue;
      this.flashes = this.flashes.filter((f) => f.mat !== mat);
      this.flashes.push({ mat, age: 0 });
    }
  }

  // The caps' emissive for each flash at its age. Reduced motion steps to the peak and back with no ramp.
  private stepFlashes(dt: number, calm: boolean) {
    if (!this.flashes.length) return;
    for (const f of this.flashes) {
      f.age += dt;
      const a = f.age;
      const level = a >= FLASH_S ? 0 : calm ? 1 : a < FLASH_IN_S ? 1 - (1 - a / FLASH_IN_S) ** 3 : 1 - (a - FLASH_IN_S) / (FLASH_S - FLASH_IN_S);
      f.mat.emissiveIntensity = FLASH_PEAK * level;
    }
    this.flashes = this.flashes.filter((f) => f.age < FLASH_S);
  }

  setBoard(state: GameState, highlights: Highlights, interactive: boolean) {
    // Only a roll seen live flashes: the same island and exactly one more dice roll than last time. Landing on a state that
    // already has rolls (a spectator, a rejoin, the title's island carried into a game) does not; several actions in one push
    // (online bots) still flash when one roll is among them.
    const prev = this.lastState;
    const rolled = prev && landKey(prev) === landKey(state) && (state.rolls ?? 0) === (prev.rolls ?? 0) + 1;
    this.lastState = state;
    this.lastHi = highlights;
    this.lastInteractive = interactive;
    // Online clients get no seed until the game ends (#111), so a new island is spotted by what buildLand draws.
    const land = landKey(state);
    const landChanged = this.lastLand !== land;
    // The store calls this on every change, chat and timers included; only what the island draws wakes the loop.
    const marks = `${interactive}|${highlights.vertices}|${highlights.edges}|${highlights.hexes}`;
    if (landChanged || this.lastSeq !== state.seq || marks !== this.lastMarks) this.wake();
    // A new state or an armed build (the marks change with the phase bar) re-measures the hole on the next frame.
    if (landChanged || this.lastSeq !== state.seq || marks !== this.lastMarks) this.refitDue = true;
    this.lastMarks = marks;
    if (landChanged) {
      this.buildLand(state);
      this.lastLand = land;
    }
    if (this.lastSeq !== state.seq) {
      this.buildPieces(state, landChanged || this.lastSeq === -1);
      this.lastSeq = state.seq;
    }
    this.buildMarks(state, highlights, interactive);
    if (rolled) this.flashHexes(payingHexes(state));
    const rh = state.hexes.find((h) => h.id === state.robberHex);
    if (rh) {
      const w = worldOfHex(rh);
      // The wastes have no token, so his feet are on the cap there.
      this.robberTarget.set(w.x, topOf(rh.terrain) + (rh.pip === null ? 0 : 0.07), w.z);
      if (!this.wayfarer.userData.placed || landChanged) {
        this.walk = null;
        this.wayfarer.position.copy(this.robberTarget);
        this.wayfarer.userData.placed = true;
      } else if (!this.walk) this.startWalk();
    }
  }

  // One 0.3-high hop per hex of distance, 300 ms each, 900 ms at most.
  private startWalk() {
    const from = this.wayfarer.position;
    const dist = Math.hypot(this.robberTarget.x - from.x, this.robberTarget.z - from.z);
    if (dist <= 0.01) return;
    if (this.calm()) {
      // Reduced motion: he turns and is simply there (#382).
      this.wayfarer.lookAt(this.robberTarget.x, from.y, this.robberTarget.z);
      this.wayfarer.position.copy(this.robberTarget);
      return;
    }
    const hops = Math.max(1, Math.round(dist / (HEX_SIZE * SQRT3)));
    // The clock is only as fresh as the last drawn frame, up to 83 ms old while idle; add the time since, so the hop starts at 0.
    const start = this.clock.getElapsed() + (performance.now() - this.lastFrame) / 1000;
    this.walk = { from: from.clone(), to: this.robberTarget.clone(), start, hops, dur: Math.min(0.9, 0.3 * hops) };
  }

  // Where a hex, corner, or edge id sits on screen, in page pixels. For the chat proof, which checks nothing covers a target.
  screenOf(id: string): { x: number; y: number } | null {
    const st = this.lastState;
    if (!st) return null;
    const tops = hexTops(st);
    const vmap = new Map(st.vertices.map((v) => [v.id, v]));
    const p = new THREE.Vector3();
    const v = vmap.get(id);
    const e = st.edges.find((x) => x.id === id);
    const h = st.hexes.find((x) => x.id === id);
    if (v) p.set(v.x, vertexTop(tops, v), v.z);
    else if (e) {
      const a = vmap.get(e.va)!;
      const b = vmap.get(e.vb)!;
      p.set((a.x + b.x) / 2, edgeTop(tops, a, b), (a.z + b.z) / 2);
    } else if (h) {
      const w = worldOfHex(h);
      p.set(w.x, topOf(h.terrain), w.z);
    } else return null;
    p.project(this.overhead ? this.ortho : this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  dispose() {
    this.stopped = true;
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.orbit.dispose();
    this.calmMq?.removeEventListener("change", this.onCalm);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKey);
    this.renderer.domElement.parentElement?.removeEventListener("focusin", this.remeasure);
    this.renderer.domElement.parentElement?.removeEventListener("focusout", this.remeasure);
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onUp);
    this.renderer.domElement.removeEventListener("pointermove", this.onMove);
    this.renderer.domElement.removeEventListener("pointercancel", this.onCancel);
    this.safeProbe.remove();
    this.renderer.dispose();
  }

  private loadTextures() {
    const loader = new THREE.TextureLoader();
    const kinds = Object.keys(TEX_FILE) as Terrain[];
    let left = kinds.length;
    const done = (k: Terrain, tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      this.textures[k] = tex;
      left -= 1;
      if (left === 0 && this.lastState) {
        this.lastLand = null;
        this.setBoard(this.lastState, this.lastHi, this.lastInteractive);
      }
    };
    for (const k of kinds) {
      // The photo textures lived only in the old sandbox. A missing file gets a painted one.
      const url = photoUrl(k);
      if (url) loader.load(url, (tex) => done(k, tex), undefined, () => done(k, paintedTexture(k)));
      else done(k, paintedTexture(k));
    }
  }

  private wake = () => {
    this.busyUntil = performance.now() + 1000;
  };

  private resize = () => {
    this.wake();
    const c = this.renderer.domElement;
    const w = c.clientWidth || 1;
    const h = c.clientHeight || 1;
    this.camera.aspect = w / h;
    // Dolly limit: OrbitControls.update() clamps the current distance to the new max on the next frame.
    this.controls.maxDistance = freeMaxDistance(h, hudInsets(w, h, this.coarse(), this.safe()), this.coarse());
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.ssao?.setSize(w, h);
    this.refit(true);
  };

  // The player changed the chrome without the game moving (opened the chat or a sheet, focused the PlaceList): measure the
  // hole again on the next frame. Cheap enough to call on every such change; a hole that did not change refits nothing.
  remeasure = () => {
    this.refitDue = true;
  };

  // Fit the overhead view to the hole the HUD leaves now. The first fit of a view lands at home; a later change of hole
  // (the phase bar grew with the state) glides the frustum and the look-at point and keeps the eye the player set.
  private refit(instant: boolean) {
    this.refitDue = false;
    if (!this.overhead) return;
    const c = this.renderer.domElement;
    const f = fitOrtho(c.clientWidth || 1, c.clientHeight || 1, this.insets(), OVERHEAD_LEAN);
    const was = this.fit;
    if (was && FIT_KEYS.every((k) => Math.abs(this.fitPose(f)[k] - this.fitPose(was)[k]) < 1e-6)) return;
    this.fit = f;
    if (!was) {
      this.applyPose(this.fitPose(f));
      this.orbit.update();
      return;
    }
    this.moveTo(this.fitPose(f), FIT_KEYS, instant || this.renders <= this.shownAt);
  }

  private fitPose(f: OrthoFit): Pose {
    return { left: f.left, right: f.right, top: f.top, bottom: f.bottom, tx: f.x, tz: f.z, polar: OVERHEAD_LEAN, azimuth: 0, zoom: 1 };
  }

  // Read from the camera itself, so it is right straight after applyPose, before the controls' next update.
  private pose(): Pose {
    const o = this.ortho;
    _sph.setFromVector3(_eye.copy(o.position).sub(this.orbit.target));
    return { left: o.left, right: o.right, top: o.top, bottom: o.bottom, tx: this.orbit.target.x, tz: this.orbit.target.z, polar: _sph.phi, azimuth: _sph.theta, zoom: o.zoom };
  }

  // Leaned toward the player (+Z is screen-down), looking at cap level over the hole's centre.
  private applyPose(p: Pose) {
    const o = this.ortho;
    o.left = p.left;
    o.right = p.right;
    o.top = p.top;
    o.bottom = p.bottom;
    o.zoom = p.zoom;
    this.orbit.target.set(p.tx, CAP_LEVEL, p.tz);
    o.up.set(0, 1, 0);
    o.position.setFromSphericalCoords(ORBIT_RADIUS, p.polar, p.azimuth).add(this.orbit.target);
    o.lookAt(this.orbit.target);
    o.updateProjectionMatrix();
  }

  // The wake's 1 s hold covers the glide; nothing re-arms it frame by frame, so the loop idles again right after.
  private moveTo(to: Pose, keys: (keyof Pose)[], instant: boolean) {
    this.wake();
    if (instant || this.calm()) {
      const p = this.pose();
      for (const k of keys) p[k] = to[k];
      this.applyPose(p);
      this.glide = null;
      return;
    }
    this.glide = { from: this.pose(), to, keys, start: performance.now() };
  }

  // Each frame of a glide: the eased mix of the keys on the move, the rest as they are now (a drag mid-glide still orbits).
  private stepGlide(now: number) {
    const g = this.glide;
    if (!g) return;
    const u = Math.min(1, (now - g.start) / GLIDE_MS);
    const e = 1 - (1 - u) ** 3;
    const p = this.pose();
    for (const k of g.keys) {
      let d = g.to[k] - g.from[k];
      // The short way round.
      if (k === "azimuth") d = Math.atan2(Math.sin(d), Math.cos(d));
      p[k] = g.from[k] + d * e;
    }
    this.applyPose(p);
    if (u >= 1) this.glide = null;
  }

  // Back to the fitted lean, zoom 1, over the hole's centre.
  goHome() {
    if (!this.overhead || !this.fit) return;
    this.moveTo(this.fitPose(this.fit), [...FIT_KEYS, ...EYE_KEYS], false);
  }

  // A drag mid-glide takes the eye (a tap does not: the controls fire "start" on every press); the fit keeps gliding.
  private dragTakesEye() {
    if (!this.glide) return;
    this.glide.keys = this.glide.keys.filter((k) => !EYE_KEYS.includes(k));
    if (!this.glide.keys.length) this.glide = null;
  }

  // Home snaps the view unless the key means something where it landed: a text field, a dialog, a scrolling region (the
  // chat log, the bottom stack), a modifier chord, or a handler that already took it.
  private onKey = (e: KeyboardEvent) => {
    if (e.key !== "Home" || !this.overhead || this.titleMode) return;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (t?.closest("[role=dialog], [role=alertdialog]") || inScroller(t)) return;
    e.preventDefault();
    this.goHome();
  };

  private onDown = (e: PointerEvent) => {
    this.wake();
    this.down.x = e.clientX;
    this.down.y = e.clientY;
    this.downType = e.pointerType;
    this.dragged = false;
    this.gesture.down(e.pointerId, e.clientX, e.clientY);
  };

  // The orbit controls own the drag and the pinch; this keeps the finger count and whether the pointer ever left the tap.
  private onMove = (e: PointerEvent) => {
    if (!this.gesture.pointers.has(e.pointerId)) return;
    this.gesture.move(e.pointerId, e.clientX, e.clientY);
    this.wake();
    if (this.dragged || this.gesture.pointers.size !== 1) return;
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > tapSlop(this.downType, this.coarse())) {
      this.dragged = true;
      this.dragTakesEye();
    }
  };

  private onCancel = (e: PointerEvent) => {
    this.gesture.up(e.pointerId);
  };

  private onUp = (e: PointerEvent) => {
    if (this.gesture.up(e.pointerId) || this.dragged) return;
    const coarse = this.coarse();
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > tapSlop(this.downType, coarse)) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.overhead ? this.ortho : this.camera);
    const hits = this.raycaster
      .intersectObjects(this.pickables, true)
      .filter((h) => h.object.userData.id)
      .map((h) => ({ kind: h.object.userData.kind as "hex" | "vertex" | "edge", id: h.object.userData.id as string, distance: h.distance }));
    const hit = pickBest(hits);
    const legal = hit !== undefined && this.legalIds.has(hit.id);
    // Two taps on empty board (nothing legal under either) within DOUBLE_TAP_MS and DOUBLE_TAP_PX snap the view home.
    const now = performance.now();
    const again = now - this.lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) <= DOUBLE_TAP_PX;
    if (this.overhead && !legal && again && this.lastTap.empty) {
      this.lastTap.t = 0;
      if (this.pending) this.onSelect(null);
      this.goHome();
      return;
    }
    this.lastTap = { t: now, x: e.clientX, y: e.clientY, empty: !legal };
    const touch = coarse || this.downType === "touch";
    if (!touch) {
      if (hit) this.onPick(hit.kind, hit.id);
      return;
    }
    if (!hit || !legal) {
      if (this.pending) this.onSelect(null);
      return;
    }
    if (isSelectTap(coarse, this.downType, this.pending?.id ?? null, hit.id)) this.onSelect({ kind: hit.kind, id: hit.id });
    else this.onPick(hit.kind, hit.id);
  };

  // The legal marks breathe between 0.6x and 1.2x of their base glow on the 1.2 s pulse token, one shared phase (#437).
  // Reduced motion holds the base glow. The wayfarer's hex ring keeps its own faster pulse. Marks pulse at the idle 12 fps by design.
  private pulseMarks(t: number, still: boolean) {
    const k = still ? 1 : 0.9 + 0.3 * Math.sin((t * 2 * Math.PI) / LEGAL_PULSE_S);
    for (const m of this.marks.children) {
      const base = m.userData.baseGlow as number | undefined;
      if (base === undefined || m.userData.id === this.pending?.id) continue;
      const mat = (m as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material;
      mat.emissiveIntensity = m.userData.kind === "hex" ? (still ? base : 0.5 + 0.35 * (0.5 + 0.5 * Math.sin(t * 4))) : base * k;
    }
  }

  private tick = () => {
    if (this.stopped) return;
    const now = performance.now();
    // Title: 30 fps. On the board with nothing moving: 12 fps, enough to keep the water, sheep and boats alive (#331).
    const pulsing = this.marks.children.some((m) => m.userData.kind === "hex" && m.userData.id !== this.pending?.id);
    // Reduced motion (#382): no tick at all; a drag, a camera move or a state push still draws for its 1 s hold.
    const calm = this.calm();
    // Reading `matches` here can swallow the change event, so a flip seen on this frame wakes the loop itself.
    if (calm !== this.wasCalm) {
      this.wasCalm = calm;
      this.wake();
    }
    this.stepLandings(now, calm);
    if (this.refitDue) this.refit(false);
    if (calm && this.walk) {
      this.walk = null;
      this.startWalk();
    }
    const busy = now < this.busyUntil || this.flashes.length > 0;
    const gap = calm ? (busy ? 0 : Infinity) : this.titleMode ? 1000 / 30 : this.walk || pulsing || busy ? 0 : 1000 / 12;
    if (now - this.lastFrame < gap - 2) return;
    this.lastFrame = now;
    this.clock.update();
    const t = this.clock.getElapsed();
    // An idle frame is 83 ms apart; a smaller cap would slow the sheep while idle.
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.stepFlashes(dt, calm);
    this.controls.autoRotate = this.titleMode && !calm;
    if (this.overhead) {
      this.orbit.update();
      this.stepGlide(now);
    } else this.controls.update();
    if (calm) {
      this.pulseMarks(0, true);
      this.composer.render();
      this.renders += 1;
      return;
    }
    this.water.uniforms.uTime!.value = t;
    this.foam.material.opacity = 0.32 + 0.23 * (0.5 + 0.5 * Math.sin(t * 0.8));
    for (const tr of this.trees) tr.rotation.z = Math.sin(t * 1.05 + tr.position.x * 2) * 0.028;
    if (this.walk) {
      const w = this.walk;
      const u = Math.min(1, (t - w.start) / w.dur);
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      this.wayfarer.position.lerpVectors(w.from, w.to, e);
      this.wayfarer.position.y += 0.3 * Math.abs(Math.sin(Math.PI * u * w.hops));
      this.wayfarer.lookAt(w.to.x, this.wayfarer.position.y, w.to.z);
      if (u >= 1) {
        this.wake();
        this.walk = null;
        this.startWalk();
      }
    }
    this.lantern.emissiveIntensity = 1.6 + 0.3 * Math.sin(t * 2.2);
    this.pulseMarks(t, false);
    for (const s of this.sheep) {
      s.wait -= dt;
      if (s.wait <= 0) {
        // A step of at most 0.3 rad around the ring keeps the straight walk to the target off the token.
        const a = Math.atan2(s.tz - s.oz, s.tx - s.ox) + (Math.random() - 0.5) * 0.6;
        const r = 0.54 + Math.random() * 0.2;
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
    this.renders += 1;
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
    this.caps.clear();
    this.flashes = [];

    for (const h of state.hexes) {
      const { x, z } = worldOfHex(h);
      const height = hexHeight(h.terrain);
      const tile = makeHexTile(HEX_SIZE * 0.995, height, this.textures[h.terrain], SIDE[h.terrain]);
      tile.position.set(x, TILE_Y, z);
      tile.userData = { kind: "hex", id: h.id, land: true };
      tile.traverse((o) => {
        o.userData = tile.userData;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      this.land.add(tile);
      this.pickables.push(tile);
      const cap = tile.getObjectByName("cap") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      cap.material.emissive.copy(new THREE.Color(PAINT[h.terrain][0]).lerp(FLASH_WARM, 0.6));
      cap.material.emissiveIntensity = 0;
      this.caps.set(h.id, cap.material);
      decorate(this.living, this.trees, this.wheat, this.sheep, h, x, z, topOf(h.terrain));
      if (h.pip != null) {
        const tok = numberToken(h.pip);
        tok.userData.token = h.pip;
        tok.position.set(x, topOf(h.terrain) + 0.04, z);
        this.land.add(tok);
      }
    }

    for (const v of state.vertices) {
      if (!v.harbor) continue;
      const m = this.coastMiter.get(v.id);
      if (!m) continue; // every harbor is coastal; a miss here is a bug in coastLoop, not a fallback case
      const jettyStart = 0.22; // the beach's own outer offset (docs/design/ocean.md)
      const jettyLen = 0.24; // ends at 0.46: just past the foam's 0.42 outer offset
      const px = v.x + m.mx * (jettyStart + jettyLen / 2);
      const pz = v.z + m.mz * (jettyStart + jettyLen / 2);
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.05, jettyLen),
        new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.82 }),
      );
      pier.position.set(px, 0.1, pz);
      pier.lookAt(v.x + m.mx, 0.1, v.z + m.mz);
      pier.castShadow = true;
      this.land.add(pier);

      const boat = makeBoat(v.harbor);
      const bx = v.x + m.mx * (jettyStart + jettyLen + 0.16);
      const bz = v.z + m.mz * (jettyStart + jettyLen + 0.16);
      boat.position.set(bx, 0.08, bz);
      boat.lookAt(v.x, 0.08, v.z);
      boat.userData.vid = v.id;
      this.living.add(boat);
      this.boats.push(boat);
    }
  }

  // A new board (or a first one, as on a reconnect) is drawn standing; only pieces added since the last board land.
  private buildPieces(state: GameState, fresh: boolean) {
    disposeGroup(this.pieces);
    const now = performance.now();
    if (fresh) this.landStart.clear();
    const before = fresh ? new Map<string, PieceKind>() : this.placed;
    const calm = this.calm();
    this.placed = new Map();
    this.landings = [];
    const land = (obj: THREE.Object3D, key: string, kind: PieceKind, seat: string) => {
      obj.userData = { piece: kind, key, restY: obj.position.y, mark: seatMark(seat)?.mark ?? null };
      this.placed.set(key, kind);
      const start = !fresh && !calm && before.get(key) !== kind ? now : this.landStart.get(key);
      if (start === undefined || now - start >= LAND_MS[LAND_SOUND[kind]]) {
        this.landStart.delete(key);
        return;
      }
      this.landStart.set(key, start);
      const l = { obj, kind, start, restY: obj.position.y };
      this.landings.push(l);
      poseLanding(l, now);
    };
    const vmap = new Map(state.vertices.map((v) => [v.id, v]));
    const pmap = new Map(state.players.map((p) => [p.id, p]));
    const tops = hexTops(state);

    for (const e of state.edges) {
      if (!e.path) continue;
      const a = vmap.get(e.va)!;
      const b = vmap.get(e.vb)!;
      const color = pmap.get(e.path)?.color ?? "#ccc";
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const rot = Math.atan2(dx, dz);
      const road = makePath(color, Math.hypot(dx, dz) * 0.9, rot);
      road.position.set((a.x + b.x) / 2, edgeTop(tops, a, b), (a.z + b.z) / 2);
      road.rotation.y = rot;
      this.pieces.add(road);
      land(road, `e:${e.id}`, "path", color);
    }

    for (const v of state.vertices) {
      if (!v.building) continue;
      const color = pmap.get(v.building.playerId)?.color ?? "#ccc";
      const house = v.building.kind === "stronghold" ? makeStronghold(color) : makeOutpost(color);
      house.position.set(v.x, vertexTop(tops, v), v.z);
      this.pieces.add(house);
      land(house, `v:${v.id}`, v.building.kind, color);
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

  // Pose every landing piece for this moment; a finished one is left exactly at rest. Reduced motion skips to rest.
  private stepLandings(now: number, calm: boolean) {
    if (!this.landings.length) return;
    for (const l of this.landings) poseLanding(l, calm ? Infinity : now);
    this.landings = this.landings.filter((l) => !calm && now - l.start < LAND_MS[LAND_SOUND[l.kind]]);
    for (const [key, start] of this.landStart) if (calm || now - start >= LAND_MAX) this.landStart.delete(key);
  }

  private buildMarks(state: GameState, hi: Highlights, interactive: boolean) {
    disposeGroup(this.marks);
    this.pickables = this.pickables.filter((o) => o.userData.kind === "hex" && o.userData.land);
    this.legalIds = interactive ? new Set([...hi.vertices, ...hi.edges, ...hi.hexes]) : new Set();
    if (!interactive) return;
    const vset = new Set(hi.vertices);
    const eset = new Set(hi.edges);
    const hset = new Set(hi.hexes);
    const vmap = new Map(state.vertices.map((v) => [v.id, v]));
    const tops = hexTops(state);
    // Marks show only for the seat to act, so that seat's colour is the one every mark wears.
    const seat = new THREE.Color(state.players.find((p) => p.id === state.current)?.color ?? "#fff6e8");
    // The glow leans toward cream so a dark seat (Pine) still reads on forest at the pulse trough; the hue stays the seat's.
    const glow = seat.clone().lerp(new THREE.Color(0xfff6e8), 0.35);

    for (const v of state.vertices) {
      if (!vset.has(v.id)) continue;
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.025, 8, 24),
        new THREE.MeshStandardMaterial({ color: seat, emissive: glow, emissiveIntensity: 0.8 }),
      );
      m.rotation.x = Math.PI / 2;
      m.position.set(v.x, vertexTop(tops, v) + 0.03, v.z);
      m.userData = { kind: "vertex", id: v.id, baseGlow: 0.8 };
      this.marks.add(m);
      const pick = new THREE.Mesh(new THREE.SphereGeometry(PICK_VERTEX_RADIUS, 8, 6), new THREE.MeshBasicMaterial());
      pick.visible = false;
      pick.position.copy(m.position);
      pick.userData = { kind: "vertex", id: v.id };
      this.marks.add(pick);
      this.pickables.push(pick);
    }
    for (const e of state.edges) {
      if (!eset.has(e.id)) continue;
      const a = vmap.get(e.va)!;
      const b = vmap.get(e.vb)!;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.07, Math.hypot(b.x - a.x, b.z - a.z) * 0.72),
        new THREE.MeshStandardMaterial({ color: seat, emissive: glow, emissiveIntensity: 0.45 }),
      );
      m.position.set((a.x + b.x) / 2, edgeTop(tops, a, b) + 0.035, (a.z + b.z) / 2);
      m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      m.userData = { kind: "edge", id: e.id, baseGlow: 0.45 };
      this.marks.add(m);
      const len = Math.hypot(b.x - a.x, b.z - a.z) * PICK_EDGE.lengthScale;
      const pick = new THREE.Mesh(new THREE.BoxGeometry(PICK_EDGE.w, PICK_EDGE.h, len), new THREE.MeshBasicMaterial());
      pick.visible = false;
      pick.position.copy(m.position);
      pick.rotation.y = m.rotation.y;
      pick.userData = { kind: "edge", id: e.id };
      this.marks.add(pick);
      this.pickables.push(pick);
    }
    for (const h of state.hexes) {
      if (!hset.has(h.id)) continue;
      const { x, z } = worldOfHex(h);
      const ring = new THREE.Mesh(
        hexRing(HEX_SIZE * 0.94, HEX_SIZE * 0.76),
        new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 0.6, roughness: 0.6 }),
      );
      ring.position.set(x, topOf(h.terrain) + 0.012, z);
      ring.userData = { kind: "hex", id: h.id, baseGlow: 0.6 };
      this.marks.add(ring);
      this.pickables.push(ring);
    }
    this.setPending(this.pending);
  }
}

// Each hex id's top y.
function hexTops(state: GameState) {
  return new Map(state.hexes.map((h) => [h.id, topOf(h.terrain)]));
}

// A corner sits on the highest hex it touches.
function vertexTop(tops: Map<string, number>, v: Vertex) {
  return Math.max(...v.hexes.map((id) => tops.get(id) ?? 0));
}

// An edge sits on the higher of the (one or two) hexes its two corners share.
function edgeTop(tops: Map<string, number>, a: Vertex, b: Vertex) {
  const shared = a.hexes.filter((id) => b.hexes.includes(id));
  return Math.max(...(shared.length ? shared : a.hexes).map((id) => tops.get(id) ?? 0));
}

// Everything buildLand draws: each hex's terrain and token, and the corners that hold a dock.
function landKey(state: GameState) {
  const hexes = state.hexes.map((h) => `${h.id}:${h.terrain}:${h.pip ?? ""}`).join(",");
  const docks = state.vertices.filter((v) => v.harbor).map((v) => v.id).join(",");
  return `${hexes}|${docks}`;
}

// The chrome a tap cannot pass through, one box per child of the shell, in canvas pixels. An element that takes pointer
// events catches taps across its whole box, so it is its own box and nothing more (clipped overflow and sr-only text do not
// count), even when a decorative child inside it (absolute or fixed, pointer-events: none: a flash, a fade) lets taps through.
// An element that lets taps through is only the union of what is inside it, and so is a taking element with such an in-flow
// child, since that child is what gives it its size: the chat dock measures as its button and not as the 288 px preview list.
function solidRects(shell: Element, canvas: Element): Rect[] {
  const base = canvas.getBoundingClientRect();
  const local = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top };
  };
  const join = (a: Rect | null, b: Rect | null): Rect | null =>
    !a ? b : !b ? a : { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
  const box = (el: Element): { r: Rect | null; porous: boolean } => {
    if (el === canvas) return { r: null, porous: false };
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return { r: null, porous: false };
    const kids = [...el.children].map(box);
    let u: Rect | null = null;
    for (const k of kids) u = join(u, k.r);
    if (cs.pointerEvents === "none") return { r: u, porous: cs.position !== "absolute" && cs.position !== "fixed" };
    // A taking element whose only parts let taps through is still itself a target: its own box.
    if (kids.some((k) => k.porous)) return { r: u ?? local(el), porous: true };
    return { r: local(el), porous: false };
  };
  return [...shell.children].map((k) => box(k).r).filter((r): r is Rect => r !== null);
}

// True inside a region that scrolls on its own (the chat log, the bottom stack), where Home means "to the top".
function inScroller(el: HTMLElement | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return true;
  }
  return false;
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

// The sea: an unlit shader, so the sun cannot paint a hotspot on it. Shallow to deep, a slow ripple, then the fog.
// A calm teal that never competes with the land: the ripple scales the colour by a few percent rather than adding to it
// (an added 0.022 was a third of the deep colour's linear value and drew dark blotches across the whole sea).
function makeWater() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x4596a0) },
      uDeep: { value: new THREE.Color(0x225a68) },
      uFog: { value: new THREE.Color(0x6a93a0) },
    },
    vertexShader: /* glsl */ `
      // The circle is local XY; +Z is up after the mesh's rotation. Crests stay at or below y = 0.
      uniform float uTime;
      varying vec2 vXZ;
      void main() {
        vec3 p = position;
        p.z += sin(p.x * 1.6 + uTime * 0.55) * sin(p.y * 1.25 + uTime * 0.40) * 0.012;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vXZ = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFog;
      varying vec2 vXZ;
      void main() {
        float d = length(vXZ);
        vec3 c = mix(uShallow, uDeep, smoothstep(4.2, 7.5, d));
        c *= 1.0 + 0.03 * sin(vXZ.x * 2.1 + uTime * 0.9) * sin(vXZ.y * 1.7 - uTime * 0.7);
        c = mix(c, uFog, smoothstep(18.0, 40.0, d));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

// The island's outline: the coastal corners of the 19 hexes in order, each with its outward miter (#130).
function coastLoop() {
  const pts = new Map<string, { x: number; z: number }>();
  const edges = new Map<string, { a: string; b: string; n: number }>();
  for (const { q, r } of hexesInRadius(2)) {
    const ids = hexCorners(q, r).map((c) => {
      const id = vertexId(c.x, c.z);
      pts.set(id, c);
      return id;
    });
    for (let i = 0; i < 6; i++) {
      const a = ids[i]!;
      const b = ids[(i + 1) % 6]!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const e = edges.get(key);
      if (e) e.n += 1;
      else edges.set(key, { a, b, n: 1 });
    }
  }
  // An edge is coastal when exactly one hex uses it.
  const next = new Map<string, string[]>();
  for (const e of edges.values()) {
    if (e.n !== 1) continue;
    next.set(e.a, [...(next.get(e.a) ?? []), e.b]);
    next.set(e.b, [...(next.get(e.b) ?? []), e.a]);
  }
  const start = next.keys().next().value!;
  const loop = [start];
  let prev = start;
  let cur = next.get(start)![0]!;
  while (cur !== start) {
    const ns = next.get(cur)!;
    if (ns.length !== 2 || loop.length > next.size) throw new Error("coast walk: the outline forks or does not close");
    loop.push(cur);
    const to = ns[0] === prev ? ns[1]! : ns[0]!;
    prev = cur;
    cur = to;
  }
  if (loop.length !== next.size) throw new Error("coast walk: more than one island");

  // The outward normal of edge p->q: the perpendicular on the side away from the origin (the island is centered there).
  const normal = (p: { x: number; z: number }, q: { x: number; z: number }) => {
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const l = Math.hypot(dx, dz);
    let nx = dz / l;
    let nz = -dx / l;
    if (nx * (p.x + q.x) + nz * (p.z + q.z) < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { nx, nz };
  };
  return loop.map((id, i) => {
    const p = pts.get(id)!;
    const a = normal(pts.get(loop[(i + loop.length - 1) % loop.length]!)!, p);
    const b = normal(p, pts.get(loop[(i + 1) % loop.length]!)!);
    let mx = a.nx + b.nx;
    let mz = a.nz + b.nz;
    const ml = Math.hypot(mx, mz);
    mx /= ml;
    mz /= ml;
    if (mx * p.x + mz * p.z <= 0) throw new Error("coast walk: a miter points into the island");
    // Scale so an offset d along the miter sits d away from both edges.
    const k = 1 / (mx * a.nx + mz * a.nz);
    return { id, x: p.x, z: p.z, mx: mx * k, mz: mz * k };
  });
}

// One flat strip between two offsets from the coast, facing up.
function coastStrip(coast: ReturnType<typeof coastLoop>, inner: number, outer: number) {
  const pos: number[] = [];
  for (const c of coast) pos.push(c.x + c.mx * inner, 0, c.z + c.mz * inner, c.x + c.mx * outer, 0, c.z + c.mz * outer);
  const idx: number[] = [];
  const n = coast.length;
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // The loop's direction is whatever the walk found. Flip the winding if the strip faces down.
  if (geo.attributes.normal!.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo;
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
  cap.name = "cap";
  cap.position.y = slabH + 0.002;
  g.add(cap);
  return g;
}

function hexRing(outer: number, inner: number) {
  const s = hexShape(outer);
  s.holes.push(hexShape(inner));
  const geo = new THREE.ShapeGeometry(s);
  geo.rotateX(-Math.PI / 2);
  return geo;
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
  const hot = n === 6 || n === 8;
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.06, 32),
    new THREE.MeshStandardMaterial({ color: hot ? 0xb3261e : 0x1c1916, roughness: 0.6 }),
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
  const ink = hot ? "#b3261e" : "#1c1916";
  ctx.fillStyle = ink;
  ctx.font = "bold 170px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 128, 96);
  if (hot) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.strokeText(String(n), 128, 96);
  }
  const pips = 6 - Math.abs(n - 7);
  const span = (pips - 1) * 26;
  for (let i = 0; i < pips; i++) {
    ctx.beginPath();
    ctx.arc(128 - span / 2 + i * 26, 196, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const label = new THREE.Mesh(new THREE.CircleGeometry(0.29, 32), new THREE.MeshBasicMaterial({ map: tex }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.031;
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
  top: number,
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
      const { px, pz } = place(0.7, 0.86);
      const pine = rng() > 0.42;
      const ts = pine ? 0.85 + rng() * 0.45 : 0.8 + rng() * 0.4;
      const tree = pine ? makePine(ts) : makeDeciduous(ts);
      tree.userData = { prop: "tree", hex: h.id, reach: pine ? 0.22 * ts : 0.1 * ts + 0.13 * ts * 1.05 };
      tree.position.set(px, top, pz);
      tree.rotation.y = rng() * Math.PI * 2;
      living.add(tree);
      trees.push(tree);
    }
  }
  if (h.terrain === "wool") {
    const n = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const { px, pz } = place(0.54, 0.74);
      const s = makeSheep();
      s.userData = { prop: "sheep", hex: h.id, reach: 0.115 };
      s.position.set(px, top + 0.1, pz);
      living.add(s);
      sheep.push({ g: s, ox: x, oz: z, tx: px, tz: pz, wait: rng() * 2, graze: 0 });
    }
  }
  if (h.terrain === "ore") {
    for (let i = 0; i < 5; i++) {
      const { px, pz } = place(0.64, 0.8);
      const rockR = 0.12 + rng() * 0.12;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rockR, 0), ROCK_MAT);
      rock.position.set(px, top + 0.04, pz);
      rock.rotation.set(rng(), rng(), rng());
      rock.castShadow = true;
      rock.userData = { prop: "rock", hex: h.id, reach: rockR };
      living.add(rock);
    }
  }
}

// One figure is one mesh: its parts are placed (position, y rotation, scale), tinted per vertex and merged,
// on a material shared by every tree (or sheep or rock), which disposeGroup leaves alone.
const TREE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const SHEEP_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
const ROCK_MAT = new THREE.MeshStandardMaterial({ color: 0x6a737c, roughness: 0.95, flatShading: true });
for (const m of [TREE_MAT, SHEEP_MAT, ROCK_MAT]) m.userData.shared = true;

const AXIS_Y = new THREE.Vector3(0, 1, 0);
function placed(geo: THREE.BufferGeometry, hex: number, x: number, y: number, z: number, rotY = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.index ? geo.toNonIndexed() : geo; // mergeGeometries refuses to mix indexed and not
  if (g !== geo) geo.dispose();
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(AXIS_Y, rotY),
      new THREE.Vector3(sx, sy, sz),
    ),
  );
  const c = new THREE.Color(hex);
  const a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

function figure(parts: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) {
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}

function makePine(s: number) {
  const parts = [placed(new THREE.CylinderGeometry(0.025 * s, 0.04 * s, 0.22 * s, 6), 0x4a3220, 0, 0.1 * s, 0)];
  const shades = [0x163d28, 0x1f5a38, 0x2a6e44, 0x1a4a30];
  for (let i = 0; i < 4; i++) {
    const r = (0.22 - i * 0.035) * s;
    parts.push(placed(new THREE.ConeGeometry(r, 0.28 * s, 8), shades[i % shades.length]!, 0, (0.22 + i * 0.14) * s, 0, i * 0.4, 0.92 + (i % 2) * 0.12, 1, 1));
  }
  return figure(parts, TREE_MAT, true);
}

function makeDeciduous(s: number) {
  const parts = [placed(new THREE.CylinderGeometry(0.028 * s, 0.04 * s, 0.24 * s, 6), 0x4a3220, 0, 0.12 * s, 0)];
  const shades = [0x2f7a43, 0x3d8f52, 0x246638, 0x4a9a5c];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      placed(new THREE.IcosahedronGeometry(0.13 * s, 0), shades[i % shades.length]!, Math.cos(a) * 0.1 * s, (0.3 + (i % 3) * 0.08) * s, Math.sin(a) * 0.1 * s, 0, 0.75 + (i % 3) * 0.15),
    );
  }
  return figure(parts, TREE_MAT, true);
}

const PIECE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
PIECE_MAT.userData.shared = true; // disposeGroup leaves it alone

function tint(geo: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex); // sRGB in, linear out: the same conversion material.color gets
  const a = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}

// A box whose bottom face is at y, centred on (x, z). Non-indexed, because ExtrudeGeometry is non-indexed
// and mergeGeometries refuses to mix the two.
function slab(w: number, h: number, d: number, hex: string, y = 0, x = 0, z = 0) {
  return tint(new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y + h / 2, z), hex);
}

function piece(parts: THREE.BufferGeometry[]) {
  const m = new THREE.Mesh(mergeGeometries(parts), PIECE_MAT);
  m.castShadow = true;
  return m;
}

// #312: the seat's mark in its ink, `size` wide, lying on the seat colour at height y (docs/design/seat-marks.md). The
// parts are merged into the piece, so a mark costs vertices and no draw call. `rot` turns it so it stands upright on
// screen whatever way the piece faces; `gable` folds it over an outpost's ridge.
function mark(seat: string, size: number, y: number, rot = 0, gable?: { rise: number; run: number }) {
  const m = seatMark(seat);
  if (!m) return [];
  const parts = markParts(m.mark, size);
  if (gable) foldOverRidge(parts, gable.rise, gable.run);
  return parts.map((g) => tint(g.rotateY(rot).translate(0, y, 0), m.ink));
}

function makeOutpost(seat: string) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.14, 0);
  shape.lineTo(0.14, 0);
  shape.lineTo(0, 0.12);
  shape.closePath();
  const roof = tint(new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: false }).translate(0, 0.22, -0.12), seat);
  return piece([
    slab(0.48, 0.04, 0.44, RIM.dark),
    slab(0.38, 0.04, 0.34, RIM.light, 0.04),
    slab(0.26, 0.14, 0.22, seat, 0.08),
    roof,
    // Folded over the ridge: 0.1 down each slope (the slope is 0.185 long), 0.2 along it.
    ...mark(seat, 0.2, 0.34, 0, { rise: 0.12, run: 0.14 }),
  ]);
}

function makeStronghold(seat: string) {
  const parts = [
    slab(0.54, 0.04, 0.54, RIM.dark),
    slab(0.44, 0.04, 0.44, RIM.light, 0.04),
    slab(0.32, 0.22, 0.32, seat, 0.08),
    // The mark is the figure in the keep's top, between the merlons (0.16 apart), where pieces.md's dark courtyard was.
    ...mark(seat, 0.15, 0.3),
  ];
  for (const x of [-0.12, 0.12]) for (const z of [-0.12, 0.12]) parts.push(slab(0.08, 0.09, 0.08, seat, 0.3, x, z));
  return piece(parts);
}

type PieceKind = "path" | "outpost" | "stronghold";
const LAND_SOUND = { path: "path_place", outpost: "outpost_place", stronghold: "stronghold_place" } as const;
const LAND_MAX = Math.max(...Object.values(LAND_MS));
// polish.md: --ease-out for a path growing, --ease-snap for what lands (a small overshoot reads as weight).
const easeOut = (u: number) => 1 - (1 - u) ** 5;
const easeSnap = (u: number) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;

// A path grows from 0.2 along its edge; an outpost drops 0.2 and settles; a stronghold swaps in at 1.05 and settles.
function poseLanding(l: { obj: THREE.Object3D; kind: PieceKind; start: number; restY: number }, now: number) {
  const u = Math.min(1, Math.max(0, (now - l.start) / LAND_MS[LAND_SOUND[l.kind]]));
  const { obj } = l;
  if (u >= 1) {
    obj.position.y = l.restY;
    obj.scale.set(1, 1, 1);
  } else if (l.kind === "path") obj.scale.set(1, 1, 0.2 + 0.8 * easeOut(u));
  else if (l.kind === "outpost") obj.position.y = l.restY + 0.2 * (1 - easeSnap(u));
  else obj.scale.setScalar(1.05 - 0.05 * easeSnap(u));
}

// `rot` is the path's own rotation.y; the mark counter-turns so it reads upright whichever way the seam runs.
function makePath(seat: string, len: number, rot: number) {
  return piece([
    slab(0.36, 0.03, len, RIM.dark),
    slab(0.26, 0.03, len - 0.06, RIM.light, 0.03),
    slab(0.16, 0.04, len - 0.12, seat, 0.06),
    // A 7 px plank cannot hold an 8 px mark, so a round badge of the seat colour widens it at the middle, inside the
    // cream step, a hair above the plank so the two never share a face.
    tint(new THREE.CylinderGeometry(0.12, 0.12, 0.045, 24).toNonIndexed().translate(0, 0.0825, 0), seat),
    ...mark(seat, 0.15, 0.105, -rot),
  ]);
}

function makeWayfarer() {
  const g = new THREE.Group();
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.75 });
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  part(new THREE.ConeGeometry(0.15, 0.46, 10), charcoal, 0, 0.23, 0).castShadow = true;
  part(new THREE.SphereGeometry(0.1, 12, 10), charcoal, 0, 0.5, 0);
  part(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff6e8, roughness: 0.5 }), 0, 0.49, 0.045);
  const eye = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const sx of [-0.024, 0.024]) part(new THREE.SphereGeometry(0.011, 8, 8), eye, sx, 0.5, 0.105);
  part(new THREE.CylinderGeometry(0.012, 0.012, 0.64, 6), new THREE.MeshStandardMaterial({ color: 0x4a3220 }), 0.17, 0.32, 0.04);
  const lantern = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a2e, emissiveIntensity: 1.6, roughness: 0.3 });
  part(new THREE.SphereGeometry(0.05, 10, 8), lantern, 0.17, 0.56, 0.04);
  g.userData.lantern = lantern;
  return g;
}

function makeSheep() {
  const parts = [
    placed(new THREE.SphereGeometry(0.085, 10, 8), 0xf7f3ea, 0, 0, 0, 0, 1.35, 0.9, 1),
    placed(new THREE.SphereGeometry(0.04, 8, 8), 0x2a2a2a, 0, 0.03, 0.1),
  ];
  for (const [lx, lz] of [[-0.05, 0.05], [0.05, 0.05], [-0.05, -0.05], [0.05, -0.05]] as const) {
    parts.push(placed(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 5), 0x2a2a2a, lx, -0.07, lz));
  }
  return figure(parts, SHEEP_MAT, false);
}

function paintedTexture(kind: Terrain): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const [base, dark] = PAINT[kind];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(hashStr(kind));
  ctx.fillStyle = dark;
  for (let i = 0; i < 900; i++) {
    const r = 1 + rand() * 3;
    ctx.globalAlpha = 0.15 + rand() * 0.35;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(canvas);
}

function hullShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.24); // stern, flat
  s.lineTo(0.09, -0.2);
  s.lineTo(0.09, 0.1);
  s.lineTo(0, 0.26); // bow, pointed
  s.lineTo(-0.09, 0.1);
  s.lineTo(-0.09, -0.2);
  s.closePath();
  return s;
}

const sailTextures = new Map<HarborKind, THREE.CanvasTexture>();

function sailTexture(kind: HarborKind): THREE.CanvasTexture {
  let tex = sailTextures.get(kind);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, 64, 64);
  if (kind !== "any") {
    ctx.fillStyle = PAINT[kind][0]; // the same terrain colour used on the hex sides
    ctx.fillRect(0, 44, 64, 20); // a resource-coloured band along the sail's foot
  }
  ctx.fillStyle = "#1c1915";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(kind === "any" ? "3:1" : "2:1", 32, kind === "any" ? 32 : 22);
  tex = new THREE.CanvasTexture(c);
  sailTextures.set(kind, tex);
  return tex;
}

function makeBoat(kind: HarborKind) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hullShape(), { depth: 0.09, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.7 }),
  );
  hull.rotation.x = -Math.PI / 2;
  hull.position.y = 0.045;
  hull.castShadow = true;
  g.add(hull);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a }),
  );
  mast.position.y = 0.2;
  g.add(mast);

  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.36),
    new THREE.MeshStandardMaterial({
      color: 0xf4efe4,
      map: sailTexture(kind),
      side: THREE.DoubleSide,
      roughness: 0.6,
    }),
  );
  sail.name = "sail";
  sail.position.set(0.04, 0.22, 0);
  g.add(sail);
  return g;
}

