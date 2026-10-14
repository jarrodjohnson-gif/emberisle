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
import { OceanLife } from "@/lib/scene/ocean-life";
import { CAUSTIC_GLSL, PAPER, makeCrystalSea, makeFloorProps, makeSeaFloor, makeSwell, makeWash, type SeaUniforms, type WaterPath, type WaterStatus } from "@/lib/scene/crystal-water";
import { payingHexes } from "@/lib/game/rules";
import { type GameState, type HarborKind, type HexCell, type Terrain, type Vertex } from "@/lib/game/types";

const SLAB = 0.26;
const TILE_Y = 0.04;

// The y of a hex's top surface: where makeHexTile puts its cap. Everything that sits on a hex sits here.
export function topOf(terrain: Terrain) {
  return TILE_Y + SLAB + hexHeight(terrain) * 0.35;
}
const STONE = 0xe8ebe7;

const SIDE: Record<Terrain, number> = {
  timber: 0x173d35,
  wool: 0x617744,
  grain: 0x8c722d,
  clay: 0x74372b,
  ore: 0x414d5b,
  waste: 0x827963,
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
type OreWork = { cart: THREE.Mesh; arm: THREE.Mesh; z: number; phase: number };
type FarmWork = { body: THREE.Mesh; arm: THREE.Mesh; x: number; z: number; y: number; phase: number; angle: number };
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
// Frames after a resize that measure the hole again: the HUD settles into its new layout a frame or two after the event.
const RELAYOUT_FRAMES = 4;
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
  private relayout = 0;
  private sizeW = 0;
  private sizeH = 0;
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
  private oreWork: OreWork[] = [];
  private farmWork: FarmWork[] = [];
  private oceanLife = new OceanLife();
  private ambientTime = 0;
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
  // The crystal sea, or the simple shader when the GPU cannot render to a float target, the one-time probe finds it slow, or
  // the player chose Simple in the table menu (crystal-water.md). Reported through `onWater`.
  waterPath: WaterPath = "crystal";
  onWater: (w: WaterStatus) => void = () => {};
  private choice: WaterPath | null = null;
  private waterSet = false;
  private probed: { path: WaterPath; ms: number } | null = null;
  private probe: { frames: number; ms: number } | null = null;
  private crystalOk = false;
  private motion = { value: 1 };
  // The sea's shared clock, motion and paper fade (inner and outer radius), for the crystal sea, its floor and the simple sea.
  private sea!: SeaUniforms;
  // The scene without the crystal sea, colour and depth, drawn each crystal frame for the sea to refract and absorb.
  private under = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
  private swell!: ReturnType<typeof makeSwell>;
  private opaqueSea!: THREE.Mesh;
  private crystalSea!: THREE.Mesh;
  private wash!: THREE.Mesh;
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
  private coastOrder: string[] = [];
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
    // Frame cost tracks pixels (#310). The crystal sea runs at up to 2 everywhere (every player's phone is an iPhone Pro class
    // GPU); `applyWater` keeps 1.5 on a phone for the simple sea (2.25x the pixels of 1, against 4x at 2).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(PAPER, 1);
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

    this.scene.fog = new THREE.Fog(PAPER, 26, 52);
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
    this.opaqueSea = new THREE.Mesh(new THREE.CircleGeometry(48, 64), this.water);
    this.opaqueSea.rotation.x = -Math.PI / 2;
    this.opaqueSea.position.y = -0.02;
    this.scene.add(this.opaqueSea);
    this.scene.add(this.oceanLife.group);

    const coast = coastLoop();
    this.sea = { uTime: this.water.uniforms.uTime!, uMotion: this.motion, uFade: { value: new THREE.Vector2(11, 22) } };
    this.water.uniforms.uFade = this.sea.uFade;
    this.crystalSea = makeCrystalSea(coast, this.sea);
    this.wash = makeWash(coast, this.sea);
    this.swell = makeSwell(coast);
    this.scene.add(this.crystalSea, this.wash, makeSeaFloor(coast, this.sea), makeFloorProps(coast));
    // The crystal sea refracts a half-float copy of the scene.
    const ext = this.renderer.extensions;
    this.crystalOk = this.renderer.capabilities.isWebGL2 && (ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float"));
    for (const c of coast) this.coastMiter.set(c.id, { mx: c.mx, mz: c.mz });
    this.coastOrder = coast.map((c) => c.id);
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
    // A phone's bars sliding in or out move the visual viewport without always firing a window resize.
    window.visualViewport?.addEventListener("resize", this.onViewport);
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
    const viewport = window.visualViewport;
    // A focused phone field can bring a keyboard over a canvas whose CSS height has not changed.
    const typing = this.coarse() && document.activeElement?.matches("input, textarea") && viewport && Math.abs(viewport.scale - 1) < 0.01;
    const keyboard = typing ? Math.max(0, this.renderer.domElement.clientHeight - viewport.height - viewport.offsetTop) : 0;
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: Math.max(parseFloat(cs.paddingBottom) || 0, keyboard),
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
    window.visualViewport?.removeEventListener("resize", this.onViewport);
    window.removeEventListener("keydown", this.onKey);
    this.renderer.domElement.parentElement?.removeEventListener("focusin", this.remeasure);
    this.renderer.domElement.parentElement?.removeEventListener("focusout", this.remeasure);
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onUp);
    this.renderer.domElement.removeEventListener("pointermove", this.onMove);
    this.renderer.domElement.removeEventListener("pointercancel", this.onCancel);
    this.safeProbe.remove();
    this.oceanLife.dispose();
    this.under.dispose();
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

  // The visual viewport also moves with the keyboard and a pinch, which leave the canvas as it is: only the hole is measured then.
  private onViewport = () => {
    const c = this.renderer.domElement;
    if ((c.clientWidth || 1) !== this.sizeW || (c.clientHeight || 1) !== this.sizeH) return this.resize();
    this.remeasure();
    this.relayout = RELAYOUT_FRAMES;
  };

  private resize = () => {
    this.wake();
    const c = this.renderer.domElement;
    const w = (this.sizeW = c.clientWidth || 1);
    const h = (this.sizeH = c.clientHeight || 1);
    this.camera.aspect = w / h;
    // Dolly limit: OrbitControls.update() clamps the current distance to the new max on the next frame.
    this.controls.maxDistance = freeMaxDistance(h, hudInsets(w, h, this.coarse(), this.safe()), this.coarse());
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    const ratio = this.renderer.getPixelRatio();
    this.under.setSize(Math.round(w * ratio), Math.round(h * ratio));
    this.ssao?.setSize(w, h);
    this.refit(true);
    // The HUD re-lays out for the new size after this event (a rotation swaps its columns and rails), so the hole just
    // measured is the old one: measure again on each of the next frames.
    this.relayout = RELAYOUT_FRAMES;
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
    const hole = this.insets();
    // The hole's edges on the shell, so the HUD can centre a moment on the island (TurnMoment, GainFloats).
    for (const k of ["top", "right", "bottom", "left"] as const) c.parentElement?.style.setProperty(`--hole-${k}`, `${hole[k]}px`);
    const f = fitOrtho(c.clientWidth || 1, c.clientHeight || 1, hole, OVERHEAD_LEAN);
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
    const u = this.calm() ? 1 : Math.min(1, (now - g.start) / GLIDE_MS);
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
    if (this.stopped || document.hidden) return;
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
    if (this.relayout > 0) {
      this.relayout--;
      this.refitDue = true;
    }
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
    } else {
      this.controls.enableDamping = !calm;
      this.controls.update();
    }
    // Reduced motion: a flat, still sea; only the foam lace stays.
    this.motion.value = calm ? 0 : 1;
    if (calm) {
      this.oceanLife.step(0, false, this.oceanViewport);
      this.pulseMarks(0, true);
      this.draw();
      return;
    }
    this.water.uniforms.uTime!.value = t;
    this.ambientTime += dt;
    const crystal = this.waterPath === "crystal";
    this.oceanLife.step(dt, true, this.oceanViewport, crystal ? (x, z) => this.swell(x, z, t).y : undefined);
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
      const turn = Math.atan2(Math.sin(heading - s.g.rotation.y), Math.cos(heading - s.g.rotation.y));
      s.g.rotation.y += turn * (1 - Math.exp(-dt * 3));
      s.g.rotation.x = s.graze > 0 ? 0.32 : 0;
      if (s.graze > 0) s.graze -= dt;
    }
    for (const work of this.oreWork) {
      const phase = this.ambientTime + work.phase;
      work.cart.position.z = work.z + 0.05 * Math.sin(phase * Math.PI / 3);
      work.cart.rotation.z = 0.035 * Math.sin(phase * 2.4);
      work.cart.rotation.x = 0.018 * Math.sin(phase * 1.6);
      work.arm.rotation.z = 0.22 * Math.sin(phase * Math.PI / 2);
    }
    for (const work of this.farmWork) {
      const phase = this.ambientTime + work.phase;
      const cycle = phase % 18;
      const walking = cycle > 10 && cycle < 16;
      const step = walking ? Math.sin((cycle - 10) * Math.PI / 6) * 0.10 : 0;
      work.body.position.set(work.x + Math.cos(work.angle) * step, work.y + (walking ? Math.abs(Math.sin(phase * 6)) * 0.006 : 0), work.z + Math.sin(work.angle) * step);
      work.body.rotation.y = Math.PI / 2 - work.angle + (walking && cycle > 13 ? Math.PI : 0);
      work.arm.position.set(work.body.position.x, work.body.position.y + 0.13, work.body.position.z);
      work.arm.rotation.set(0, work.body.rotation.y, cycle < 8 ? -0.15 + Math.sin(phase * 2.2) * 0.28 : 0);
    }
    for (const b of this.boats) {
      if (!crystal) {
        b.position.y = 0.06 + Math.sin(t * 1.6 + b.position.x) * 0.04;
        b.rotation.z = Math.sin(t * 1.35 + b.position.z) * 0.07;
        b.rotation.x = Math.sin(t * 1.1) * 0.035;
        continue;
      }
      // Ride the same waves the sea draws: lift with the height, pitch and roll with the slope under the hull.
      const sea = this.swell(b.position.x, b.position.z, t);
      const yaw = b.rotation.y;
      b.position.y = 0.07 + sea.y;
      b.rotation.x = -Math.atan(sea.gx * Math.sin(yaw) + sea.gz * Math.cos(yaw));
      b.rotation.z = Math.atan(sea.gx * Math.cos(yaw) - sea.gz * Math.sin(yaw));
    }
    this.draw();
  };

  // In play (overhead) the sea fills the canvas: the fade to paper starts 1.5x past the farthest visible point. In the free
  // view the far horizon reaches the paper.
  private fadeSea() {
    const fade = this.sea.uFade.value;
    if (!this.overhead) return fade.set(11, 22);
    const o = this.ortho;
    const halfW = (o.right - o.left) / 2 / o.zoom;
    const halfH = (o.top - o.bottom) / 2 / o.zoom / Math.max(0.3, Math.cos(this.orbit.getPolarAngle()));
    const far = Math.hypot(halfW, halfH) + Math.hypot(this.orbit.target.x, this.orbit.target.z);
    fade.set(Math.min(40, far * 1.5), Math.min(47, far * 1.5 + 10));
  }

  // The scene under the crystal sea, without it and its edge strip, into `under`.
  private drawUnder() {
    const cam = this.overhead ? this.ortho : this.camera;
    const r = this.renderer;
    this.crystalSea.visible = this.wash.visible = false;
    r.setRenderTarget(this.under);
    r.render(this.scene, cam);
    r.setRenderTarget(null);
    this.crystalSea.visible = this.wash.visible = true;
    const u = (this.crystalSea.material as THREE.ShaderMaterial).uniforms;
    u.uUnder!.value = this.under.texture;
    u.uUnderDepth!.value = this.under.depthTexture;
    u.uResolution!.value.set(this.under.width, this.under.height);
    u.uNear!.value = cam.near;
    u.uFar!.value = cam.far;
  }

  // The player's saved choice from the table menu, or null to let the probe decide. Switching swaps the sea in place.
  setWaterChoice(choice: WaterPath | null) {
    if (choice === this.choice && this.waterSet) return;
    this.waterSet = true;
    this.choice = choice;
    // The probe measures the crystal sea only, once, when nothing has chosen for it.
    this.probe = !choice && !this.probed && this.crystalOk ? { frames: 0, ms: 0 } : null;
    this.applyWater();
  }

  private applyWater() {
    const path: WaterPath = !this.crystalOk ? "simple" : (this.choice ?? this.probed?.path ?? "crystal");
    this.waterPath = path;
    this.crystalSea.visible = this.wash.visible = path === "crystal";
    // The crystal sea's edge strip draws its own thin lace.
    this.opaqueSea.visible = this.foam.visible = path === "simple";
    const ratio = Math.min(window.devicePixelRatio, path === "simple" && this.coarse() ? 1.5 : 2);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.resize();
    this.onWater({ path, source: this.choice ? "saved" : "probe", ms: this.probed?.ms ?? null });
  }

  // The one-time GPU check, on a built and warm scene: 10 crystal frames once the island has been drawn 5 times (past the
  // shader compiles and uploads), each made to finish by a 1-pixel read. Over 22 ms a frame on average, the sea goes simple;
  // once the frames so far already exceed the 10-frame budget (220 ms), it stops there, so a slow GPU stalls only briefly.
  private draw() {
    const t0 = performance.now();
    this.fadeSea();
    const crystal = this.waterPath === "crystal";
    if (crystal) this.drawUnder();
    // The under pass already drew this frame's shadow map.
    this.renderer.shadowMap.autoUpdate = !crystal;
    this.composer.render();
    this.renderer.shadowMap.autoUpdate = true;
    this.renders += 1;
    const p = this.probe;
    if (!p || !this.lastState || ++p.frames <= 5) return;
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    p.ms += performance.now() - t0;
    if (p.frames < 15 && p.ms <= 220) return;
    this.probe = null;
    const ms = Math.round((p.ms / (p.frames - 5)) * 10) / 10;
    this.probed = { path: ms > 22 ? "simple" : "crystal", ms };
    this.applyWater();
  }

  // Compute the visible water once when choosing a visit, not on every animal frame.
  private oceanViewport = () => {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const inset = this.insets();
    const camera = this.overhead ? this.ortho : this.camera;
    const scale = this.overhead ? width * this.ortho.zoom / (this.ortho.right - this.ortho.left) : 28;
    const point = new THREE.Vector3();
    return (x: number, z: number, reach: number) => {
      point.set(x, 0.12, z).project(camera);
      const px = (point.x + 1) * width / 2, py = (1 - point.y) * height / 2;
      const margin = 8 + reach * scale;
      return point.z > -1 && point.z < 1 && px > inset.left + margin && px < width - inset.right - margin && py > inset.top + margin && py < height - inset.bottom - margin;
    };
  };

  private buildLand(state: GameState) {
    disposeGroup(this.land);
    disposeGroup(this.living);
    this.sheep = [];
    this.oreWork = [];
    this.farmWork = [];
    this.boats = [];
    this.trees = [];
    this.wheat = [];
    this.living.add(this.wayfarer);
    this.pickables = [];
    this.caps.clear();
    this.flashes = [];
    this.oceanLife.reset(landKey(state));

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
      decorate(this.living, this.trees, this.wheat, this.sheep, this.oreWork, this.farmWork, h, x, z, topOf(h.terrain));
      if (h.pip != null) {
        const tok = numberToken(h.pip);
        tok.userData.token = h.pip;
        tok.position.set(x, topOf(h.terrain) + 0.04, z);
        this.land.add(tok);
      }
    }

    // A dock spans a coastal edge, so both its corners carry the harbor; the deal spaces docks at least three edges apart, so two
    // neighbouring harbor corners on the coast loop of one kind are always one dock. One pier and one boat per dock.
    const vbyId = new Map(state.vertices.map((v) => [v.id, v]));
    const n = this.coastOrder.length;
    for (let i = 0; i < n; i++) {
      const va = vbyId.get(this.coastOrder[i]!);
      const vb = vbyId.get(this.coastOrder[(i + 1) % n]!);
      if (!va?.harbor || va.harbor !== vb?.harbor) continue;
      const ma = this.coastMiter.get(va.id)!;
      const mb = this.coastMiter.get(vb.id)!;
      const cx = (va.x + vb.x) / 2;
      const cz = (va.z + vb.z) / 2;
      const mx = (ma.mx + mb.mx) / 2;
      const mz = (ma.mz + mb.mz) / 2;
      const jettyStart = 0.22; // the beach's own outer offset (docs/design/ocean.md)
      const jettyLen = 0.24; // ends at 0.46: just past the foam's 0.42 outer offset
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.05, jettyLen),
        new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.82 }),
      );
      pier.position.set(cx + mx * (jettyStart + jettyLen / 2), 0.1, cz + mz * (jettyStart + jettyLen / 2));
      pier.lookAt(cx + mx, 0.1, cz + mz);
      pier.castShadow = true;
      this.land.add(pier);

      const boat = makeBoat(va.harbor);
      boat.position.set(cx + mx * (jettyStart + jettyLen + 0.16), 0.08, cz + mz * (jettyStart + jettyLen + 0.16));
      boat.lookAt(cx, 0.08, cz);
      boat.userData.vids = [va.id, vb.id];
      boat.userData.kind = va.harbor;
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
      obj.userData = { piece: kind, key, restY: obj.position.y };
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
      const road = makePath(color, Math.hypot(dx, dz) * 0.9);
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
      const corners = (b.userData.vids as string[]).map((id) => vmap.get(id));
      const claimed = (corners.find((v) => v?.building) ?? null)?.building?.playerId;
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
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x65d8cb) },
      uDeep: { value: new THREE.Color(0x158e9a) },
      uFog: { value: PAPER.clone() },
      uFade: { value: new THREE.Vector2(11, 22) },
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
      uniform vec2 uFade;
      varying vec2 vXZ;
      ${CAUSTIC_GLSL}
      void main() {
        float d = length(vXZ);
        vec3 c = mix(uShallow, uDeep, smoothstep(8.0, 28.0, d));
        vec2 p = vXZ + vec2(sin(vXZ.y * 0.9 + uTime * 0.32), cos(vXZ.x * 0.7 - uTime * 0.25)) * 0.16;
        float ripple = sin(p.x * 2.1 + uTime * 0.45) * sin(p.y * 1.7 - uTime * 0.36);
        float light = caustic(p * 1.7 + vec2(uTime * 0.04, -uTime * 0.025));
        c *= 1.0 + 0.035 * ripple;
        c = mix(c, vec3(0.78, 0.97, 0.92), light * 0.07 * (1.0 - smoothstep(8.0, 20.0, d)));
        c = mix(c, uFog, smoothstep(uFade.x, uFade.y, d));
        gl_FragColor = vec4(c, 0.88);
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
  const wallGeo = new THREE.ExtrudeGeometry(hexShape(size), { depth: slabH, steps: 4, bevelEnabled: false });
  wallGeo.rotateX(-Math.PI / 2);
  // Four geological bands on the hex island itself. The ocean has no box or cutaway perimeter.
  const strata = [0xb68a56, 0xd0b080, 0xe5d6b5, 0xf4e9d2].map(c => new THREE.Color(c));
  const pos = wallGeo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const c = strata[Math.min(3, Math.max(0, Math.floor(y / slabH * 4)))]!;
    for (let j = 0; j < 3; j++) c.toArray(colours, (i + j) * 3);
  }
  wallGeo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const wall = new THREE.Mesh(
    wallGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
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
  ctx.fillStyle = "#fff9f0";
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  const ink = hot ? "#b3261e" : "#1c1916";
  ctx.fillStyle = ink;
  ctx.font = "bold 158px system-ui, sans-serif";
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
  oreWork: OreWork[],
  farmWork: FarmWork[],
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
  if (h.terrain === "grain") {
    // One merged field, with a real clear hole around the number token.
    const stalks: THREE.BufferGeometry[] = [];
    for (let row = -4; row <= 4; row++) for (let col = -4; col <= 4; col++) {
      const px = col * 0.18 + (rng() - 0.5) * 0.025;
      const pz = row * 0.18 + (rng() - 0.5) * 0.025;
      const radius = Math.hypot(px, pz);
      if (radius < 0.49 || radius > 0.82) continue;
      const height = 0.12 + rng() * 0.05;
      stalks.push(placed(new THREE.CylinderGeometry(0.008, 0.008, height, 3), 0xb38d35, px, height / 2, pz));
      stalks.push(placed(new THREE.ConeGeometry(0.026, 0.07, 4), 0xf3d884, px, height + 0.025, pz));
    }
    const field = figure(stalks, PIECE_MAT, true);
    field.name = "grain-field";
    field.userData = { hex: h.id, field: true };
    field.position.set(x, top, z);
    living.add(field);
    const work = makeFarmer();
    const angle = rng() * Math.PI * 2;
    const px = x + Math.cos(angle) * 0.65, pz = z + Math.sin(angle) * 0.65;
    work.body.position.set(px, top, pz);
    work.arm.position.set(px, top + 0.13, pz);
    for (const [obj, prop] of [[work.body, "farmer"], [work.arm, "harvesting"]] as const) {
      obj.userData = { prop, hex: h.id, reach: 0.14 };
      living.add(obj);
    }
    farmWork.push({ ...work, x: px, z: pz, y: top, phase: rng() * 18, angle: angle + Math.PI / 2 });
  }
  if (h.terrain === "clay") {
    for (let i = 0; i < 3; i++) {
      const { px, pz } = place(0.65, 0.80);
      const r = 0.12 + rng() * 0.065;
      const mound = figure([placed(new THREE.IcosahedronGeometry(r, 0), i % 2 ? 0xc8794a : 0xa84c36, 0, 0, 0, rng(), 1, 0.65, 1)], PIECE_MAT, true);
      mound.userData = { prop: "clay-mound", hex: h.id, reach: r };
      mound.position.set(px, top + r * 0.2, pz);
      living.add(mound);
    }
  }
  if (h.terrain === "ore") {
    const work = makeOreWork();
    work.cart.position.set(x - 0.50, top, z + 0.42);
    work.miner.position.set(x + 0.48, top, z - 0.40);
    work.arm.position.set(x + 0.48, top + 0.14, z - 0.40);
    for (const [obj, prop] of [[work.cart, "wagon"], [work.miner, "miner"], [work.arm, "pickaxe"]] as const) {
      obj.userData = { prop, hex: h.id, reach: 0.17 };
      living.add(obj);
    }
    oreWork.push({ cart: work.cart, arm: work.arm, z: work.cart.position.z, phase: rng() * Math.PI * 2 });
    for (let i = 0; i < 3; i++) {
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
  ]);
}

