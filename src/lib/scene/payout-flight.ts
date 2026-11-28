// #1923 (#642, design docs/design/payout-flight.md): on a live roll, each good the local hand gathered pops off its paying hex
// and flies to its resource symbol in the hand. Presentation only: the roll's grants (`lastProduction`) are the one input,
// nothing here plays a sound, takes a tap, moves focus or waits for anything, and the gains on the hand keep their own timing.
// The goods are drawn by the island's renderer into its own canvas, after the world, through an orthographic camera measured
// in canvas CSS pixels; the HUD stays above the canvas, so a good goes in under its card. This chunk loads lazily, in play.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { useMomentUp } from "@/components/game/Dice";
import { worldOfHex } from "@/lib/game/board";
import { RESOURCES, type GameState, type Resource } from "@/lib/game/types";
import { BLOCK_H, TILE_Y } from "@/lib/scene/jelly-dims";

// The design's numbers ("Projection and motion", "Timing and centre ownership", "Bounds and lifecycle"), in ms and CSS px.
export const FLIGHT = {
  size: 14,
  popSize: 18,
  endSize: 6,
  pop: 120,
  lift: 10,
  travel: 480,
  shrink: 120,
  pairGap: 40,
  groupGap: 40,
  groupCap: 200,
  arc: 32,
  release: 1120,
  expire: 1500,
  finish: 840,
  records: 24,
  meshes: 24,
  out: 0.58,
  up: 0.2,
  token: 0.39,
  centreGap: 8,
} as const;

// The hand's colours (styles.css --timber … --ore), the ones the target card lights up in, and each good's side colour
// (--timber-side … --ore-side), which its faces turn toward as they turn from the light.
const COLOUR: Record<Resource, [string, string]> = {
  timber: ["#2f6a4f", "#173d35"],
  clay: ["#b8533d", "#74372b"],
  wool: ["#b2ce80", "#617744"],
  grain: ["#e3c462", "#8c722d"],
  ore: ["#63748a", "#414d5b"],
};

export type FlightRecord = { hex: string; res: Resource; n: number; x: number; y: number; z: number; dx: number; dz: number; aimed: boolean };

// The roll's grants for `seat`, checked one by one, grouped by (hex, resource) in canonical order, at most FLIGHT.records. Each
// group starts toward the first valid paying corner it lists (else +x), 0.20 above the cap; `aimed` says a corner set it.
export function planBatch(state: GameState, seat: string): FlightRecord[] {
  const out: FlightRecord[] = [];
  const seats = new Set(state.players.map((p) => p.id));
  for (const g of state.lastProduction ?? []) {
    const h = state.hexes.find((x) => x.id === g.hex);
    if (!h || !seats.has(g.player) || !RESOURCES.includes(g.res) || !Number.isInteger(g.n) || g.n <= 0 || g.player !== seat) continue;
    const c = worldOfHex(h);
    let r = out.find((x) => x.hex === g.hex && x.res === g.res);
    if (!r) {
      if (out.length >= FLIGHT.records) continue;
      out.push((r = { hex: g.hex, res: g.res, n: 0, x: c.x, y: TILE_Y + BLOCK_H + FLIGHT.up, z: c.z, dx: 1, dz: 0, aimed: false }));
    }
    r.n += g.n;
    const v = r.aimed ? undefined : state.vertices.find((x) => x.id === g.vertex && x.hexes.includes(g.hex));
    const d = v ? Math.hypot(v.x - c.x, v.z - c.z) : 0;
    if (v && d > 0) Object.assign(r, { dx: (v.x - c.x) / d, dz: (v.z - c.z) / d, aimed: true });
  }
  return out;
}

export type Slot = { group: number; res: Resource; delay: number };

