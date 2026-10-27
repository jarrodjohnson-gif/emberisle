// Harbor Jelly (docs/design/harbor-jelly-prompt.md): the island's shore in the hexes' jelly look. A wide sand apron that
// rounds the coast's zigzag into bays and points and slopes into the crystal sea's clear shallows; dunes, grass, rocks,
// driftwood, wrack and crabs on it; sea grass, coral, starfish and a ray beyond the waterline. At each dock a timber pier on
// braced piles with a T-head, a dockhouse, the harbor's goods and a small sailing ship moored alongside; a story or two each.
// Built once per island after the hexes swap in (isle-renderer growScenes). The renderer bobs the ships and buoys on the
// swell (`floaters`, placed by their userData.rest) and paints a claimed harbor's sail.
import * as THREE from "three";
import type { HarborKind } from "@/lib/game/types";
import { PAINT } from "@/lib/scene/palette";
import { rng32, setBoardDetail, shoreKit } from "@/lib/scene/hex-jelly";

export type CoastPt = { id: string; x: number; z: number; mx: number; mz: number };
// A dock: the middle of its coastal edge, the outward miter there, its good and its two corners.
export type Dock = { cx: number; cz: number; mx: number; mz: number; kind: HarborKind; vids: string[] };
export type Shore = {
  group: THREE.Group;
  // Everything the swell carries (ships first, one per dock in order, then the buoys): rest = { x, z, yaw }.
  floaters: THREE.Group[];
  // The waterline as a coast (one point per sample, its outward normal), for the crystal sea's lace and swash.
  waterline: { x: number; z: number; mx: number; mz: number }[];
  update(t: number): void;
  dispose(): void;
};

type Kit = ReturnType<typeof shoreKit>;
type V3 = [number, number, number];

const SURFACE = -0.02;
// The crystal sea's floor (crystal-water.ts OFFSET / DEPTH), so what stands on it stands on it.
const FLOOR_O = [-0.3, 0.22, 0.5, 0.9, 1.4, 2.0, 2.8, 4.0];
const FLOOR_D = [0.08, 0.1, 0.16, 0.26, 0.42, 0.62, 0.82, 0.9];
const floorY = (o: number) => {
  if (o <= FLOOR_O[0]!) return SURFACE - FLOOR_D[0]!;
  for (let i = 1; i < FLOOR_O.length; i++)
    if (o <= FLOOR_O[i]!) return SURFACE - (FLOOR_D[i - 1]! + ((FLOOR_D[i]! - FLOOR_D[i - 1]!) * (o - FLOOR_O[i - 1]!)) / (FLOOR_O[i]! - FLOOR_O[i - 1]!));
  return SURFACE - 0.9;
};
const SEGS = 8;
// The ships at 1.3 times their built size, so they read from the board camera beside the hexes.
const SHIP_K = 1.3;
const smooth = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;

// The good each 2:1 harbor trades, in the hex palette.
const GOOD: Record<Exclude<HarborKind, "any">, string> = { timber: PAINT.timber[0], clay: PAINT.clay[0], wool: PAINT.wool[0], grain: PAINT.grain[0], ore: PAINT.ore[0] };
const goodOf = (k: HarborKind) => (k === "any" ? "#2f4f7a" : GOOD[k]);
// Nordic harbour colours for the dockhouses, and their roofs.
const WALLS = ["#b5452f", "#e2b64e", "#f4efe2", "#a9c6dc", "#a8d8bf", "#eab0b4"];
const ROOFS = ["#4a4248", "#7a3a2c", "#5a5f66", "#3f4a52"];

// --- the sail's face: plain cream canvas, a 2:1 sail's foot banded in its good's colour. The rate is on the pier's plate, not
// the sail (owner 2026-10-16).
const sails = new Map<HarborKind, THREE.CanvasTexture>();
function sailMap(kind: HarborKind) {
  let tex = sails.get(kind);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f7f1e3";
  x.fillRect(0, 0, 128, 128);
  // Seams: faint vertical cloths.
  x.fillStyle = "rgba(120,100,70,0.12)";
  for (let i = 1; i < 6; i++) x.fillRect(i * 21, 0, 1.5, 128);
  if (kind !== "any") {
    x.fillStyle = GOOD[kind];
    x.fillRect(0, 92, 128, 36);
    x.fillStyle = "rgba(255,255,255,0.6)";
    x.fillRect(0, 89, 128, 3);
  }
  // The spars' wood: a strip at the right edge, which the boom and gaff map to (they share the sail's draw).
  x.fillStyle = "#6a4a30";
  x.fillRect(124, 0, 4, 128);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  sails.set(kind, tex);
  return tex;
}

// The rate plates painted on the T-heads, read from above: one atlas, a row per kind (the good's colour, the rate in cream).
const PLATE_KINDS: HarborKind[] = ["any", "timber", "clay", "wool", "grain", "ore"];
let plates: THREE.CanvasTexture | null = null;
function plateAtlas() {
  if (plates) return plates;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128 * PLATE_KINDS.length;
  const x = c.getContext("2d")!;
  PLATE_KINDS.forEach((k, i) => {
    const y = i * 128;
    x.fillStyle = "#a87448";
    x.fillRect(0, y, 256, 128);
    x.fillStyle = "#f4ead6";
    x.beginPath();
    x.roundRect(4, y + 4, 248, 120, 40);
    x.fill();
    x.fillStyle = goodOf(k);
    x.beginPath();
    x.roundRect(12, y + 12, 232, 104, 32);
    x.fill();
    x.fillStyle = k === "wool" || k === "grain" ? "#263d3c" : "#fbf6ea";
    x.font = "900 76px system-ui, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(k === "any" ? "3:1" : "2:1", 128, y + 68);
  });
  plates = new THREE.CanvasTexture(c);
  plates.colorSpace = THREE.SRGBColorSpace;
  plates.anisotropy = 4;
  return plates;
}

// Darken and cool every vertex under the waterline (weed, mussels, wet wood or stone), and the wet band just above it.
function wetBand(g: THREE.BufferGeometry, top = 0.012) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!c) return g;
  const col = new THREE.Color();
  const weed = new THREE.Color("#3c5a3a");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > SURFACE + top) continue;
    col.fromBufferAttribute(c, i);
    if (y > SURFACE - 0.004) col.multiplyScalar(0.72);
    else col.lerp(weed, 0.55).multiplyScalar(0.8);
    c.setXYZ(i, col.r, col.g, col.b);
  }
  return g;
}

// A beam of radius r from a to b (a cylinder turned onto the segment).
function beam(K: Kit, a: V3, b: V3, r: number, hex: string) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = K.part(K.cyl(1, 1, 6), hex, [0, 0, 0], [0, 0, 0], [r, len, r]);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

