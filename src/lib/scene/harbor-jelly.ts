// Harbor Jelly (docs/design/harbor-jelly-prompt.md): the island's shore in the hexes' jelly look. A moulded sand bank round
// the coast with a sparse seeded scatter and a few crabs, and at each dock a chunky pier with its cargo and a chubby boat.
// Built once per island after the hexes swap in (isle-renderer growScenes); the renderer still bobs the boats on the swell
// and paints a claimed dock's sail.
import * as THREE from "three";
import type { HarborKind } from "@/lib/game/types";
import { PAINT } from "@/lib/scene/palette";
import { rng32, setBoardDetail, shoreKit } from "@/lib/scene/hex-jelly";

export type CoastPt = { id: string; x: number; z: number; mx: number; mz: number };
// A dock: the middle of its coastal edge, the outward miter there, its good and its two corners.
export type Dock = { cx: number; cz: number; mx: number; mz: number; kind: HarborKind; vids: string[] };
export type Shore = { group: THREE.Group; boats: THREE.Group[]; update(t: number, eye: THREE.Vector3): void; dispose(): void };
// Board scale: the piers 1.3 times wider and taller than built, the boats 1.45 times, so they read from the board camera.
const PIER_K = 1.3;
export const BOAT_K = 1.45;

// The bank's cross-section, by offset along the miter (negative tucks under the slabs): flat dry sand, then a roll down
// through the wet band into the jelly shallows (the sea rests at -0.02).
const PROFILE: [number, number][] = [[-0.04, 0.05], [0.02, 0.05], [0.12, 0.047], [0.17, 0.04], [0.2, 0.028], [0.225, 0.008], [0.25, -0.022], [0.28, -0.04]];
const DRY = new THREE.Color("#f0dfb4");
const WET = new THREE.Color("#d6c08e");
const SUNK = new THREE.Color("#c4ad7c");
const SEGS = 8;
const PIER_FROM = 0.2;
const PIER_TO = 0.52;
const DECK_Y = 0.1;

// The good each 2:1 dock holds, in the hex palette; the 3:1 docks a mixed pile.
const GOOD: Record<Exclude<HarborKind, "any">, string> = { timber: PAINT.timber[0], clay: PAINT.clay[0], wool: PAINT.wool[0], grain: PAINT.grain[0], ore: PAINT.ore[0] };