// The objects for the groups whose card can take them: one per group, then a second for each group of two or more, in group
// order, at most FLIGHT.meshes. Groups stagger by 40 ms (capped at 200), a second object 40 ms after its first.
export function allocate(records: Pick<FlightRecord, "res" | "n">[], ok: (res: Resource) => boolean): Slot[] {
  const live = records.map((r, i) => ({ r, i })).filter(({ r }) => ok(r.res));
  const slots: Slot[] = [];
  for (const second of [0, 1])
    live.forEach(({ r, i }, k) => {
      if (slots.length < FLIGHT.meshes && (!second || r.n > 1))
        slots.push({ group: i, res: r.res, delay: Math.min(k * FLIGHT.groupGap, FLIGHT.groupCap) + second * FLIGHT.pairGap });
    });
  return slots;
}

const easeOut = (u: number) => 1 - (1 - u) ** 3;
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

// Where an object is `e` ms after its own start: `lift` px above its source, then `k` of the way along the arc, at `size` px.
// Null before its start and after it lands.
export function pose(e: number): { lift: number; k: number; size: number } | null {
  const { pop, travel, shrink, size, popSize, endSize, lift } = FLIGHT;
  if (e < 0 || e >= pop + travel) return null;
  if (e < pop) return { lift: lift * easeOut(e / pop), k: 0, size: size + (popSize - size) * Math.sin((Math.PI * e) / pop) };
  const t = e - pop;
  const s = t < travel - shrink ? size : size + (endSize - size) * ((t - travel + shrink) / shrink);
  return { lift, k: easeInOut(t / travel), size: s };
}

// One merged, unlit shape per good, about one unit across. Each face is baked between the good's colour and its side
// colour (in linear space) by how it faces a light from the upper left, so the piece reads as solid with no lights, outline
// or rim. A part marked `side` (the sheaf's tie) is the side colour all over.
function shapes(): Record<Resource, THREE.BufferGeometry> {
  type Part = { g: THREE.BufferGeometry; side?: boolean };
  const part = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, rz = 0, s: [number, number, number] = [1, 1, 1], side = false): Part => ({
    g: (g.index ? g.toNonIndexed() : g).scale(...s).rotateX(rx).rotateZ(rz).translate(x, y, z).deleteAttribute("uv"),
    side,
  });
  const log = (z: number) => part(new THREE.CylinderGeometry(0.23, 0.23, 1, 8), 0, 0, z, 0, Math.PI / 2);
  const parts: Record<Resource, Part[]> = {
    timber: [log(-0.24), log(0.24), part(new THREE.CylinderGeometry(0.21, 0.21, 0.9, 8), 0, 0.36, 0, 0, Math.PI / 2)],
    clay: [part(new THREE.BoxGeometry(0.95, 0.45, 0.55))],
    wool: [
      part(new THREE.IcosahedronGeometry(0.36, 1), -0.2, -0.05, 0),
      part(new THREE.IcosahedronGeometry(0.36, 1), 0.2, -0.05, 0.05),
      part(new THREE.IcosahedronGeometry(0.34, 1), 0, 0.22, -0.05),
    ],
    // A sheaf: the ears' pointed tips, the ears, the tie, and the stalks splaying below it.
    grain: [
      part(new THREE.CylinderGeometry(0, 0.34, 0.3, 9), 0, 0.45, 0),
      part(new THREE.CylinderGeometry(0.34, 0.16, 0.22, 9), 0, 0.19, 0),
      part(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 9), 0, 0.03, 0, 0, 0, [1, 1, 1], true),
      part(new THREE.CylinderGeometry(0.16, 0.4, 0.48, 9), 0, -0.26, 0),
    ],
    ore: [part(new THREE.OctahedronGeometry(0.5, 0), 0, 0, 0, 0, 0, [1, 0.8, 0.85])],
  };
  const light = new THREE.Vector3(-0.5, 0.8, 0.6).normalize();
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  return Object.fromEntries(
    RESOURCES.map((r) => {
      const fill = new THREE.Color(COLOUR[r][0]), side = new THREE.Color(COLOUR[r][1]);
      for (const { g, side: tie } of parts[r]) {
        g.computeVertexNormals();
        const normals = g.getAttribute("normal");
        const rgb = new Float32Array(normals.count * 3);
        for (let i = 0; i < normals.count; i++) {
          c.copy(fill).lerp(side, tie ? 1 : 1 - Math.max(0, n.fromBufferAttribute(normals, i).dot(light)));
          rgb.set([c.r, c.g, c.b], i * 3);
        }
        g.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
      }
      const g = mergeGeometries(parts[r].map((x) => x.g))!;
      parts[r].forEach((x) => x.g.dispose());
      return [r, g];
    }),
  ) as Record<Resource, THREE.BufferGeometry>;
}