// A lofted hull along +z (bow at +z), y 0 at the waterline: stations of a U section, beam and depth easing to the ends, the
// sheer rising fore and aft. Coloured by height: red-brown bottom, the boot-top, the planked topsides with faint strakes,
// a dark wale, a band in `band` under the gunwale. Returns the hull and its deck (a cap at the sheer).
function hullGeo(K: Kit, L: number, B: number, D: number, free: number, wood: string, band: string, bottom = "#9a3f2c") {
  const ST = 14;
  const AR = 12;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const cWood = new THREE.Color(wood);
  const cBand = new THREE.Color(band);
  const cBottom = new THREE.Color(bottom);
  const cWale = new THREE.Color("#3a2a20");
  const sheer = (u: number) => free + 0.035 * (2 * u - 1) ** 2 * (u > 0.5 ? 1.4 : 1);
  const station = (u: number) => {
    const e = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
    // Fuller aft than fore: a bluff stern, a fine bow.
    const fill = u < 0.5 ? 0.55 + 0.45 * Math.sqrt(e) : Math.pow(e, 0.8);
    return { b: B * 0.5 * fill, d: D * (0.35 + 0.65 * e) };
  };
  for (let s = 0; s <= ST; s++) {
    const u = s / ST;
    const z = (u - 0.5) * L;
    const { b, d } = station(u);
    const top = sheer(u);
    for (let a = 0; a <= AR; a++) {
      const th = (a / AR) * Math.PI; // 0 = port gunwale, PI = starboard gunwale
      const sx = -Math.cos(th);
      const sy = Math.sin(th);
      const x = sx * b * (0.92 + 0.08 * sy);
      const y = top - (top + d) * Math.pow(sy, 0.7);
      pos.push(x, y, z);
      const below = y < -0.004;
      c.copy(below ? cBottom : cWood);
      if (!below && y < 0.004) c.set("#f2eee4");
      else if (!below) {
        c.multiplyScalar(0.93 + 0.07 * Math.sin(y * 420));
        if (y > top - 0.016) c.copy(cBand);
        if (Math.abs(y - (top - 0.02)) < 0.0035) c.copy(cWale);
      }
      col.push(c.r, c.g, c.b);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < ST; s++)
    for (let a = 0; a < AR; a++) {
      const i = s * (AR + 1) + a;
      const j = i + AR + 1;
      idx.push(i, i + 1, j, i + 1, j + 1, j);
    }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  hull.setIndex(idx);
  const flat = hull.toNonIndexed();
  flat.computeVertexNormals();
  hull.dispose();
  // The deck: a flat cap of planks, just under the sheer.
  const shape = new THREE.Shape();
  for (let s = 0; s <= ST; s++) {
    const u = s / ST;
    const { b } = station(u);
    // Shape coordinates (across, -along): turned flat by -90 degrees about x, (x, y) lands on (x, -y) in z.
    if (s === 0) shape.moveTo(b * 0.95, -(u - 0.5) * L);
    else shape.lineTo(b * 0.95, -(u - 0.5) * L);
  }
  for (let s = ST; s >= 0; s--) {
    const u = s / ST;
    shape.lineTo(-station(u).b * 0.95, -(u - 0.5) * L);
  }
  const deck = K.part(new THREE.ShapeGeometry(shape), "#d8b07a", [0, free - 0.006, 0], [-Math.PI / 2, 0, 0]);
  return { hull: flat, deck, sheer, station };
}

// One ship, local frame: bow +z, y 0 at the water. Returns its group with the sail cloth named "sail" under a "swing" group
// on the mast (it sways a little in the wind).
function ship(K: Kit, cm: THREE.Material, kind: HarborKind, mats: THREE.Material[], geos: THREE.BufferGeometry[], moor: { bow: V3; stern: V3 } | null) {
  const big = kind === "any";
  const L = big ? 0.56 : 0.46;
  const B = big ? 0.15 : 0.13;
  const good = goodOf(kind);
  const h = hullGeo(K, L, B, 0.05, 0.072, big ? "#f2eee6" : "#a86a3e", big ? "#26406a" : good, big ? "#7a2f2a" : "#9a3f2c");
  const parts: THREE.BufferGeometry[] = [h.hull, h.deck];
  const deckY = 0.066;
  const mastZ = big ? 0.06 : 0.04;
  const mastH = big ? 0.5 : 0.44;
  // Hatch, a coil, a little aft cabin with a warm window, the tiller.
  parts.push(K.part(new THREE.BoxGeometry(1, 1, 1), "#8a5a34", [0, deckY + 0.008, mastZ + 0.07], [0, 0, 0], [0.06, 0.012, 0.06]));
  parts.push(K.part(new THREE.TorusGeometry(1, 0.35, 5, 10), "#d8c08a", [0.035, deckY + 0.004, mastZ - 0.04], [Math.PI / 2, 0, 0], [0.012, 0.012, 0.012]));
  const cabZ = -L * 0.3;
  parts.push(K.part(new THREE.BoxGeometry(1, 1, 1), big ? "#f6f2ea" : "#e8d6b4", [0, deckY + 0.02, cabZ], [0, 0, 0], [0.07, 0.04, 0.075]));
  parts.push(K.part(new THREE.BoxGeometry(1, 1, 1), big ? "#26406a" : "#7a3a2c", [0, deckY + 0.044, cabZ], [0, 0, 0], [0.08, 0.008, 0.085]));
  parts.push(K.part(new THREE.BoxGeometry(1, 1, 1), "#ffd27a", [0, deckY + 0.024, cabZ + 0.038], [0, 0, 0], [0.026, 0.014, 0.002]));
  parts.push(beam(K, [0, deckY + 0.012, -L * 0.47], [0, deckY + 0.03, -L * 0.36], 0.004, "#6a4a30"));
  // The bowsprit.
  parts.push(beam(K, [0, h.sheer(1) - 0.004, L * 0.44], [0, h.sheer(1) + 0.02, L * 0.66], 0.006, "#6a4a30"));
  // Masts: the main, and on a ketch the mizzen aft.
  const masts: { z: number; h: number }[] = [{ z: mastZ, h: mastH }];
  if (big) masts.push({ z: -L * 0.2, h: mastH * 0.7 });
  for (const m of masts) {
    parts.push(K.part(K.cyl(0.8, 1, 8), "#6a4a30", [0, deckY + m.h / 2, m.z], [0, 0, 0], [0.008, m.h, 0.008]));
    parts.push(K.part(K.sphere(8), "#e8c060", [0, deckY + m.h + 0.006, m.z], [0, 0, 0], [0.009, 0.009, 0.009]));
    // Shrouds to both gunwales, a little aft of the mast.
    for (const sx of [-1, 1]) parts.push(beam(K, [0, deckY + m.h * 0.92, m.z], [sx * B * 0.48, h.sheer(0.5 + m.z / L), m.z - 0.03], 0.0018, "#2a2420"));
  }
  // The flag at the main masthead in the good's colour, and on a ketch a pennant on the mizzen.
  parts.push(K.part(new THREE.BoxGeometry(1, 1, 1), good, [0, deckY + mastH + 0.0, mastZ - 0.03], [0, 0, 0], [0.002, 0.03, 0.05]));
  // The forestay to the bowsprit's end, and the jib on it.
  const head: V3 = [0, deckY + mastH * 0.78, mastZ];
  const sprit: V3 = [0, h.sheer(1) + 0.02, L * 0.66];
  parts.push(beam(K, head, sprit, 0.0018, "#2a2420"));
  {
    const jib = new THREE.BufferGeometry();
    const tack: V3 = [0, h.sheer(1) + 0.012, L * 0.6];
    const clew: V3 = [0.012, deckY + 0.03, mastZ + 0.05];
    jib.setAttribute("position", new THREE.Float32BufferAttribute([...head, ...tack, ...clew, ...head, ...clew, ...tack], 3));
    jib.computeVertexNormals();
    parts.push(K.part(jib, "#f2ebdc", [0, 0, 0]));
  }
  // The backstay to the stern.
  parts.push(beam(K, [0, deckY + mastH * 0.98, mastZ], [0, h.sheer(0) + 0.004, -L * 0.48], 0.0016, "#2a2420"));
  // A ketch's mizzen sail: plain cream, gaff-rigged.
  // A ketch's mizzen is furled on its boom: a cream roll lashed along it.
  if (big) {
    const mz = masts[1]!.z;
    parts.push(beam(K, [0, deckY + 0.045, mz], [0, deckY + 0.05, mz - 0.13], 0.004, "#6a4a30"));
    parts.push(beam(K, [0, deckY + 0.056, mz - 0.005], [0, deckY + 0.06, mz - 0.12], 0.011, "#efe6d2"));
  }
  // Mooring lines to the pier's bollards, if it is moored.
  if (moor) {
    parts.push(beam(K, [0.02, h.sheer(1) - 0.004, L * 0.42], moor.bow, 0.0016, "#d8c08a"));
    parts.push(beam(K, [0.02, h.sheer(0) - 0.004, -L * 0.44], moor.stern, 0.0016, "#d8c08a"));
  }
  // Rubber tyres along the pier side.
  const g = new THREE.Group();
  const body = K.merge(parts);
  geos.push(body);
  const hull = new THREE.Mesh(body, cm);
  hull.castShadow = true;
  g.add(hull);
  // The mainsail: a gaff sail between the mast, the boom and the gaff, with belly, set fore and aft.
  const swing = new THREE.Group();
  swing.position.set(0, 0, mastZ);
  swing.name = "swing";
  const sailH = mastH * 0.66;
  const sailW = big ? 0.22 : 0.2;
  const cloth = sailGeo(sailW, sailH);
  const sm = new THREE.MeshStandardMaterial({ color: 0xf4efe4, map: sailMap(kind), emissive: 0x8a8478, emissiveMap: sailMap(kind), side: THREE.DoubleSide, roughness: 0.6 });
  mats.push(sm);
  const sail = new THREE.Mesh<THREE.BufferGeometry>(cloth, sm);
  sail.name = "sail";
  sail.position.y = deckY + 0.05;
  sail.castShadow = true;
  // The boom and the gaff go with the sail (in the swing's frame the sail spreads aft, along -z: see sailGeo).
  // The spars ride in the sail's own mesh, mapped to the wood strip (one draw for the whole swinging rig).
  const wood = (g: THREE.BufferGeometry) => {
    g.deleteAttribute("color");
    const n = g.attributes.position!.count;
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2).map((_, k) => (k % 2 ? 0.5 : 0.985)), 2));
    return g.translate(0, -(deckY + 0.05), 0);
  };
  const rig = mergeRig([
    cloth,
    wood(beam(K, [0, deckY + 0.05, 0], [0, deckY + 0.05, -sailW], 0.005, "#6a4a30")),
    wood(beam(K, [0, deckY + 0.05 + sailH * 0.92, 0], [0, deckY + 0.05 + sailH * 0.98, -sailW * 0.95], 0.004, "#6a4a30")),
  ]);
  geos.push(rig);
  sail.geometry = rig;
  swing.add(sail);
  g.add(swing);
  return { g, L, B, mastZ };
}