function makeStronghold(seat: string) {
  const parts = [
    slab(0.54, 0.04, 0.54, RIM.dark),
    slab(0.44, 0.04, 0.44, RIM.light, 0.04),
    slab(0.32, 0.22, 0.32, seat, 0.08),
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

function makePath(seat: string, len: number) {
  return piece([
    slab(0.36, 0.03, len, RIM.dark),
    slab(0.26, 0.03, len - 0.06, RIM.light, 0.03),
    slab(0.16, 0.04, len - 0.12, seat, 0.06),
    tint(new THREE.CylinderGeometry(0.12, 0.12, 0.045, 12).toNonIndexed().translate(0, 0.0825, 0), seat),
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
  for (let i = 0; i < 280; i++) {
    const r = 1 + rand() * 3;
    ctx.globalAlpha = 0.08 + rand() * 0.12;
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


// Three draw calls per ore hex. Fixed parts are merged, so wheels/load do not add separate meshes.
function makeOreWork() {
  const cartParts = [
    placed(new THREE.BoxGeometry(0.22, 0.04, 0.18), 0x493f33, 0, 0.07, 0),
    placed(new THREE.BoxGeometry(0.025, 0.09, 0.20), 0x796b53, -0.11, 0.10, 0),
    placed(new THREE.BoxGeometry(0.025, 0.09, 0.20), 0x796b53, 0.11, 0.10, 0),
    placed(new THREE.BoxGeometry(0.22, 0.09, 0.025), 0x796b53, 0, 0.10, -0.09),
    placed(new THREE.BoxGeometry(0.22, 0.09, 0.025), 0x796b53, 0, 0.10, 0.09),
  ];
  for (const x of [-0.13, 0.13]) for (const z of [-0.065, 0.065]) {
    cartParts.push(placed(new THREE.CylinderGeometry(0.043, 0.043, 0.024, 8).rotateZ(Math.PI / 2), 0x253131, x, 0.045, z));
  }
  for (const [x, z] of [[-0.06, -0.03], [0.04, 0.04], [0.03, -0.04]]) {
    cartParts.push(placed(new THREE.DodecahedronGeometry(0.055, 0), 0x8796a5, x, 0.14, z));
  }
  const cart = figure(cartParts, PIECE_MAT, true);
  const miner = figure([
    placed(new THREE.BoxGeometry(0.065, 0.085, 0.06), 0x283c47, 0, 0.10, 0),
    placed(new THREE.IcosahedronGeometry(0.044, 0), 0xc8ad87, 0, 0.174, 0),
    placed(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 8), 0xd1b14d, 0, 0.20, 0),
    placed(new THREE.BoxGeometry(0.025, 0.07, 0.025), 0x202a2b, -0.02, 0.035, 0),
    placed(new THREE.BoxGeometry(0.025, 0.07, 0.025), 0x202a2b, 0.02, 0.035, 0),
  ], PIECE_MAT, true);
  const arm = figure([
    placed(new THREE.BoxGeometry(0.025, 0.025, 0.09), 0xc8ad87, 0.035, 0, 0.035),
    placed(new THREE.BoxGeometry(0.015, 0.12, 0.015), 0x796b53, 0.06, 0.045, 0.07),
    placed(new THREE.BoxGeometry(0.10, 0.025, 0.025), 0xa8b6bf, 0.06, 0.10, 0.07),
  ], PIECE_MAT, false);
  return { cart, miner, arm };
}

// Hat, clothes, legs and loaded grain basket share a mesh; only the harvesting arm moves separately.
function makeFarmer() {
  const body = figure([
    placed(new THREE.BoxGeometry(0.07, 0.09, 0.06), 0x4b7c67, 0, 0.10, 0),
    placed(new THREE.IcosahedronGeometry(0.038, 0), 0xc49972, 0, 0.18, 0),
    placed(new THREE.CylinderGeometry(0.057, 0.057, 0.018, 8), 0xb58d44, 0, 0.215, 0),
    placed(new THREE.CylinderGeometry(0.036, 0.046, 0.04, 8), 0xd1b469, 0, 0.235, 0),
    placed(new THREE.BoxGeometry(0.024, 0.07, 0.026), 0x334c42, -0.021, 0.035, 0),
    placed(new THREE.BoxGeometry(0.024, 0.07, 0.026), 0x334c42, 0.021, 0.035, 0),
    placed(new THREE.CylinderGeometry(0.038, 0.026, 0.06, 7), 0x9c7745, -0.06, 0.09, 0.02),
    placed(new THREE.ConeGeometry(0.025, 0.035, 5), 0xe4c86c, -0.06, 0.13, 0.02),
  ], PIECE_MAT, true);
  const arm = figure([
    placed(new THREE.BoxGeometry(0.024, 0.024, 0.085), 0xc49972, 0.045, 0, 0.04),
    placed(new THREE.BoxGeometry(0.013, 0.013, 0.11), 0x7c6847, 0.06, -0.012, 0.07),
    placed(new THREE.TorusGeometry(0.034, 0.009, 3, 7, Math.PI), 0xb0b9af, 0.06, -0.01, 0.13),
  ], PIECE_MAT, false);
  return { body, arm };
}