type Batch = { records: FlightRecord[]; at: number; held: boolean; w: number; h: number; t0?: number; slots?: (Slot & { mesh: THREE.Mesh; dead?: boolean })[] };

const _v = new THREE.Vector3();

export class PayoutFlights {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, -100, 100);
  private geos = shapes();
  private mats = Object.fromEntries(RESOURCES.map((r) => [r, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })])) as Record<Resource, THREE.MeshBasicMaterial>;
  private pool: THREE.Mesh[] = [];
  batch: Batch | null = null;
  // Proofs read these: what was admitted, and how each batch ended.
  admitted = 0;
  log: string[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private cam: () => THREE.Camera,
  ) {
    for (let i = 0; i < FLIGHT.meshes; i++) {
      const m = new THREE.Mesh(this.geos.timber, this.mats.timber);
      m.visible = false;
      // A three-quarter look from above, the same for every good.
      m.rotation.set(0.55, -0.6, 0);
      this.pool.push(m);
      this.scene.add(m);
    }
    document.addEventListener("visibilitychange", this.onHidden);
  }

  private onHidden = () => {
    if (document.hidden) this.cancel("hidden");
  };

  // A live roll for this seat: replaces (and cancels) any batch still waiting or flying.
  capture(state: GameState, seat: string) {
    this.cancel("replaced");
    if (document.hidden) return;
    const records = planBatch(state, seat);
    if (records.length) this.batch = { records, at: performance.now(), held: false, w: this.canvas.clientWidth, h: this.canvas.clientHeight };
  }

  cancel(why = "cancel") {
    if (!this.batch) return;
    this.log.push(why);
    this.batch = null;
    for (const m of this.pool) m.visible = false;
  }

  // Each animation frame, drawn or not: admits a waiting batch when its roll's centre moment releases (or after 1120 ms with
  // none up), ends it on its deadlines. True while admitted goods still need full-rate frames.
  poll(now: number, calm: boolean): boolean {
    const b = this.batch;
    if (!b) return false;
    if (calm) return this.cancel("reduced motion"), false;
    if (this.canvas.clientWidth !== b.w || this.canvas.clientHeight !== b.h) return this.cancel("resize"), false;
    if (b.t0 === undefined) {
      const up = useMomentUp.getState().up;
      if (up) b.held = true;
      if (now - b.at >= FLIGHT.expire) return this.cancel("expired"), false;
      if (up || (!b.held && now - b.at < FLIGHT.release)) return false;
      this.admit(b, now);
      if (!b.slots!.length) return this.cancel("no destination"), false;
    }
    if (now - b.t0! >= FLIGHT.finish || b.slots!.every((s) => s.dead)) return this.cancel("done"), false;
    return true;
  }

  private admit(b: Batch, now: number) {
    b.t0 = now;
    const cam = this.cam();
    for (const r of b.records) {
      // Keep the whole popped object (18 px) clear of the token's 0.39 disc at this zoom.
      const a = this.project(cam, r.x, r.y, r.z), c = this.project(cam, r.x + r.dx, r.y, r.z + r.dz);
      const ppu = a && c ? Math.hypot(c.x - a.x, c.y - a.y) : 0;
      const d = Math.max(FLIGHT.out, ppu > 0 ? FLIGHT.token + FLIGHT.popSize / 2 / ppu : FLIGHT.out);
      r.x += r.dx * d;
      r.z += r.dz * d;
    }
    b.slots = allocate(b.records, (res) => !!this.target(res)).map((s, i) => {
      const mesh = this.pool[i]!;
      mesh.geometry = this.geos[s.res];
      mesh.material = this.mats[s.res];
      return { ...s, mesh };
    });
    this.admitted += b.slots.length;
  }

  // A world point in canvas CSS pixels through the camera in use, or null behind it or off the canvas.
  private project(cam: THREE.Camera, x: number, y: number, z: number) {
    const p = _v.set(x, y, z).project(cam);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const out = { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
    return p.z > -1 && p.z < 1 && out.x >= 0 && out.x <= w && out.y >= 0 && out.y <= h ? out : null;
  }

  // The visible local hand's symbol for `res`, in canvas pixels, if all of it shows: inside the canvas and the visual
  // viewport, unclipped by any scrolling box, and the card's own at its centre (nothing over it).
  target(res: Resource): { x: number; y: number } | null {
    const icon = document.querySelector(`[data-testid="hand-dock"] [data-testid="resource-${res}"] .goods-icon`);
    const card = icon?.closest(`[data-testid="resource-${res}"]`);
    if (!icon || !card?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
    const r = icon.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
    const vv = visualViewport;
    const inside = (b: { left: number; top: number; right: number; bottom: number }) => r.left >= b.left && r.top >= b.top && r.right <= b.right && r.bottom <= b.bottom;
    if (r.width <= 0 || r.height <= 0 || !inside(c)) return null;
    if (vv && !inside({ left: vv.offsetLeft, top: vv.offsetTop, right: vv.offsetLeft + vv.width, bottom: vv.offsetTop + vv.height })) return null;
    for (let el = card.parentElement; el; el = el.parentElement) if (getComputedStyle(el).overflow !== "visible" && !inside(el.getBoundingClientRect())) return null;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return card.contains(document.elementFromPoint(cx, cy)) ? { x: cx - c.left, y: cy - c.top } : null;
  }

  // Draws the admitted goods into the canvas after the world pass: depth cleared, the island's camera only to place sources.
  render(gl: THREE.WebGLRenderer, now = performance.now()) {
    const b = this.batch;
    if (!b?.slots) return;
    const cam = this.cam(), c = this.canvas.getBoundingClientRect();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const ends: Partial<Record<Resource, { x: number; y: number } | null>> = {};
    const centre = [...document.querySelectorAll('[data-testid="roll-moment"], [data-testid="turn-moment"]')].map((el) => el.getBoundingClientRect());
    let shown = 0;
    for (const s of b.slots) {
      const m = s.mesh;
      m.visible = false;
      if (s.dead) continue;
      const p = pose(now - b.t0! - s.delay);
      if (!p) continue;
      const r = b.records[s.group]!;
      const from = this.project(cam, r.x, r.y, r.z);
      const to = ends[s.res] === undefined ? (ends[s.res] = this.target(s.res)) : ends[s.res];
      if (!from || !to) {
        s.dead = true;
        continue;
      }
      const ax = from.x, ay = from.y - p.lift;
      const len = Math.hypot(to.x - ax, to.y - ay);
      const mx = (ax + to.x) / 2, my = (ay + to.y) / 2 - 2 * Math.min(FLIGHT.arc, len / 4);
      const k = p.k, j = 1 - k;
      const x = j * j * ax + 2 * j * k * mx + k * k * to.x;
      const y = j * j * ay + 2 * j * k * my + k * k * to.y;
      const half = p.size / 2 + FLIGHT.centreGap;
      if (centre.some((q) => x + c.left + half > q.left && x + c.left - half < q.right && y + c.top + half > q.top && y + c.top - half < q.bottom)) continue;
      m.position.set(x, -y, 0);
      m.scale.setScalar(p.size);
      m.visible = true;
      shown++;
    }
    if (!shown) return;
    const o = this.camera;
    if (o.right !== w || o.bottom !== -h) {
      o.right = w;
      o.bottom = -h;
      o.updateProjectionMatrix();
    }
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.clearDepth();
    gl.render(this.scene, o);
    gl.autoClear = auto;
  }

  dispose() {
    if (!this.pool.length) return;
    this.pool = [];
    this.cancel("dispose");
    document.removeEventListener("visibilitychange", this.onHidden);
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.scene.clear();
  }
}