// A gaff sail's cloth in the swing frame: luff up the mast (z 0), foot along the boom to -z, its head along the gaff; the
// plane faces x, bellied. UVs span the cloth for the rate.
function sailGeo(w: number, h: number) {
  const g = new THREE.PlaneGeometry(w, h, 6, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / w + 0.5; // 0 luff .. 1 leech (the cloth's uv stops short of the wood strip)
    const v = p.getY(i) / h + 0.5; // 0 foot .. 1 head
    // The leech's top is cut back (a gaff sail's head slopes up from the throat).
    const z = -u * w * (1 - 0.12 * v);
    const y = v * h * (1 - 0.08 * u) + 0.06 * h * u * v;
    const belly = 0.035 * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.1 + 0.9 * v));
    p.setXYZ(i, belly, y, z);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.95);
  return g;
}

// The swinging rig's parts (the cloth and the spars) as one geometry: position, normal and uv only.
function mergeRig(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(f.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") f.deleteAttribute(k);
    if (!f.attributes.normal) f.computeVertexNormals();
    return f;
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const f of flat) {
    pos.push(...(f.attributes.position!.array as Float32Array));
    nor.push(...(f.attributes.normal!.array as Float32Array));
    uv.push(...(f.attributes.uv!.array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// At board detail, as the hexes (lighter blobs and spheres).
export function buildShore(coast: CoastPt[], docks: Dock[], seed: number): Shore {
  setBoardDetail(true);
  try {
    return build(coast, docks, seed);
  } finally {
    setBoardDetail(false);
  }
}

function build(coast: CoastPt[], docks: Dock[], seed: number): Shore {
  const K = shoreKit();
  const r = rng32(seed);
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const cm = K.critterMat();
  mats.push(cm);
  const n = coast.length;

  // --- the coast, SEGS points per edge, and the waterline: an offset of the coast, smoothed so the zigzag rounds into bays
  // (wider) and points (narrower), its width wandering per island.
  const ring: { x: number; z: number; mx: number; mz: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = coast[i]!;
    const b = coast[(i + 1) % n]!;
    for (let s = 0; s < SEGS; s++) {
      const u = s / SEGS;
      let mx = a.mx + (b.mx - a.mx) * u;
      let mz = a.mz + (b.mz - a.mz) * u;
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
      ring.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, mx, mz });
    }
  }
  const m = ring.length;
  const ph = [r() * 6, r() * 6];
  let wl = ring.map((p, i) => {
    const s = (i / m) * Math.PI * 2;
    const w = 0.36 + 0.06 * Math.sin(s * 3 + ph[0]!) + 0.04 * Math.sin(s * 7 + ph[1]!);
    return { x: p.x + p.mx * w, z: p.z + p.mz * w };
  });
  for (let it = 0; it < 14; it++) wl = wl.map((p, i) => {
    const a = wl[(i + m - 1) % m]!;
    const b = wl[(i + 1) % m]!;
    return { x: p.x * 0.5 + (a.x + b.x) * 0.25, z: p.z * 0.5 + (a.z + b.z) * 0.25 };
  });
  // Never closer than 0.24 to its coast point, never farther than 0.62.
  const width = wl.map((p, i) => {
    const c = ring[i]!;
    const d = (p.x - c.x) * c.mx + (p.z - c.z) * c.mz;
    return Math.min(0.62, Math.max(0.24, d));
  });
  // The waterline's outward normal, from its neighbours.
  const water = ring.map((c, i) => {
    const p = { x: c.x + c.mx * width[i]!, z: c.z + c.mz * width[i]! };
    return p;
  });
  const normals = water.map((p, i) => {
    const a = water[(i + m - 1) % m]!;
    const b = water[(i + 1) % m]!;
    let nx = b.z - a.z;
    let nz = -(b.x - a.x);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (nx * ring[i]!.mx + nz * ring[i]!.mz < 0) [nx, nz] = [-nx, -nz];
    return { nx, nz };
  });

  // The apron's height across a column: t 0 under the slabs .. 1 at the waterline, then d beyond it under the water.
  const dune = (i: number, t: number) => {
    const s = (i / m) * Math.PI * 2;
    return 0.016 * Math.max(0, Math.sin(s * 23 + ph[0]!) * Math.sin(s * 9 - ph[1]!)) * (1 - smooth(t, 0.1, 0.4)) * smooth(t, 0.0, 0.08);
  };
  const landY = (i: number, t: number) => SURFACE + 0.072 * Math.pow(1 - smooth(t, 0.28, 1), 1.25) + dune(i, t);
  const T = [0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.85, 0.91, 0.96, 1];
  const DD = [0.05, 0.12, 0.2, 0.3, 0.42, 0.56];
  const at = (i: number, t: number) => {
    const c = ring[i]!;
    const o = -0.06 + (width[i]! + 0.06) * t;
    return { x: c.x + c.mx * o, z: c.z + c.mz * o, o };
  };
  const under = (i: number, d: number) => {
    const w = water[i]!;
    const nn = normals[i]!;
    const x = w.x + nn.nx * d;
    const z = w.z + nn.nz * d;
    const c = ring[i]!;
    const o = (x - c.x) * c.mx + (z - c.z) * c.mz;
    // Down from the waterline to just above the crystal floor, so the shelf reads pale under the shallows.
    const y = lerp(SURFACE, floorY(o) + 0.004, smooth(d, 0, 0.56));
    return { x, z, y, o };
  };

  // --- the apron: one strip, coloured dry, damp, wet, then the sunk sand with soft ripples.
  {
    const DRY = new THREE.Color("#f3e4bf");
    const DAMP = new THREE.Color("#e0cb98");
    const WET = new THREE.Color("#cdb583");
    const SUNK = new THREE.Color("#e2d3a8");
    const cols = T.length + DD.length;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < m; i++) {
      for (const t of T) {
        const p = at(i, t);
        const y = landY(i, t);
        pos.push(p.x, y, p.z);
        c.copy(DRY).lerp(DAMP, smooth(t, 0.55, 0.78)).lerp(WET, smooth(t, 0.82, 0.97));
        c.multiplyScalar(1 + 0.04 * Math.sin(p.x * 31 + p.z * 13) * Math.sin(p.x * 11 - p.z * 37) + (t < 0.4 ? dune(i, t) * 4 : 0));
        col.push(c.r, c.g, c.b);
      }
      for (const d of DD) {
        const p = under(i, d);
        pos.push(p.x, p.y, p.z);
        c.copy(WET).lerp(SUNK, smooth(d, 0.02, 0.2));
        // Sand ripples, faint bands along the shore.
        c.multiplyScalar(0.96 + 0.05 * Math.sin(d * 70 + Math.sin(p.x * 3 + p.z * 2) * 2));
        col.push(c.r, c.g, c.b);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < m; i++)
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = ((i + 1) % m) * cols + j;
        idx.push(a, a + 1, b + 1, a, b + 1, b);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (geo.attributes.normal!.getY(0) < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
    const top = K.topMat();
    mats.push(top);
    const apron = new THREE.Mesh(geo, top);
    apron.receiveShadow = true;
    apron.name = "apron";
    group.add(apron);
    geos.push(geo);
  }

  // --- where things may stand: clear of every coastal corner (pieces) and of every harbor's own ground.
  const corners = coast.map((c) => ({ x: c.x, z: c.z }));
  const harborAt = docks.map((d) => ({ x: d.cx + d.mx * 0.35, z: d.cz + d.mz * 0.35 }));
  const clear = (x: number, z: number, room: number) =>
    corners.every((c) => Math.hypot(x - c.x, z - c.z) > 0.14 + room) && harborAt.every((h) => Math.hypot(x - h.x, z - h.z) > 0.5 + room);
  // A random spot on the land at t in [t0, t1], or under the water at d in [d0, d1] (t1 > 1 means d = t1 - 1).
  const onLand = (t0: number, t1: number, room: number) => {
    for (let tries = 0; tries < 50; tries++) {
      const i = Math.floor(r() * m);
      const t = t0 + r() * (t1 - t0);
      const p = at(i, t);
      if (clear(p.x, p.z, room)) return { x: p.x, z: p.z, y: landY(i, t), i, a: Math.atan2(ring[i]!.mx, ring[i]!.mz) };
    }
    return null;
  };
  const inWater = (d0: number, d1: number, room: number, near?: { x: number; z: number; r: number }) => {
    for (let tries = 0; tries < 60; tries++) {
      const i = Math.floor(r() * m);
      const d = d0 + r() * (d1 - d0);
      const p = under(i, d);
      if (near && Math.hypot(p.x - near.x, p.z - near.z) > near.r) continue;
      if (!near && !clear(p.x, p.z, room)) continue;
      return { x: p.x, z: p.z, y: p.y, i, a: Math.atan2(ring[i]!.mx, ring[i]!.mz) };
    }
    return null;
  };

  // --- the scatter on the sand and in the shallows, one merged mesh: dune grass, rock groups, driftwood, shells, starfish,
  // the wrack line, sea grass, coral heads near the harbors, an amphora.
  {
    const parts: THREE.BufferGeometry[] = [];
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const blade = new THREE.ConeGeometry(1, 1, 3);
    for (let k = 0; k < 26; k++) {
      const s = onLand(0.04, 0.3, 0.02);
      if (!s) continue;
      for (let j = 0; j < 7; j++) {
        const h = 0.028 + r() * 0.03;
        const x = s.x + (r() - 0.5) * 0.06;
        const z = s.z + (r() - 0.5) * 0.06;
        parts.push(K.part(blade, j % 3 ? "#9cc46a" : "#d8c890", [x, s.y + h / 2, z], [(r() - 0.5) * 0.6, r() * 6, (r() - 0.5) * 0.6], [0.0035, h, 0.0035]));
      }
    }
    for (let k = 0; k < 9; k++) {
      const s = onLand(0.85, 1, 0.05);
      if (!s) continue;
      const big = 0.03 + r() * 0.02;
      for (let j = 0; j < 4; j++) {
        const kk = big * (1 - j * 0.2);
        const g = K.part(K.blobGeo(600 + k * 5 + j), ["#a49c90", "#b8b0a2", "#8e877c", "#c4bcae"][j]!, [s.x + (r() - 0.5) * 0.06, SURFACE + kk * 0.3, s.z + (r() - 0.5) * 0.06], [r(), r() * 6, 0], [kk * 1.1, kk * 0.8, kk]);
        parts.push(g);
      }
    }
    for (let k = 0; k < 3; k++) {
      const s = onLand(0.35, 0.65, 0.08);
      if (!s) continue;
      const a = s.a + Math.PI / 2 + (r() - 0.5) * 0.8;
      parts.push(K.part(K.cyl(1, 0.8, 8), "#d8ccb8", [s.x, s.y + 0.008, s.z], [Math.PI / 2, a, 0], [0.01, 0.14, 0.01]));
      parts.push(K.part(K.sphere(6), "#c9bba4", [s.x + Math.sin(a) * 0.05, s.y + 0.016, s.z + Math.cos(a) * 0.05], [0, 0, 0], [0.006, 0.014, 0.006]));
    }
    const cone = new THREE.ConeGeometry(1, 1, 7);
    for (let k = 0; k < 40; k++) {
      const s = onLand(0.5, 0.95, 0);
      if (!s) continue;
      parts.push(K.part(cone, ["#f6c7c0", "#fbeedd", "#f2d6a8", "#e8b8d0"][k % 4]!, [s.x, s.y + 0.003, s.z], [Math.PI / 2 - 0.3, r() * 6, 0], [0.007, 0.011, 0.004]));
    }
    for (let k = 0; k < 90; k++) {
      const s = onLand(0.68, 0.74, 0);
      if (!s) continue;
      parts.push(K.part(ico, k % 3 ? "#5a6a3c" : "#7a5a3a", [s.x, s.y + 0.002, s.z], [r() * 3, r() * 3, 0], [0.006, 0.0025, 0.004]));
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const star = (x: number, y: number, z: number, tint: string, k = 1) => {
      for (let arm = 0; arm < 5; arm++) {
        const a = (arm * Math.PI * 2) / 5 + x * 9;
        parts.push(K.part(box, tint, [x + Math.sin(a) * 0.008 * k, y + 0.003, z + Math.cos(a) * 0.008 * k], [0, a, 0], [0.006 * k, 0.004 * k, 0.018 * k]));
      }
    };
    for (let k = 0; k < 4; k++) {
      const s = onLand(0.8, 0.98, 0.02);
      if (s) star(s.x, s.y, s.z, k % 2 ? "#ef8a5a" : "#f2b54a");
    }
    // Sea grass: patches of swaying blades on the shelf and beyond it.
    for (let k = 0; k < 18; k++) {
      const s = inWater(0.12, 0.7, 0.02);
      if (!s) continue;
      for (let j = 0; j < 9; j++) {
        const h = 0.05 + r() * 0.05;
        parts.push(K.part(blade, j % 2 ? "#4f8a55" : "#6aa45c", [s.x + (r() - 0.5) * 0.08, s.y + h / 2, s.z + (r() - 0.5) * 0.08], [(r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4], [0.005, h, 0.005]));
      }
    }
    for (let k = 0; k < 6; k++) {
      const s = inWater(0.15, 0.55, 0.02);
      if (s) star(s.x, s.y, s.z, ["#e86a48", "#f2b54a", "#c85a8a"][k % 3]!, 1.3);
    }
    // Coral heads by each harbor, in candy colours, and an amphora at one.
    docks.forEach((d, di) => {
      for (let k = 0; k < 4; k++) {
        const s = inWater(0.1, 0.6, 0, { x: d.cx + d.mx * 0.7, z: d.cz + d.mz * 0.7, r: 0.45 });
        if (!s) continue;
        const tint = ["#f08a8a", "#c9a0e0", "#f2d27a", "#f2a6c0"][(k + di) % 4]!;
        const kk = 0.02 + r() * 0.015;
        for (let j = 0; j < 4; j++)
          parts.push(K.part(K.blobGeo(700 + di * 7 + k * 3 + j), tint, [s.x + (r() - 0.5) * 0.04, s.y + kk * (0.5 + j * 0.3), s.z + (r() - 0.5) * 0.04], [r(), r() * 6, 0], [kk * (1 - j * 0.15), kk * 0.7, kk * (1 - j * 0.15)]));
      }
    });
    {
      const s = inWater(0.3, 0.6, 0.05);
      if (s) {
        parts.push(K.part(K.sphere(10), "#c8744a", [s.x, s.y + 0.02, s.z], [0, 0, 1.3], [0.018, 0.03, 0.018]));
        parts.push(K.part(K.cyl(1, 1, 8), "#b8643a", [s.x + 0.03, s.y + 0.012, s.z], [0, 0, 1.3], [0.007, 0.02, 0.007]));
      }
    }
    if (parts.length) {
      const g = wetBand(K.merge(parts), 0.008);
      geos.push(g);
      const me = new THREE.Mesh(g, cm);
      me.castShadow = true;
      me.receiveShadow = true;
      me.name = "scatter";
      group.add(me);
    }
  }

  // --- the harbors: piers, dockhouses and goods merged into one mesh (the lamps and windows a second), the ships one group
  // each. Each in its dock's frame: +z out along the miter, +x along the coast.
  const pierParts: THREE.BufferGeometry[] = [];
  const glowParts: THREE.BufferGeometry[] = [];
  const plateParts: THREE.BufferGeometry[] = [];
  const floaters: THREE.Group[] = [];
  const life: ((t: number) => void)[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const DECK = 0.1;
  // One story per harbor, dealt round so each kind of moment appears.
  const stories = ["fisher", "gull", "cat", "rowboat", "hoist", "fisher", "gull", "rowboat", "cat"];
  for (let i = stories.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [stories[i], stories[j]] = [stories[j]!, stories[i]!];
  }
  docks.forEach((d, di) => {
    const yaw = Math.atan2(d.mx, d.mz);
    const frame = new THREE.Matrix4().compose(new THREE.Vector3(d.cx, 0, d.cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    const world = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(frame);
    const add = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry) => list.push(g.applyMatrix4(frame));
    const P = (g: THREE.BufferGeometry) => add(pierParts, g);
    // Where the waterline crosses the dock's centre line.
    let wv = 0.36;
    {
      let best = Infinity;
      water.forEach((w) => {
        const dx = w.x - d.cx;
        const dz = w.z - d.cz;
        const across = dx * d.mz - dz * d.mx;
        const out = dx * d.mx + dz * d.mz;
        if (Math.abs(across) < best && out > 0) [best, wv] = [Math.abs(across), out];
      });
    }
    const north = d.mz < -0.7;
    const v0 = 0.1;
    const v1 = wv + (north ? 0.74 : 0.5);
    const len = v1 - v0;
    const W = 0.2;
    const yAt = (v: number) => (v < wv ? lerp(SURFACE + 0.07, SURFACE, smooth(v / wv, 0.3, 1)) : lerp(SURFACE, floorY(v + 0.1) + 0.004, smooth(v - wv, 0, 0.56)));
    // The deck: planks across, the odd pale one, edge beams.
    const planks = Math.round(len / 0.03);
    for (let k = 0; k < planks; k++) {
      const v = v0 + ((k + 0.5) / planks) * len;
      P(K.part(box, k % 7 === 3 ? "#c99a6a" : k % 2 ? "#a46e42" : "#b07a4c", [0, DECK, v], [0, 0, (r() - 0.5) * 0.03], [W, 0.016, (len / planks) * 0.86]));
    }
    // The T-head across the sea end.
    const tv = v1 + 0.06;
    for (let k = 0; k < 7; k++) P(K.part(box, k % 2 ? "#a46e42" : "#b07a4c", [0, DECK, tv - 0.07 + k * 0.025], [0, 0, 0], [0.44, 0.016, 0.022]));
    for (const x of [-W / 2, W / 2]) P(K.part(box, "#7a5236", [x, DECK - 0.014, v0 + len / 2], [0, 0, 0], [0.014, 0.018, len]));
    // The rate plate, flat on the T-head, its text upright on screen whichever side of the island (the camera looks north).
    {
      const pl = new THREE.PlaneGeometry(0.36, 0.165);
      const row = PLATE_KINDS.indexOf(d.kind);
      const uv = pl.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / PLATE_KINDS.length);
      const at = world(0, DECK + 0.0085, tv);
      plateParts.push(pl.rotateX(-Math.PI / 2).translate(at.x, at.y, at.z));
    }
    P(K.part(box, "#7a5236", [0, DECK - 0.014, tv + 0.08], [0, 0, 0], [0.45, 0.018, 0.014]));
    P(K.part(box, "#7a5236", [0, DECK - 0.014, tv - 0.082], [0, 0, 0], [0.45, 0.018, 0.014]));
    // Piles in pairs every 0.12, down to the sand or the floor, braced with an X below the deck where they stand in water.
    const pileAt: { x: number; v: number }[] = [];
    for (let v = v0 + 0.04; v < v1; v += 0.12) for (const x of [-W / 2 - 0.004, W / 2 + 0.004]) pileAt.push({ x, v });
    for (const x of [-0.21, -0.07, 0.07, 0.21]) pileAt.push({ x, v: tv - 0.025 });
    for (const p of pileAt) {
      const foot = yAt(p.v) - 0.01;
      P(K.part(K.cyl(1, 1.05, 10), "#8a7058", [p.x, (DECK + foot) / 2, p.v], [0, 0, 0], [0.013, DECK - foot + 0.012, 0.013]));
      P(K.part(K.sphere(8), "#7a6048", [p.x, DECK + 0.012, p.v], [0, 0, 0], [0.014, 0.006, 0.014]));
    }
    for (let v = v0 + 0.04; v + 0.12 < v1; v += 0.12) {
      const ya = Math.max(yAt(v), SURFACE - 0.06);
      const yb = Math.max(yAt(v + 0.12), SURFACE - 0.06);
      if (yAt(v) > SURFACE + 0.02) continue;
      for (const x of [-W / 2 - 0.004, W / 2 + 0.004]) {
        P(beam(K, [x, DECK - 0.02, v], [x, yb + 0.01, v + 0.12], 0.004, "#7a6048"));
        P(beam(K, [x, ya + 0.01, v], [x, DECK - 0.02, v + 0.12], 0.004, "#7a6048"));
      }
      P(beam(K, [-W / 2, DECK - 0.03, v], [W / 2, ya + 0.02, v], 0.004, "#7a6048"));
    }
    // Bollards at the T-head's corners with rope coils, the ladder down on the far side, the lamp, the lifebuoy, tyres.
    const shipSide = di % 2 ? 1 : -1;
    const bollards: V3[] = [[shipSide * 0.2, DECK + 0.02, tv + 0.0], [shipSide * 0.16, DECK + 0.02, v1 - 0.25]];
    for (const [x, , v] of bollards) {
      P(K.part(K.cyl(0.9, 1, 10), "#3e3530", [x, DECK + 0.018, v], [0, 0, 0], [0.012, 0.03, 0.012]));
      P(K.part(K.sphere(8), "#3e3530", [x, DECK + 0.034, v], [0, 0, 0], [0.016, 0.007, 0.016]));
    }
    P(K.part(new THREE.TorusGeometry(1, 0.4, 5, 12), "#d8c08a", [-shipSide * 0.16, DECK + 0.012, tv - 0.02], [Math.PI / 2, 0, 0], [0.016, 0.016, 0.016]));
    for (const dx of [-0.018, 0.018]) P(beam(K, [-shipSide * 0.224 + dx, DECK + 0.03, tv - 0.02], [-shipSide * 0.224 + dx, SURFACE - 0.06, tv - 0.02], 0.003, "#8a6a48"));
    for (let k = 0; k < 6; k++) P(K.part(box, "#8a6a48", [-shipSide * 0.224, DECK - k * 0.022, tv - 0.02], [0, 0, 0], [0.004, 0.003, 0.04]));
    const lamp: V3 = [-shipSide * 0.2, DECK, tv + 0.0];
    P(K.part(K.cyl(1, 1, 8), "#3a3430", [lamp[0], DECK + 0.07, lamp[2]], [0, 0, 0], [0.006, 0.14, 0.006]));
    P(K.part(K.cyl(0.6, 1, 8), "#2a2622", [lamp[0], DECK + 0.158, lamp[2]], [0, 0, 0], [0.016, 0.012, 0.016]));
    add(glowParts, K.part(K.sphere(8), "#ffe1a0", [lamp[0], DECK + 0.142, lamp[2]], [0, 0, 0], [0.011, 0.014, 0.011]));
    P(K.part(K.cyl(1, 1, 8), "#6a4a30", [-shipSide * 0.08, DECK + 0.04, v1 - 0.12], [0, 0, 0], [0.005, 0.08, 0.005]));
    P(K.part(new THREE.TorusGeometry(1, 0.32, 6, 14), "#f07a3a", [-shipSide * 0.08 - 0.008 * -shipSide, DECK + 0.06, v1 - 0.12], [0, Math.PI / 2, 0], [0.022, 0.022, 0.022]));
    for (let k = 0; k < 4; k++) P(K.part(K.sphere(6), "#f4efe4", [-shipSide * 0.08 + 0.002 * shipSide, DECK + 0.06 + Math.sin((k * Math.PI) / 2 + 0.78) * 0.022, v1 - 0.12 + Math.cos((k * Math.PI) / 2 + 0.78) * 0.022], [0, 0, 0], [0.006, 0.006, 0.006]));
    for (const v of [tv - 0.03, v1 - 0.1, v1 - 0.2]) P(K.part(new THREE.TorusGeometry(1, 0.42, 6, 12), "#2a2828", [shipSide * (W / 2 + 0.012), DECK - 0.02, v], [0, Math.PI / 2, 0], [0.016, 0.016, 0.016]));

    // The dockhouse at the pier's root, on the side away from the ship, on low piles: plank walls, a pitched roof, a door, a
    // lit window, the sign in the good's colour.
    const hx = -shipSide * 0.2;
    // Clear of a path on the dock's edge (it reaches about 0.08 out).
    const hv = 0.15;
    const wall = WALLS[(di + Math.floor(r() * 6)) % WALLS.length]!;
    const roof = ROOFS[di % ROOFS.length]!;
    const hy = SURFACE + 0.075;
    for (const [px, pv] of [[-0.05, -0.04], [0.05, -0.04], [-0.05, 0.04], [0.05, 0.04]] as const) P(K.part(K.cyl(1, 1, 6), "#7a6048", [hx + px, hy - 0.006, hv + pv], [0, 0, 0], [0.007, 0.03, 0.007]));
    P(K.part(box, "#9a7a58", [hx, hy + 0.004, hv], [0, 0, 0], [0.13, 0.008, 0.1]));
    P(K.part(box, wall, [hx, hy + 0.04, hv], [0, 0, 0], [0.11, 0.07, 0.085]));
    for (const s of [-1, 1]) P(K.part(box, roof, [hx, hy + 0.088, hv + s * 0.024], [s * -0.6, 0, 0], [0.13, 0.008, 0.062]));
    P(K.part(box, roof, [hx, hy + 0.106, hv], [0, 0, 0], [0.132, 0.008, 0.01]));
    P(K.part(box, "#5a3a26", [hx + 0.025, hy + 0.028, hv + 0.0435], [0, 0, 0], [0.024, 0.046, 0.002]));
    add(glowParts, K.part(box, "#ffd27a", [hx - 0.025, hy + 0.045, hv + 0.0435], [0, 0, 0], [0.022, 0.018, 0.002]));
    P(K.part(box, "#f4efe4", [hx - 0.025, hy + 0.045, hv + 0.0442], [0, 0, 0], [0.026, 0.002, 0.001]));
    P(K.part(box, "#f4efe4", [hx - 0.025, hy + 0.045, hv + 0.0442], [0, 0, 0], [0.002, 0.022, 0.001]));
    P(K.part(box, "#3a2a20", [hx + shipSide * 0.057, hy + 0.065, hv + 0.03], [0, 0, 0], [0.004, 0.004, 0.03]));
    P(K.part(box, goodOf(d.kind), [hx + shipSide * 0.058, hy + 0.05, hv + 0.035], [0, 0, 0], [0.002, 0.022, 0.034]));

    // #846: keep the original goods, enlarged 2.5x and re-packed along the narrow pier.
    // Turning pallets lengthwise and stacking bales avoids widening the deck or adding signs.
    const goodsStart = pierParts.reduce((count, part) => count + part.attributes.position.count, 0);
    const goodsParts: THREE.BufferGeometry[] = [];
    const G = (geometry: THREE.BufferGeometry) => { goodsParts.push(geometry); P(geometry); };
    const S = 2.5;
    const stride = Math.min(0.65, (len - 0.2) / 0.64);
    const gv = Math.max(v0 + 0.22, v1 - 0.48 * stride);
    const gy = DECK + (north ? 0.14 : 0.02);
    const good = d.kind;
    if (good === "timber") {
      for (const [x, y] of [[-0.06, 0], [0, 0], [0.06, 0], [-0.03, 0.06], [0.03, 0.06], [0, 0.115]] as const) {
        G(K.part(K.cyl(1, 1, 10), "#8a5a34", [x, gy + 0.03 + y, gv], [Math.PI / 2, 0, 0], [0.012 * S, 0.11 * S, 0.012 * S]));
        G(K.part(K.cyl(1, 1, 10), "#ecca90", [x, gy + 0.03 + y, gv + 0.0555 * S], [Math.PI / 2, 0, 0], [0.0105 * S, 0.002 * S, 0.0105 * S]));
      }
      for (let k = 0; k < 3; k++) G(K.part(box, "#d8a870", [0, gy + 0.01 + k * 0.015, gv + 0.3 * stride], [0, Math.PI / 2, 0], [0.12 * S, 0.005 * S, 0.03 * S]));
    } else if (good === "clay" || good === "ore") {
      for (const pv of [gv, gv + 0.29 * stride]) {
        // Each original pallet is rotated, then enlarged uniformly: 0.175–0.188 across the 0.2-wide pier.
        const pallet = (geometry: THREE.BufferGeometry) => G(geometry.translate(0, -gy, -pv).scale(S, S, S).rotateY(Math.PI / 2).translate(0, gy, pv));
        if (good === "clay") {
          pallet(K.part(box, "#9a7048", [0, gy + 0.004, pv], [0, 0, 0], [0.11, 0.008, 0.075]));
          for (let l = 0; l < 3; l++) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
            pallet(K.part(box, (i + j + l) % 2 ? "#c8573a" : "#d86a46", [(i - 1) * 0.034 + (l % 2) * 0.006, gy + 0.016 + l * 0.018, pv + (j - 0.5) * 0.034], [0, 0, 0], [0.032, 0.016, 0.032]));
        } else {
          pallet(K.part(box, "#8a6040", [0, gy + 0.02, pv], [0, 0, 0], [0.1, 0.04, 0.07]));
          pallet(K.part(box, "#5e4028", [0, gy + 0.02, pv], [0, 0, 0], [0.104, 0.006, 0.074]));
          for (let k = 0; k < 7; k++)
            pallet(K.part(K.blobGeo(860 + k + di), k === 3 ? "#dfeaf2" : ["#7a8088", "#9aa0a6", "#5a6068"][k % 3]!, [(r() - 0.5) * 0.07, gy + 0.045 + r() * 0.01, pv + (r() - 0.5) * 0.045], [r(), r(), r()], [0.015, 0.012, 0.014]));
        }
      }
      if (good === "clay") G(K.part(K.sphere(10), "#c8744a", [0.05, gy + 0.06, gv + 0.48 * stride], [0, 0, 0], [0.018 * S, 0.024 * S, 0.018 * S]));
    } else if (good === "wool") {
      for (const [y, offset] of [[0, 0], [0, 0.16], [0.1, 0.08], [0, 0.33]] as const) {
        const v = gv + offset * stride;
        G(K.part(K.blobGeo(800 + di * 4 + Math.round(offset * 100)), "#f5efe2", [0, gy + 0.055 + y, v], [0, r(), 0], [0.03 * S, 0.022 * S, 0.028 * S]));
        G(K.part(new THREE.TorusGeometry(1, 0.1, 5, 14), "#a8845a", [0, gy + 0.055 + y, v], [0, Math.PI / 2, 0], [0.024 * S, 0.024 * S, 0.024 * S]));
      }
    } else if (good === "grain") {
      for (const [x, offset] of [[-0.044, 0], [0.044, 0], [-0.044, 0.13], [0.044, 0.13], [0, 0.26]] as const) {
        const v = gv + offset * stride;
        G(K.part(K.sphere(10), "#e8d2a0", [x, gy + 0.0625, v], [0, 0, 0], [0.021 * S, 0.025 * S, 0.019 * S]));
        G(K.part(K.cyl(1, 1, 8), "#c9a86a", [x, gy + 0.12, v], [0, 0, 0], [0.007 * S, 0.01 * S, 0.007 * S]));
      }
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        G(K.part(K.cyl(0.5, 1, 4), "#e6bc4e", [Math.cos(a) * 0.006 * S, gy + 0.034 * S, gv + 0.4 * stride + Math.sin(a) * 0.006 * S], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], [0.005 * S, 0.07 * S, 0.005 * S]));
      }
    } else {
      for (const offset of [0, 0.16]) {
        const v = gv + offset * stride;
        G(K.part(K.cyl(0.88, 0.88, 12), "#9a6a40", [-0.03, gy + 0.03 * S, v], [0, 0, 0], [0.024 * S, 0.06 * S, 0.024 * S]));
        for (const y of [0.012, 0.048]) G(K.part(K.cyl(1, 1, 12), "#4a4440", [-0.03, gy + y * S, v], [0, 0, 0], [0.0225 * S, 0.005 * S, 0.0225 * S]));
      }
      G(K.part(box, "#b88a58", [0, gy + 0.024 * S, gv + 0.33 * stride], [0, 0.15, 0], [0.05 * S, 0.048 * S, 0.05 * S]));
      G(K.part(box, "#8a6040", [0, gy + 0.024 * S, gv + 0.33 * stride], [0, 0.15, 0], [0.052 * S, 0.006 * S, 0.052 * S]));
      G(K.part(K.sphere(10), "#e8d2a0", [0, gy + 0.016 * S, gv + 0.49 * stride], [0, 0, 0], [0.02 * S, 0.016 * S, 0.018 * S]));
      G(K.part(box, "#6a7a5a", [0, gy + 0.002 * S, gv + 0.45 * stride], [0, Math.PI / 2, 0], [0.08 * S, 0.004 * S, 0.05 * S]));
    }
    const packingBounds = new THREE.Box3();
    const packingInverse = frame.clone().invert();
    for (const geometry of goodsParts) {
      const local = geometry.clone().applyMatrix4(packingInverse);
      local.computeBoundingBox();
      packingBounds.union(local.boundingBox!);
      local.dispose();
    }
    const packingLength = packingBounds.max.z - packingBounds.min.z;
    if (packingLength > len) {
      const center = (packingBounds.min.z + packingBounds.max.z) / 2;
      const fit = new THREE.Matrix4().makeTranslation(0, 0, center).multiply(new THREE.Matrix4().makeScale(1, 1, len / packingLength)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -center));
      const worldFit = frame.clone().multiply(fit).multiply(packingInverse);
      for (const geometry of goodsParts) geometry.applyMatrix4(worldFit);
      packingBounds.min.z = center - len / 2;
      packingBounds.max.z = center + len / 2;
    }
    const shift = Math.max(0, v0 - packingBounds.min.z) - Math.max(0, packingBounds.max.z - v1);
    if (shift) {
      const delta = new THREE.Vector3(0, 0, shift).applyMatrix4(frame).sub(new THREE.Vector3().setFromMatrixPosition(frame));
      for (const geometry of goodsParts) geometry.translate(delta.x, delta.y, delta.z);
    }
    // Semantic vertex ranges keep these merged goods inspectable without extra meshes or draw calls.
    const goodsBounds = new THREE.Box3();
    const inverse = frame.clone().invert();
    for (const geometry of goodsParts) {
      const local = geometry.clone().applyMatrix4(inverse);
      local.computeBoundingBox();
      goodsBounds.union(local.boundingBox!);
      local.dispose();
    }
    (group.userData.goodsPiles ??= []).push({ kind: good, start: goodsStart,
      count: goodsParts.reduce((count, part) => count + part.attributes.position.count, 0),
      min: goodsBounds.min.toArray(), max: goodsBounds.max.toArray(), frame: frame.toArray(),
      deck: { width: W, from: v0, to: v1 }, scale: S });

    // The ship, moored alongside the T-head's ship side, bow to the shore.
    const sv = tv - 0.04;
    const sx = shipSide * (0.22 + 0.09 * SHIP_K);
    const moorBow = world(shipSide * 0.16, DECK + 0.03, v1 - 0.25);
    const moorStern = world(shipSide * 0.2, DECK + 0.03, tv);
    const restW = world(sx, 0, sv);
    const sYaw = Math.atan2(-d.mx, -d.mz);
    // Local frame of the ship at rest: inverse of (rest, yaw).
    const toLocal = new THREE.Matrix4().compose(new THREE.Vector3(restW.x, SURFACE, restW.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sYaw, 0)), new THREE.Vector3(SHIP_K, SHIP_K, SHIP_K)).invert();
    const lb = moorBow.clone().applyMatrix4(toLocal);
    const ls = moorStern.clone().applyMatrix4(toLocal);
    const s = ship(K, cm, d.kind, mats, geos, { bow: [lb.x, lb.y, lb.z], stern: [ls.x, ls.y, ls.z] });
    // The renderer rides the group 0.07 above the swell's displacement; the hull's waterline sits on the water (rest -0.02).
    const holder = new THREE.Group();
    s.g.position.y = (SURFACE - 0.07) / SHIP_K;
    holder.scale.setScalar(SHIP_K);
    holder.add(s.g);
    holder.userData.rest = { x: restW.x, z: restW.z, yaw: sYaw };
    holder.userData.vids = d.vids;
    holder.userData.kind = d.kind;
    floaters.push(holder);
    // The boom swings a little on the mast as the wind shifts.
    const swing = s.g.getObjectByName("swing")!;
    life.push((t) => (swing.rotation.y = 0.12 * Math.sin(t * 0.35 + di * 1.7)));

    // The harbor's story.
    const story = stories[di % stories.length]!;
    if (story === "fisher" || story === "hoist") {
      const f = K.person(cm, ["#3f6a8a", "#c48a3a", "#6a8a4a"][di % 3]!, 0.25, "#e8c56a");
      const fx = -shipSide * 0.06;
      f.g.position.copy(world(fx, DECK + 0.008, tv + 0.02));
      f.g.rotation.y = yaw - Math.PI / 2;
      group.add(f.g);
      if (story === "fisher") {
        const rodTip = world(fx, DECK + 0.12, tv + 0.2);
        const rod = new THREE.Mesh(K.merge([beam(K, [0, 0, 0], [0, 0.11, 0.18], 0.0016, "#3a2a20"), beam(K, [0, 0.11, 0.18], [0, SURFACE - DECK - 0.002, 0.2], 0.0006, "#e8e4da"), K.part(K.sphere(6), "#e8392b", [0, SURFACE - DECK + 0.003, 0.2], [0, 0, 0], [0.005, 0.005, 0.005])]), cm);
        geos.push(rod.geometry);
        rod.position.copy(world(fx, DECK + 0.03, tv + 0.02));
        rod.rotation.y = yaw;
        group.add(rod);
        void rodTip;
        life.push((t) => {
          rod.rotation.x = 0.03 * Math.sin(t * 1.3 + di) + (Math.sin(t * 0.21 + di) > 0.96 ? -0.08 : 0);
        });
      } else {
        // The hoist: a post and arm by the house, a crate going up and down on its rope.
        const arm = K.merge([
          K.part(K.cyl(1, 1, 8), "#6a4a30", [hx + shipSide * 0.08, DECK + 0.08, hv + 0.08], [0, 0, 0], [0.007, 0.16, 0.007]),
          beam(K, [hx + shipSide * 0.08, DECK + 0.15, hv + 0.08], [hx + shipSide * 0.08, DECK + 0.15, hv + 0.2], 0.005, "#6a4a30"),
        ]).applyMatrix4(frame);
        geos.push(arm);
        group.add(new THREE.Mesh(arm, cm));
        const crate = new THREE.Mesh(K.merge([K.part(box, "#b88a58", [0, -0.012, 0], [0, 0, 0], [0.03, 0.024, 0.03]), K.part(K.cyl(1, 1, 4), "#d8c08a", [0, 0.03, 0], [0, 0, 0], [0.0012, 0.06, 0.0012])]), cm);
        geos.push(crate.geometry);
        const base = world(hx + shipSide * 0.08, 0, hv + 0.19);
        crate.rotation.y = yaw;
        group.add(crate);
        life.push((t) => {
          const u = 0.5 + 0.5 * Math.sin(t * 0.7 + di);
          crate.position.set(base.x, DECK + 0.03 + 0.06 * u, base.z);
        });
      }
    } else if (story === "gull") {
      // Perched, wings folded in: the gull's parts flattened into one mesh (one draw); it turns its head now and then.
      const gl = K.gull(cm);
      gl.pose(0, 0);
      for (const w of gl.g.children.slice(1)) w.scale.set(0.5, 1, 0.32);
      gl.g.updateMatrixWorld(true);
      const bits: THREE.BufferGeometry[] = [];
      gl.g.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh) bits.push(me.geometry.clone().applyMatrix4(me.matrixWorld));
      });
      const bird = new THREE.Mesh(K.merge(bits), cm);
      geos.push(bird.geometry);
      bird.position.copy(world(bollards[0]![0], DECK + 0.05, bollards[0]![2]));
      bird.rotation.y = yaw + 1.2;
      group.add(bird);
      life.push((t) => (bird.rotation.y = yaw + 1.2 + (Math.sin(t * 0.37 + di) > 0.6 ? 0.6 : 0)));
    } else if (story === "cat") {
      const cat = new THREE.Mesh(
        K.merge([
          K.part(K.sphere(10), "#e0913e", [0, 0.012, 0], [0, 0, 0], [0.016, 0.012, 0.011]),
          K.part(K.sphere(10), "#e0913e", [0.016, 0.026, 0], [0, 0, 0], [0.009, 0.008, 0.008]),
          K.part(new THREE.ConeGeometry(1, 1, 4), "#c8742c", [0.018, 0.036, 0.004], [0, 0, 0], [0.003, 0.006, 0.0025]),
          K.part(new THREE.ConeGeometry(1, 1, 4), "#c8742c", [0.018, 0.036, -0.004], [0, 0, 0], [0.003, 0.006, 0.0025]),
          beam(K, [-0.014, 0.008, 0], [-0.026, 0.028, 0.006], 0.003, "#c8742c"),
        ]),
        cm,
      );
      geos.push(cat.geometry);
      const c = world(0, DECK + 0.07, gv);
      cat.position.copy(c);
      cat.rotation.y = yaw;
      group.add(cat);
      life.push((t) => (cat.rotation.y = yaw + 0.5 * Math.sin(t * 0.4 + di) * (Math.sin(t * 0.13) > 0 ? 1 : 0.2)));
    } else if (story === "rowboat") {
      const h = hullGeo(K, 0.16, 0.07, 0.022, 0.018, "#5a8aa8", "#f4efe4", "#7a3a2c");
      const boat = new THREE.Group();
      const bm = K.merge([h.hull, h.deck, K.part(box, "#a87a4c", [0, 0.02, 0], [0, 0, 0], [0.06, 0.004, 0.016]), beam(K, [0.02, 0.022, 0.0], [0.08, -0.01, 0.04], 0.002, "#c9a070")]);
      geos.push(bm);
      const hm = new THREE.Mesh(bm, cm);
      hm.position.y = -0.07 + SURFACE;
      boat.add(hm);
      const rw = world(-shipSide * 0.29, 0, tv - 0.06);
      boat.userData.rest = { x: rw.x, z: rw.z, yaw: yaw + 0.3 };
      floaters.push(boat);
    }
  });
  if (pierParts.length) {
    const g = wetBand(K.merge(pierParts));
    geos.push(g);
    const me = new THREE.Mesh(g, cm);
    me.castShadow = true;
    me.receiveShadow = true;
    me.name = "harbors";
    group.add(me);
  }
  let glow: THREE.MeshStandardMaterial | null = null;
  if (glowParts.length) {
    const g = K.merge(glowParts);
    geos.push(g);
    glow = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: "#ffb84a", emissiveIntensity: 1.0, roughness: 0.4 });
    mats.push(glow);
    const me = new THREE.Mesh(g, glow);
    me.name = "lamps";
    group.add(me);
  }

  if (plateParts.length) {
    const g = K.merge(plateParts);
    geos.push(g);
    const pm = new THREE.MeshStandardMaterial({ map: plateAtlas(), emissive: 0x6a645a, emissiveMap: plateAtlas(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    mats.push(pm);
    const me = new THREE.Mesh(g, pm);
    me.receiveShadow = true;
    me.name = "plates";
    group.add(me);
  }

  // --- open water: three yellow mooring buoys and a red-and-white channel marker, clear of the harbors.
  {
    const marks = [
      { tint: "#f2c230", band: "#f2c230", tall: false },
      { tint: "#f2c230", band: "#f2c230", tall: false },
      { tint: "#f2c230", band: "#f2c230", tall: false },
      { tint: "#d8392b", band: "#f4efe4", tall: true },
    ];
    for (const mk of marks) {
      let spot: { x: number; z: number } | null = null;
      for (let tries = 0; tries < 60 && !spot; tries++) {
        const i = Math.floor(r() * m);
        const p = under(i, 0.7 + r() * 0.5);
        if (harborAt.every((h) => Math.hypot(p.x - h.x, p.z - h.z) > 0.9) && floaters.every((f) => Math.hypot(p.x - f.userData.rest.x, p.z - f.userData.rest.z) > 0.6)) spot = p;
      }
      if (!spot) continue;
      const parts = mk.tall
        ? [
            K.part(K.cyl(1, 1, 10), "#d8392b", [0, 0.02, 0], [0, 0, 0], [0.028, 0.05, 0.028]),
            K.part(K.cyl(0.7, 1, 10), "#f4efe4", [0, 0.06, 0], [0, 0, 0], [0.02, 0.03, 0.02]),
            K.part(K.cyl(0.6, 0.7, 10), "#d8392b", [0, 0.09, 0], [0, 0, 0], [0.014, 0.03, 0.014]),
            K.part(K.sphere(8), "#f4efe4", [0, 0.115, 0], [0, 0, 0], [0.012, 0.012, 0.012]),
          ]
        : [K.part(K.sphere(10), mk.tint, [0, 0.008, 0], [0, 0, 0], [0.022, 0.018, 0.022]), K.part(K.cyl(1, 1, 6), "#5a5048", [0, 0.032, 0], [0, 0, 0], [0.003, 0.02, 0.003])];
      const g = K.merge(parts);
      geos.push(g);
      const holder = new THREE.Group();
      const me = new THREE.Mesh(g, cm);
      me.position.y = -0.07 + SURFACE;
      holder.add(me);
      holder.userData.rest = { x: spot.x, z: spot.z, yaw: r() * 6 };
      floaters.push(holder);
    }
  }

  // --- the crabs (an instance each, scuttling sideways along the beach and pausing) and the ray (gliding round the island).
  const crabs: { i: number; t: number; ph: number }[] = [];
  let crabMesh: THREE.InstancedMesh | null = null;
  for (let k = 0; k < 5; k++) {
    const s = onLand(0.7, 0.95, 0.06);
    if (s) crabs.push({ i: s.i, t: 0.7 + r() * 0.25, ph: r() * 10 });
  }
  {
    const crab = K.merge([
      K.part(K.sphere(10), "#e2553a", [0, 0.006, 0], [0, 0, 0], [0.011, 0.006, 0.008]),
      ...[1, -1].flatMap((side) => [
        K.part(K.sphere(8), "#e86a48", [0.004, 0.008, 0.012 * side], [0, 0, 0], [0.005, 0.004, 0.004]),
        K.part(K.sphere(6), "#1a1414", [0.008, 0.012, 0.003 * side], [0, 0, 0], [0.0018, 0.0018, 0.0018]),
        ...[-0.006, 0, 0.006].map((x) => K.part(box, "#c84a32", [x, 0.003, 0.01 * side], [0.5 * side, 0, 0], [0.0016, 0.0016, 0.009])),
      ]),
    ]);
    geos.push(crab);
    if (crabs.length) {
      crabMesh = new THREE.InstancedMesh(crab, cm, crabs.length);
      crabMesh.name = "crabs";
      group.add(crabMesh);
    }
  }
  const ray = new THREE.Mesh(
    K.merge([
      K.part(K.sphere(12), "#5a6a78", [0, 0, 0], [0, 0, 0], [0.09, 0.012, 0.06]),
      K.part(K.sphere(10), "#8a98a6", [0, -0.004, 0], [0, 0, 0], [0.08, 0.008, 0.05]),
      beam(K, [0, 0, -0.05], [0, 0, -0.16], 0.003, "#4a5a68"),
      K.part(K.sphere(6), "#e8eef2", [0.02, 0.008, 0.035], [0, 0, 0], [0.006, 0.004, 0.006]),
      K.part(K.sphere(6), "#e8eef2", [-0.02, 0.008, 0.035], [0, 0, 0], [0.006, 0.004, 0.006]),
    ]),
    cm,
  );
  geos.push(ray.geometry);
  ray.name = "ray";
  group.add(ray);
  const rayAt = (u: number) => {
    const i = Math.floor((((u % 1) + 1) % 1) * m);
    return under(i, 0.85);
  };

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const update = (t: number) => {
    if (crabMesh) {
      crabs.forEach((c, k) => {
        const cyc = (t * 0.35 + c.ph) % 4;
        const step = cyc < 1 ? cyc : cyc < 2 ? 1 : cyc < 3 ? 3 - cyc : 0;
        const moving = cyc < 1 || (cyc >= 2 && cyc < 3);
        const i = (c.i + Math.round((step - 0.5) * 3) + m) % m;
        const p = at(i, c.t);
        _p.set(p.x, landY(i, c.t) + (moving ? Math.abs(Math.sin(t * 30)) * 0.002 : 0), p.z);
        _q.setFromEuler(_e.set(0, Math.atan2(ring[i]!.mx, ring[i]!.mz) + Math.PI / 2, 0));
        crabMesh!.setMatrixAt(k, _m.compose(_p, _q, _s));
      });
      crabMesh.instanceMatrix.needsUpdate = true;
    }
    {
      const u = t * 0.006;
      const a = rayAt(u);
      const b = rayAt(u + 0.004);
      ray.position.set(a.x, a.y + 0.03, a.z);
      ray.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
      ray.scale.set(1 + 0.12 * Math.sin(t * 2.2), 1, 1);
    }
    if (glow) glow.emissiveIntensity = 0.95 + 0.12 * Math.sin(t * 3.1) * Math.sin(t * 1.7);
    for (const f of life) f(t);
  };
  update(0);
  for (const f of floaters) group.add(f);

  return {
    group,
    floaters,
    waterline: water.map((w, i) => ({ x: w.x - normals[i]!.nx * 0.25, z: w.z - normals[i]!.nz * 0.25, mx: normals[i]!.nx, mz: normals[i]!.nz })),
    update,
    dispose() {
      for (const g of geos) g.dispose();
      for (const mt of mats) mt.dispose();
      crabMesh?.dispose();
    },
  };
}