// The sail's face: cream canvas, the rate large and heavy, a 2:1 sail's foot banded in its good's colour with a pale stitch line.
const sails = new Map<HarborKind, THREE.CanvasTexture>();
function sailMap(kind: HarborKind) {
  let tex = sails.get(kind);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f6f0e2";
  x.fillRect(0, 0, 128, 128);
  if (kind !== "any") {
    x.fillStyle = GOOD[kind];
    x.fillRect(0, 88, 128, 40);
    x.fillStyle = "rgba(255,255,255,0.55)";
    x.fillRect(0, 86, 128, 3);
  }
  x.fillStyle = "#1c1915";
  x.font = "900 54px system-ui, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(kind === "any" ? "3:1" : "2:1", 64, kind === "any" ? 64 : 46);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  sails.set(kind, tex);
  return tex;
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

  // Every point along the coast, SEGS per edge, its miter eased between the corners'.
  const ring: { x: number; z: number; mx: number; mz: number; corner: boolean }[] = [];
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
      ring.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, mx, mz, corner: s === 0 });
    }
  }

  // The bank: one strip, coloured dry to wet to sunk by its offset, with a faint mottle.
  {
    const cols = PROFILE.length;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const p of ring) {
      for (const [o, y] of PROFILE) {
        const x = p.x + p.mx * o;
        const z = p.z + p.mz * o;
        pos.push(x, y, z);
        c.copy(DRY).lerp(WET, THREE.MathUtils.smoothstep(o, 0.14, 0.2)).lerp(SUNK, THREE.MathUtils.smoothstep(o, 0.22, 0.27));
        c.multiplyScalar(1 + 0.05 * Math.sin(x * 23 + z * 17) * Math.sin(x * 9 - z * 31));
        col.push(c.r, c.g, c.b);
      }
    }
    const idx: number[] = [];
    const m = ring.length;
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
    const bank = new THREE.Mesh(geo, top);
    bank.receiveShadow = true;
    bank.name = "bank";
    group.add(bank);
    geos.push(geo);
  }

  // Where scatter may sit: on the dry or wet sand, clear of every coastal corner (pieces) and of every dock.
  const corners = coast.map((c) => ({ x: c.x, z: c.z }));
  const clear = (x: number, z: number, room: number) =>
    corners.every((c) => Math.hypot(x - c.x, z - c.z) > 0.14 + room) && docks.every((d) => Math.hypot(x - (d.cx + d.mx * 0.3), z - (d.cz + d.mz * 0.3)) > 0.3 + room);
  const yAt = (o: number) => {
    for (let k = 1; k < PROFILE.length; k++) {
      const [o1, y1] = PROFILE[k]!;
      const [o0, y0] = PROFILE[k - 1]!;
      if (o <= o1) return y0 + ((y1 - y0) * (o - o0)) / (o1 - o0);
    }
    return PROFILE.at(-1)![1];
  };
  const spot = (o0: number, o1: number, room: number) => {
    for (let tries = 0; tries < 40; tries++) {
      const p = ring[Math.floor(r() * ring.length)]!;
      const o = o0 + r() * (o1 - o0);
      const x = p.x + p.mx * o;
      const z = p.z + p.mz * o;
      if (clear(x, z, room)) return { x, z, y: yAt(o), a: Math.atan2(p.mx, p.mz) };
    }
    return null;
  };

  // The scatter, merged: pebbles, shells, starfish, weedy rock clusters and a driftwood log or two. Nothing above 0.05.
  {
    const parts: THREE.BufferGeometry[] = [];
    const ico = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 70; i++) {
      const s = spot(0.03, 0.2, 0);
      if (!s) continue;
      const k = 0.005 + r() * 0.005;
      parts.push(K.part(ico, r() < 0.7 ? "#fbf7ee" : "#d9d2c4", [s.x, s.y + k * 0.4, s.z], [r() * 3, r() * 3, 0], [k, k * 0.6, k]));
    }
    const cone = new THREE.ConeGeometry(1, 1, 7);
    for (let i = 0; i < 24; i++) {
      const s = spot(0.05, 0.19, 0);
      if (!s) continue;
      parts.push(K.part(cone, ["#f6c7c0", "#fbeedd", "#f2d6a8"][i % 3]!, [s.x, s.y + 0.003, s.z], [Math.PI / 2 - 0.3, r() * 6, 0], [0.008, 0.012, 0.004]));
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 5; i++) {
      const s = spot(0.08, 0.19, 0.02);
      if (!s) continue;
      const tint = i % 2 ? "#ef8a5a" : "#f2b54a";
      for (let arm = 0; arm < 5; arm++) {
        const a = s.a + (arm * Math.PI * 2) / 5;
        parts.push(K.part(box, tint, [s.x + Math.sin(a) * 0.008, s.y + 0.003, s.z + Math.cos(a) * 0.008], [0, a, 0], [0.006, 0.004, 0.017]));
      }
      parts.push(K.part(K.sphere(6), tint, [s.x, s.y + 0.004, s.z], [0, 0, 0], [0.007, 0.004, 0.007]));
    }
    for (let i = 0; i < 9; i++) {
      const s = spot(0.1, 0.24, 0.04);
      if (!s) continue;
      const big = 0.02 + r() * 0.012;
      for (let k = 0; k < 3; k++) {
        const ox = (r() - 0.5) * 0.04;
        const oz = (r() - 0.5) * 0.04;
        const kk = big * (1 - k * 0.25);
        parts.push(K.part(K.blobGeo(500 + i * 3 + k), ["#8a6a50", "#a07e5c", "#6e5444"][k]!, [s.x + ox, s.y + kk * 0.45, s.z + oz], [r(), r() * 6, 0], [kk, kk * 0.75, kk]));
      }
      parts.push(K.part(K.blobGeo(560 + i), "#5f9a52", [s.x, s.y + big * 0.25, s.z + 0.012], [0, r() * 6, 0], [big * 0.8, big * 0.3, big * 0.5]));
    }
    for (let i = 0; i < 2; i++) {
      const s = spot(0.06, 0.16, 0.06);
      if (!s) continue;
      parts.push(K.part(K.cyl(1, 0.85, 8), "#d8ccb8", [s.x, s.y + 0.008, s.z], [Math.PI / 2, s.a + 1.3 + r(), 0], [0.009, 0.11, 0.009]));
      parts.push(K.part(K.sphere(6), "#cbbda6", [s.x + Math.sin(s.a + 1.3) * 0.04, s.y + 0.014, s.z + Math.cos(s.a + 1.3) * 0.04], [0, 0, 0], [0.006, 0.01, 0.006]));
    }
    if (parts.length) {
      const g = K.merge(parts);
      geos.push(g);
      const m = new THREE.Mesh(g, cm);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = "scatter";
      group.add(m);
    }
  }

  // The crabs: an instance each, scuttling sideways along the beach and pausing.
  const crabs: { p: { x: number; z: number; mx: number; mz: number }; o: number; ph: number }[] = [];
  let crabMesh: THREE.InstancedMesh | null = null;
  {
    for (let i = 0; i < 3; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const p = ring[Math.floor(r() * ring.length)]!;
        const o = 0.08 + r() * 0.08;
        if (!clear(p.x + p.mx * o, p.z + p.mz * o, 0.08)) continue;
        crabs.push({ p, o, ph: r() * 10 });
        break;
      }
    }
    const crab = K.merge([
      K.part(K.sphere(10), "#e2553a", [0, 0.006, 0], [0, 0, 0], [0.011, 0.006, 0.008]),
      ...[1, -1].flatMap((side) => [
        K.part(K.sphere(8), "#e86a48", [0.004, 0.008, 0.012 * side], [0, 0, 0], [0.005, 0.004, 0.004]),
        K.part(K.sphere(6), "#1a1414", [0.008, 0.012, 0.003 * side], [0, 0, 0], [0.0018, 0.0018, 0.0018]),
        ...[-0.006, 0, 0.006].map((x) => K.part(new THREE.BoxGeometry(1, 1, 1), "#c84a32", [x, 0.003, 0.01 * side], [0.5 * side, 0, 0], [0.0016, 0.0016, 0.009])),
      ]),
    ]);
    geos.push(crab);
    if (crabs.length) {
      crabMesh = new THREE.InstancedMesh(crab, cm, crabs.length);
      crabMesh.castShadow = true;
      crabMesh.name = "crabs";
      group.add(crabMesh);
    }
  }

  // The docks: every pier and its cargo merged into one mesh (the lanterns' glass a second), placed from the dock's local
  // frame (+z out to sea along the miter, +x along the coast).
  const glassParts: THREE.BufferGeometry[] = [];
  const pierParts: THREE.BufferGeometry[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  docks.forEach((d, di) => {
    const yaw = Math.atan2(d.mx, d.mz);
    const frame = new THREE.Matrix4().compose(new THREE.Vector3(d.cx, 0, d.cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(PIER_K, PIER_K, 1));
    const add = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry) => list.push(g.applyMatrix4(frame));
    const len = PIER_TO - PIER_FROM;
    // Planks across the deck, alternating warm woods, with a hair's gap.
    const planks = 7;
    for (let k = 0; k < planks; k++) {
      const z = PIER_FROM + ((k + 0.5) / planks) * len;
      add(pierParts, K.part(box, k % 2 ? "#a46e42" : "#b07a4c", [0, DECK_Y, z], [0, 0, (r() - 0.5) * 0.04], [0.17, 0.024, (len / planks) * 0.9]));
    }
    // Two stringers under the planks, rolled ends.
    for (const x of [-0.06, 0.06]) add(pierParts, K.part(K.cyl(1, 1, 8), "#7a5236", [x, DECK_Y - 0.02, PIER_FROM + len / 2], [Math.PI / 2, 0, 0], [0.012, len, 0.012]));
    // Four fat posts, each with a rope ring.
    for (const [x, z] of [[-0.075, PIER_FROM + 0.1], [0.075, PIER_FROM + 0.1], [-0.075, PIER_TO - 0.02], [0.075, PIER_TO - 0.02]] as const) {
      add(pierParts, K.part(K.cyl(1, 1.1, 10), "#7a5236", [x, DECK_Y - 0.045, z], [0, 0, 0], [0.018, 0.14, 0.018]));
      add(pierParts, K.part(K.sphere(8), "#8a6040", [x, DECK_Y + 0.026, z], [0, 0, 0], [0.019, 0.01, 0.019]));
      add(pierParts, K.part(new THREE.TorusGeometry(1, 0.28, 6, 12), "#d9c08a", [x, DECK_Y - 0.03, z], [Math.PI / 2, 0, 0], [0.02, 0.02, 0.02]));
    }
    // The bollard at the sea end and the lantern post on the other corner.
    add(pierParts, K.part(K.cyl(1, 1, 10), "#4a3a30", [0.045, DECK_Y + 0.026, PIER_TO - 0.04], [0, 0, 0], [0.012, 0.03, 0.012]));
    add(pierParts, K.part(K.sphere(8), "#4a3a30", [0.045, DECK_Y + 0.042, PIER_TO - 0.04], [0, 0, 0], [0.015, 0.008, 0.015]));
    add(pierParts, K.part(K.cyl(1, 1, 8), "#5a4030", [-0.065, DECK_Y + 0.06, PIER_TO - 0.04], [0, 0, 0], [0.007, 0.12, 0.007]));
    add(pierParts, K.part(K.cyl(1, 1, 8), "#2f2a26", [-0.065, DECK_Y + 0.14, PIER_TO - 0.04], [0, 0, 0], [0.016, 0.006, 0.016]));
    add(pierParts, K.part(K.cyl(1, 1, 8), "#2f2a26", [-0.065, DECK_Y + 0.105, PIER_TO - 0.04], [0, 0, 0], [0.014, 0.005, 0.014]));
    add(glassParts, K.part(K.sphere(8), "#ffe1a0", [-0.065, DECK_Y + 0.123, PIER_TO - 0.04], [0, 0, 0], [0.012, 0.016, 0.012]));
    // The cargo, on the deck's land half.
    const cz = PIER_FROM + 0.08;
    const cy = DECK_Y + 0.012;
    const good = d.kind;
    if (good === "timber")
      for (const [x, y] of [[-0.022, 0], [0.022, 0], [0, 0.036]] as const) {
        add(pierParts, K.part(K.cyl(1, 1, 10), "#8a5a34", [x, cy + 0.018 + y, cz], [0, 0, Math.PI / 2], [0.018, 0.12, 0.018]));
        for (const s of [-1, 1]) add(pierParts, K.part(K.cyl(1, 1, 10), "#e8c690", [x + s * 0.0605, cy + 0.018 + y, cz], [0, 0, Math.PI / 2], [0.015, 0.002, 0.015]));
      }
    else if (good === "clay") {
      add(pierParts, K.part(box, "#9a7048", [0, cy + 0.004, cz], [0, 0, 0], [0.11, 0.008, 0.08]));
      for (let l = 0; l < 3; l++)
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++)
            add(pierParts, K.part(box, (i + j + l) % 2 ? "#c8573a" : "#d86a46", [(i - 1) * 0.034 + (l % 2) * 0.008, cy + 0.016 + l * 0.02, cz + (j - 0.5) * 0.036], [0, 0, 0], [0.032, 0.018, 0.034]));
    } else if (good === "wool")
      for (const [x, y] of [[-0.03, 0], [0.03, 0], [0, 0.042]] as const) {
        add(pierParts, K.part(K.blobGeo(700 + di + x * 100), "#f3ecdf", [x, cy + 0.024 + y, cz], [0, r(), 0], [0.032, 0.024, 0.03]));
        add(pierParts, K.part(new THREE.TorusGeometry(1, 0.12, 5, 14), "#b48a5a", [x, cy + 0.024 + y, cz], [0, Math.PI / 2, 0], [0.026, 0.026, 0.026]));
      }
    else if (good === "grain") {
      for (const [x, z] of [[-0.03, -0.012], [0.024, 0.014], [0.004, -0.03]] as const) {
        add(pierParts, K.part(K.sphere(10), "#e6cf9a", [x, cy + 0.024, cz + z], [0, 0, 0], [0.022, 0.026, 0.02]));
        add(pierParts, K.part(K.cyl(1, 1, 8), "#c9a86a", [x, cy + 0.05, cz + z], [0, 0, 0], [0.008, 0.012, 0.008]));
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        add(pierParts, K.part(K.cyl(0.5, 1, 4), "#e2b84e", [0.05 + Math.cos(a) * 0.006, cy + 0.035, cz + 0.03 + Math.sin(a) * 0.006], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], [0.005, 0.07, 0.005]));
      }
      add(pierParts, K.part(new THREE.TorusGeometry(1, 0.3, 5, 10), "#b88a3a", [0.05, cy + 0.03, cz + 0.03], [Math.PI / 2, 0, 0], [0.01, 0.01, 0.01]));
    } else if (good === "ore") {
      add(pierParts, K.part(box, "#8a6040", [0, cy + 0.02, cz], [0, 0, 0], [0.1, 0.04, 0.07]));
      add(pierParts, K.part(box, "#6e4a30", [0, cy + 0.02, cz], [0, 0, 0], [0.104, 0.008, 0.074]));
      for (let k = 0; k < 7; k++)
        add(pierParts, K.part(K.blobGeo(760 + k), k === 3 ? "#d8e4ee" : ["#7a8088", "#9aa0a6", "#5a6068"][k % 3]!, [(r() - 0.5) * 0.07, cy + 0.045 + r() * 0.012, cz + (r() - 0.5) * 0.045], [r(), r(), r()], [0.016, 0.013, 0.015]));
    } else {
      add(pierParts, K.part(K.cyl(0.9, 0.9, 12), "#9a6a40", [-0.04, cy + 0.03, cz], [0, 0, 0], [0.024, 0.06, 0.024]));
      for (const y of [0.012, 0.048]) add(pierParts, K.part(K.cyl(1, 1, 12), "#4a4440", [-0.04, cy + y, cz], [0, 0, 0], [0.0225, 0.005, 0.0225]));
      add(pierParts, K.part(box, "#b88a58", [0.03, cy + 0.024, cz - 0.008], [0, 0.3, 0], [0.05, 0.048, 0.05]));
      add(pierParts, K.part(box, "#8a6040", [0.03, cy + 0.024, cz - 0.008], [0, 0.3, 0], [0.052, 0.006, 0.052]));
      add(pierParts, K.part(K.sphere(10), "#e6cf9a", [0.012, cy + 0.016, cz + 0.035], [0, 0, 0], [0.02, 0.016, 0.018]));
    }
  });
  if (pierParts.length) {
    const g = K.merge(pierParts);
    geos.push(g);
    const m = new THREE.Mesh(g, cm);
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = "piers";
    group.add(m);
  }
  let glass: THREE.MeshStandardMaterial | null = null;
  if (glassParts.length) {
    const g = K.merge(glassParts);
    geos.push(g);
    glass = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: "#ffb84a", emissiveIntensity: 1.1, roughness: 0.4 });
    mats.push(glass);
    const m = new THREE.Mesh(g, glass);
    m.name = "lanterns";
    group.add(m);
  }

  // The boats: a group each (the renderer bobs it on the swell, local y 0 at the sea's rest), the hull, mast and pennant
  // one merged mesh, the puffed sail its own (the renderer paints it a claiming seat's colour).
  const hullGeo = (() => {
    const half = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const g = K.merge([
      K.part(half, "#8a5634", [0, 0.034, 0], [0, 0, 0], [0.08, 0.07, 0.17]),
      K.part(K.cyl(1, 1, 18), "#f4ead0", [0, 0.034, 0], [0, 0, 0], [0.083, 0.012, 0.173]),
      K.part(K.cyl(1, 1, 18), "#5a3a24", [0, 0.042, 0], [0, 0, 0], [0.079, 0.006, 0.168]),
      K.part(K.cyl(1, 1, 18), "#c49260", [0, 0.044, 0], [0, 0, 0], [0.07, 0.003, 0.155]),
      K.part(K.cyl(1, 1, 8), "#6a4a30", [0, 0.21, 0.01], [0, 0, 0], [0.011, 0.34, 0.011]),
      K.part(K.sphere(8), "#e8c060", [0, 0.385, 0.01], [0, 0, 0], [0.014, 0.014, 0.014]),
      K.part(new THREE.ConeGeometry(1, 1, 3), "#d8392b", [0.03, 0.37, 0.01], [0, 0, -Math.PI / 2], [0.011, 0.05, 0.003]),
      K.part(K.cyl(1, 1, 8), "#6a4a30", [0, 0.07, -0.05], [Math.PI / 2, 0, 0], [0.007, 0.14, 0.007]),
      // A little cabin aft with a warm window.
      K.part(box, "#e8d6b4", [0, 0.07, -0.09], [0, 0, 0], [0.07, 0.05, 0.05]),
      K.part(box, "#b04a32", [0, 0.1, -0.09], [0, 0, 0], [0.08, 0.012, 0.06]),
      K.part(box, "#ffd27a", [0, 0.074, -0.0645], [0, 0, 0], [0.024, 0.02, 0.002]),
    ]);
    geos.push(g);
    return g;
  })();
  const sailGeo = (() => {
    const g = new THREE.PlaneGeometry(0.26, 0.26, 6, 6);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 0.26 + 0.5;
      const v = p.getY(i) / 0.26 + 0.5;
      p.setZ(i, -0.035 * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.15 + 0.85 * v)));
    }
    g.computeVertexNormals();
    geos.push(g);
    return g;
  })();
  const perch = Math.floor(r() * docks.length);
  let gullPose: ((t: number, flap: number) => void) | null = null;
  const boats = docks.map((d, i) => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(hullGeo, cm);
    hull.castShadow = true;
    // A soft glow of its own face, so the rate reads cream whichever side the key lights.
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xf4efe4, map: sailMap(d.kind), emissive: 0x6a645a, emissiveMap: sailMap(d.kind), side: THREE.DoubleSide, roughness: 0.6 });
    mats.push(sailMat);
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.name = "sail";
    sail.position.set(0, 0.23, 0.02);
    sail.castShadow = true;
    // The renderer rides the group 0.07 above the swell (as the plain boats); the hull sits in the water under that.
    const body = new THREE.Group();
    body.position.y = -0.095;
    body.add(hull, sail);
    b.add(body);
    if (i === perch) {
      const gl = K.gull(cm);
      gl.g.position.set(0, 0.405 - 0.095, 0.01);
      gl.g.scale.setScalar(0.9);
      gl.g.name = "gull";
      gullPose = gl.pose;
      b.add(gl.g);
    }
    b.scale.setScalar(BOAT_K);
    b.userData.vids = d.vids;
    b.userData.kind = d.kind;
    b.userData.good = d.kind === "any" ? null : GOOD[d.kind];
    return b;
  });

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const update = (t: number, eye: THREE.Vector3) => {
    // Each sail turns on its mast to face the eye, so its rate reads from every side of the island.
    for (const b of boats) {
      const sail = b.getObjectByName("sail");
      if (sail) sail.rotation.y = Math.atan2(eye.x - b.position.x, eye.z - b.position.z) - b.rotation.y;
    }
    if (crabMesh) {
      crabs.forEach((c, i) => {
        // Scuttle a few steps along the coast, pause, scuttle back.
        const cyc = (t * 0.35 + c.ph) % 4;
        const step = cyc < 1 ? cyc : cyc < 2 ? 1 : cyc < 3 ? 3 - cyc : 0;
        const along = (step - 0.5) * 0.12;
        const tx = c.p.mz;
        const tz = -c.p.mx;
        const moving = cyc < 1 || (cyc >= 2 && cyc < 3);
        _p.set(c.p.x + c.p.mx * c.o + tx * along, yAt(c.o) + (moving ? Math.abs(Math.sin(t * 30)) * 0.002 : 0), c.p.z + c.p.mz * c.o + tz * along);
        _q.setFromEuler(_e.set(0, Math.atan2(c.p.mx, c.p.mz) + Math.PI / 2, 0));
        crabMesh!.setMatrixAt(i, _m.compose(_p, _q, _s));
      });
      crabMesh.instanceMatrix.needsUpdate = true;
    }
    if (glass) glass.emissiveIntensity = 1.05 + 0.12 * Math.sin(t * 3.1) * Math.sin(t * 1.7);
    const g = boats[perch]?.getObjectByName("gull");
    if (g) g.rotation.y = 0.4 * Math.sin(t * 0.6) * (Math.sin(t * 0.23) > 0.3 ? 1 : 0);
    // Now and then it beats its wings, as if to balance.
    gullPose?.(t, Math.max(0, Math.sin(t * 0.5) - 0.85) / 0.15);
  };
  update(0, new THREE.Vector3(0, 10, 10));
  for (const b of boats) group.add(b);

  return {
    group,
    boats,
    update,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      crabMesh?.dispose();
    },
  };
}
