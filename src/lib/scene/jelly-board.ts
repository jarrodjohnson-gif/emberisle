import * as THREE from "three";
import { type Terrain } from "@/lib/game/types";
import { buildTile, setBoardDetail, type Tile } from "@/lib/scene/hex-jelly";

// The jelly board (#599, docs/design/hex-jelly-prompt.md): the six Hex Jelly scenes on the game board.
//
// One scene is built per kind (the owner, 2026-10-16: "shared for now") and drawn on every hex of that kind through a few
// BatchedMeshes. Every mesh of every scene goes into the batch for its material, with one instance per hex (an InstancedMesh's
// instances times the hexes), so the whole island is a few dozen draws however rich the scenes are. Each frame, every scene's
// own life runs once, and only the parts that moved are copied to their instances.
//
// A hex's own moments are per instance:
// - the roll payoff: the jelly squash and the ripple through its things, and the paying-hex glow;
// - a tap's wobble;
// - the wayfarer's dulling.
// The sprites (glows, fog and steam puffs) are camera-facing quads in two instanced draws, one added, one blended.

// The board's lattice: a hex fills about a fifth of the screen, where 18 rings are as smooth as the studio's 64.
const RINGS = 18;
// Times the scenes are sampled at to find what moves: anything whose matrix, visibility, instances or material changes.
const SAMPLES = [0.37, 1.91, 3.53, 5.2];
const ROLL_S = 2.4;
const TAP_S = 0.9;
const DULL = new THREE.Color(0.62, 0.62, 0.66);

export type JellyHex = { id: string; terrain: Terrain; x: number; z: number; y: number };
export type JellyStats = { drawCalls: number; triangles: number; kinds: number; batches: number; sprites: number };

type Batch = {
  mesh: THREE.BatchedMesh;
  // Each source geometry, prepared for this batch, and its id in it.
  geos: Map<THREE.BufferGeometry, number>;
  tris: Map<number, number>;
  rgba: boolean;
};
type Hx = {
  id: string;
  T: THREE.Matrix4;
  rollAt: number;
  tapAt: number;
  dull: number;
  dullTo: number;
  // This frame: the hex-level matrix (T times the squash) and the colour every one of its instances is multiplied by.
  M: THREE.Matrix4;
  fx: THREE.Color;
  // Its roll's phase this frame (-1 when not rolling), and whether its instances must be rewritten this frame.
  roll: number;
  dirty: boolean;
  wasActive: boolean;
  // The paying-hex glow, set by the game (0 to about 0.35), and what it was last frame.
  glow: number;
  glowWas: number;
};
type Leaf = {
  o: THREE.Mesh;
  n: number;
  moves: boolean;
  alpha: boolean;
  // The placed thing it belongs to (the ripple squashes it in turn) and that thing's delay, or the crowd's per instance.
  top: THREE.Object3D | null;
  delay: Float32Array | null;
  batch: Batch;
  // Instance ids, hex-major: ids[h * n + j].
  ids: Int32Array;
  base: THREE.Color[];
};
type SpriteLeaf = { o: THREE.Sprite; sb: SpriteBatch; first: number };
type Kind = { kind: Terrain; tile: Tile; hexes: Hx[]; leaves: Leaf[]; sprites: SpriteLeaf[] };

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _c = new THREE.Color();
const _c4 = new THREE.Vector4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _rot = new THREE.Quaternion();

// The ripple's squash at phase v (0 to 1) for a placed thing, or for one of a crowd.
const rippleQ = (roll: number, delay: number) => {
  const v = roll * 1.6 - delay;
  return v < 0 || v > 1 ? 0 : Math.sin(v * Math.PI * 3) * (1 - v) ** 1.4;
};

function visibleIn(o: THREE.Object3D, root: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

// What a material's batch is keyed by: its program and every setting the batch shares. Colour is per instance, and so is
// opacity where it changes over time. A material whose own uniforms or emissive change (the water's flow, a fire's glow) is
// its own batch and keeps its colour, so the scene's life still drives it.
function materialKey(m: THREE.Material, own: boolean, alpha: boolean) {
  const s = m as THREE.MeshStandardMaterial;
  const parts: unknown[] = [m.type, m.customProgramCacheKey(), m.transparent, m.depthWrite, m.depthTest, m.blending, m.side, m.toneMapped, alpha ? "a" : m.opacity];
  if (own) parts.push(m.uuid);
  if ("roughness" in s) parts.push(s.roughness, s.metalness, s.flatShading, s.emissive?.getHexString(), s.emissiveIntensity);
  if (s.map) parts.push(s.map.uuid);
  return parts.join("|");
}
const ownUniforms = (m: THREE.Material) => Object.values(m.userData).some((v) => v && typeof v === "object" && "value" in v);

// A source geometry made ready for a batch: the batch's attributes exactly (position, normal, colour as RGB or RGBA,
// and uv or aCrack where its material reads them).
function prepare(geo: THREE.BufferGeometry, attrs: string[], rgba: boolean, readsColor: boolean) {
  const g = new THREE.BufferGeometry();
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const n = pos.count;
  g.setAttribute("position", pos);
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  g.setAttribute("normal", geo.getAttribute("normal"));
  const src = readsColor ? (geo.getAttribute("color") as THREE.BufferAttribute | undefined) : undefined;
  const k = rgba ? 4 : 3;
  const col = new Float32Array(n * k);
  for (let i = 0; i < n; i++) {
    col[i * k] = src ? src.getX(i) : 1;
    col[i * k + 1] = src ? src.getY(i) : 1;
    col[i * k + 2] = src ? src.getZ(i) : 1;
    if (rgba) col[i * k + 3] = src && src.itemSize === 4 ? src.getW(i) : 1;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, k));
  for (const a of attrs) {
    const at = geo.getAttribute(a);
    g.setAttribute(a, at ?? new THREE.BufferAttribute(new Float32Array(n * (a === "uv" ? 2 : 1)), a === "uv" ? 2 : 1));
  }
  if (geo.index) g.setIndex(geo.index);
  return g;
}

// The camera-facing quads: each instance's matrix places and sizes it (the sprite's world matrix), its colour and alpha are
// its own.
class SpriteBatch {
  mesh: THREE.InstancedMesh;
  color: THREE.InstancedBufferAttribute;
  count = 0;
  constructor(map: THREE.Texture | null, additive: boolean, toneMapped: boolean, max: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.color.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aColor", this.color);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map } }]),
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        varying vec4 vC;
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vC = aColor;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
          vec2 sc = vec2( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ) );
          mvPosition.xy += position.xy * sc;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec4 vC;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D( map, vUv );
          gl_FragColor = vec4( t.rgb * vC.rgb, t.a * vC.a );
          ${toneMapped ? "#include <tonemapping_fragment>" : ""}
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
}

export class JellyBoard {
  readonly group = new THREE.Group();
  private kinds: Kind[] = [];
  private batches = new Map<string, Batch>();
  private sprites: SpriteBatch[] = [];
  private byHex = new Map<string, { k: Kind; h: Hx }>();
  private t = 0;

  private constructor() {
    this.group.name = "jelly-board";
  }

  // Build the scenes for these hexes, one per kind from its seed, and batch them; deterministic for the same hexes and seeds.
  // `pause` runs between kinds (a scene takes about a tenth of a second to build), so no one task holds the page for long; it
  // answers false when the board is no longer wanted, and the build stops there.
  static async create(hexes: JellyHex[], seedOf: (kind: Terrain) => number, pause: () => Promise<boolean>) {
    const b = new JellyBoard();
    for (const kind of [...new Set(hexes.map((h) => h.terrain))]) {
      let tile: Tile;
      setBoardDetail(true);
      try {
        tile = buildTile(kind, seedOf(kind), RINGS, true);
      } finally {
        setBoardDetail(false);
      }
      const hx = hexes
        .filter((h) => h.terrain === kind)
        .map((h): Hx => ({ id: h.id, T: new THREE.Matrix4().makeTranslation(h.x, h.y, h.z), rollAt: -Infinity, tapAt: -Infinity, dull: 0, dullTo: 0, M: new THREE.Matrix4(), fx: new THREE.Color(1, 1, 1), roll: -1, dirty: true, wasActive: false, glow: 0, glowWas: 0 }));
      b.kinds.push({ kind, tile, hexes: hx, leaves: [], sprites: [] });
      if (!(await pause())) {
        b.dispose();
        return null;
      }
    }
    for (const k of b.kinds) for (const h of k.hexes) b.byHex.set(h.id, { k, h });
    b.batch();
    b.update(0, true);
    return b;
  }

  private batch() {
    type Plan = { k: Kind; o: THREE.Mesh; moves: boolean; alpha: boolean; key: string; own: boolean; attrs: string[]; rgba: boolean };
    const plans: Plan[] = [];
    const spritePlans: { k: Kind; o: THREE.Sprite }[] = [];
    for (const k of this.kinds) {
      const root = k.tile.group;
      const leaves: THREE.Mesh[] = [];
      const sprites: THREE.Sprite[] = [];
      root.traverse((o) => {
        if ((o as THREE.Sprite).isSprite) sprites.push(o as THREE.Sprite);
        else if ((o as THREE.Mesh).isMesh) leaves.push(o as THREE.Mesh);
      });
      // Sample the scene's life to find what moves.
      const snap = (o: THREE.Mesh) => {
        const m = o.material as THREE.MeshStandardMaterial;
        const im = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).instanceMatrix.version : 0;
        return { w: o.matrixWorld.elements.join(), v: visibleIn(o, root), im, op: m.opacity, mat: `${m.emissiveIntensity}|${m.color?.getHexString()}|${m.emissive?.getHexString()}` };
      };
      const seen: ReturnType<typeof snap>[][] = leaves.map(() => []);
      for (const t of SAMPLES) {
        k.tile.update(t);
        root.updateMatrixWorld(true);
        leaves.forEach((o, i) => seen[i]!.push(snap(o)));
      }
      leaves.forEach((o, i) => {
        const s = seen[i]!;
        const differs = (f: (x: (typeof s)[0]) => unknown) => s.some((x) => f(x) !== f(s[0]!));
        const moves = differs((x) => x.w) || differs((x) => x.v) || differs((x) => x.im);
        const mat = o.material as THREE.Material;
        const alpha = differs((x) => x.op) && mat.transparent;
        const own = differs((x) => x.mat) || ownUniforms(mat);
        // Never drawn: hidden at every sample and not moving.
        if (!moves && !s[0]!.v) return;
        const geo = o.geometry;
        const attrs = [geo.getAttribute("aCrack") ? "aCrack" : "", mat.customProgramCacheKey().startsWith("jelly-water") ? "uv" : ""].filter(Boolean);
        const key = `${materialKey(mat, own, alpha)}|${attrs.join(",")}|${geo.index ? "i" : "n"}|${alpha ? "rgba" : "rgb"}|${o.renderOrder}|${o.castShadow}|${o.receiveShadow}`;
        plans.push({ k, o, moves, alpha, key, own, attrs, rgba: alpha });
      });
      for (const o of sprites) spritePlans.push({ k, o });
    }

    // Size each batch, then fill it.
    const sizes = new Map<string, { inst: number; verts: number; idx: number; geos: Set<THREE.BufferGeometry> }>();
    for (const p of plans) {
      const z = sizes.get(p.key) ?? { inst: 0, verts: 0, idx: 0, geos: new Set() };
      const n = (p.o as THREE.InstancedMesh).isInstancedMesh ? (p.o as THREE.InstancedMesh).count : 1;
      z.inst += n * p.k.hexes.length;
      if (!z.geos.has(p.o.geometry)) {
        z.geos.add(p.o.geometry);
        z.verts += p.o.geometry.getAttribute("position").count;
        z.idx += p.o.geometry.index?.count ?? 0;
      }
      sizes.set(p.key, z);
    }
    for (const p of plans) {
      let b = this.batches.get(p.key);
      if (!b) {
        const z = sizes.get(p.key)!;
        const src = p.o.material as THREE.MeshStandardMaterial;
        // The batch draws with the first source's own material: its program and uniforms are the scene's. Colour comes per
        // instance (white here) unless it is the material's own batch; opacity per instance where it changes.
        let mat: THREE.Material = src;
        if (p.rgba) {
          // Opacity comes per instance: a copy of the material at full opacity, reading the RGBA colour.
          const c = src.clone();
          c.onBeforeCompile = src.onBeforeCompile;
          c.customProgramCacheKey = src.customProgramCacheKey;
          c.opacity = 1;
          c.vertexColors = true;
          mat = c;
        }
        const mesh = new THREE.BatchedMesh(z.inst, z.verts, Math.max(z.idx, 1), mat);
        mesh.frustumCulled = false;
        mesh.perObjectFrustumCulled = false;
        mesh.sortObjects = mat.transparent;
        mesh.castShadow = p.o.castShadow;
        mesh.receiveShadow = p.o.receiveShadow;
        mesh.renderOrder = p.o.renderOrder;
        b = { mesh, geos: new Map(), tris: new Map(), rgba: p.rgba };
        this.batches.set(p.key, b);
        this.group.add(mesh);
      }
      let gid = b.geos.get(p.o.geometry);
      if (gid === undefined) {
        const g = prepare(p.o.geometry, p.attrs, p.rgba, (p.o.material as THREE.Material & { vertexColors: boolean }).vertexColors);
        gid = b.mesh.addGeometry(g);
        b.geos.set(p.o.geometry, gid);
        b.tris.set(gid, (g.index ? g.index.count : g.getAttribute("position").count) / 3);
      }
      const im = p.o as THREE.InstancedMesh;
      const n = im.isInstancedMesh ? im.count : 1;
      const ids = new Int32Array(n * p.k.hexes.length);
      for (let i = 0; i < ids.length; i++) ids[i] = b.mesh.addInstance(gid);
      // The base colour per source instance: the material's colour (unless its own batch), times the instance's colour.
      const mc = p.own ? new THREE.Color(1, 1, 1) : ((p.o.material as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color(1, 1, 1));
      const base = Array.from({ length: n }, (_, j) => {
        const c = mc.clone();
        if (im.isInstancedMesh && im.instanceColor) c.multiply(im.getColorAt(j, _c));
        return c;
      });
      // The placed thing it belongs to: the scene group's child it sits under (the studio's own ripple rule).
      const props = p.k.tile.group.children.find((c) => c.type === "Group");
      let top: THREE.Object3D | null = null;
      for (let q: THREE.Object3D | null = p.o; q && q.parent; q = q.parent) if (q.parent === props) top = q;
      let delay: Float32Array | null = null;
      if (im.isInstancedMesh) {
        delay = new Float32Array(n);
        for (let j = 0; j < n; j++) {
          im.getMatrixAt(j, _m);
          _p.setFromMatrixPosition(_m);
          delay[j] = (Math.max(0.3, Math.hypot(_p.x, _p.z)) - 0.3) * 0.5;
        }
        top = null;
      } else if (top) {
        const d = Math.hypot(top.position.x, top.position.z);
        if (top.userData.loose || d < 0.3) top = null;
        else delay = Float32Array.of((d - 0.3) * 0.5);
      }
      p.k.leaves.push({ o: p.o, n, moves: p.moves, alpha: p.alpha, top, delay, batch: b, ids, base });
    }
    // Shared materials go white once every source's colour is read; the batch colours each instance.
    for (const p of plans) if (!p.own) (p.o.material as THREE.MeshStandardMaterial).color?.setRGB(1, 1, 1);

    // The sprites: one draw for the added glows, one for the blended puffs.
    const groups = new Map<string, { list: typeof spritePlans; map: THREE.Texture | null; add: boolean; tm: boolean }>();
    for (const sp of spritePlans) {
      const m = sp.o.material;
      const add = m.blending === THREE.AdditiveBlending;
      const key = `${m.map?.uuid}|${add}|${m.toneMapped}`;
      const g = groups.get(key) ?? { list: [], map: m.map, add, tm: m.toneMapped };
      g.list.push(sp);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const total = g.list.reduce((a, sp) => a + sp.k.hexes.length, 0);
      const sb = new SpriteBatch(g.map, g.add, g.tm, total);
      for (const sp of g.list) {
        sp.k.sprites.push({ o: sp.o, sb, first: sb.count });
        sb.count += sp.k.hexes.length;
      }
      this.sprites.push(sb);
      this.group.add(sb.mesh);
    }
  }

  // The paying-hex glow on a hex this frame (the game times it: docs/design/dice.md).
  glow(id: string, level: number) {
    const e = this.byHex.get(id);
    if (e) e.h.glow = level;
  }

  // The roll payoff's jelly squash and ripple on these hexes, starting now.
  roll(ids: string[]) {
    for (const id of ids) {
      const e = this.byHex.get(id);
      if (e) e.h.rollAt = this.t;
    }
  }

  tap(id: string) {
    const e = this.byHex.get(id);
    if (e) e.h.tapAt = this.t;
  }

  // The wayfarer stands on this hex (or none): it dulls, the others clear.
  robber(id: string | null) {
    for (const { h } of this.byHex.values()) h.dullTo = h.id === id ? 1 : 0;
  }

  // Something is still playing out (a roll, a tap, a dulling): the loop should draw at full rate.
  busy() {
    for (const { h } of this.byHex.values()) if (this.t - h.rollAt < ROLL_S || this.t - h.tapAt < TAP_S || Math.abs(h.dull - h.dullTo) > 1e-3 || h.glow > 0) return true;
    return false;
  }

  // Advance every scene to time t (seconds) and copy what moved to its instances. `all` rewrites every instance; `snap` lands
  // the dulling at once (reduced motion).
  update(t: number, all = false, snap = false) {
    const dt = Math.max(0, t - this.t);
    this.t = t;
    for (const k of this.kinds) {
      k.tile.update(t);
      k.tile.group.updateMatrixWorld(true);
      // The hex level: its squash (the roll's jelly wobble, a tap's smaller one) and its colour (flash, dulling).
      for (const h of k.hexes) {
        const ur = (t - h.rollAt) / ROLL_S;
        h.roll = ur >= 0 && ur <= 1 && h.dull < 0.5 ? ur : -1;
        const ut = (t - h.tapAt) / TAP_S;
        const kr = h.roll >= 0 ? Math.sin(h.roll * Math.PI * 4) * (1 - h.roll) ** 1.5 : 0;
        const kt = ut >= 0 && ut <= 1 ? 0.5 * Math.sin(ut * Math.PI * 3) * (1 - ut) ** 1.5 : 0;
        const kk = kr + kt;
        const was = h.dull;
        h.dull = snap ? h.dullTo : h.dull + (h.dullTo - h.dull) * Math.min(1, dt * 3);
        if (Math.abs(h.dull - h.dullTo) < 1e-3) h.dull = h.dullTo;
        const active = kk !== 0 || h.glow !== h.glowWas || h.dull !== was;
        h.glowWas = h.glow;
        // Rewritten while anything plays out, and once more after, to land back on rest.
        h.dirty = all || active || h.wasActive;
        h.wasActive = active;
        h.M.copy(h.T).multiply(_m.makeScale(1 - 0.03 * kk, 1 + 0.07 * kk, 1 - 0.03 * kk));
        h.fx.setRGB(1, 1, 1).lerp(DULL, h.dull);
        // The glow warms the hex toward its resource's light (the cap glow's 0.35 peak is about +60 % red).
        h.fx.r *= 1 + h.glow * 1.7;
        h.fx.g *= 1 + h.glow * 1.25;
        h.fx.b *= 1 + h.glow * 0.35;
      }
      for (const L of k.leaves) this.writeLeaf(k, L, all);
      for (const sp of k.sprites) this.writeSprite(k, sp);
    }
    for (const sb of this.sprites) {
      sb.mesh.instanceMatrix.needsUpdate = true;
      sb.color.needsUpdate = true;
    }
  }

  private writeLeaf(k: Kind, L: Leaf, all: boolean) {
    const root = k.tile.group;
    const mesh = L.batch.mesh;
    const im = L.o as THREE.InstancedMesh;
    const vis = visibleIn(L.o, root);
    const opacity = (L.o.material as THREE.Material).opacity;
    for (let hi = 0; hi < k.hexes.length; hi++) {
      const h = k.hexes[hi]!;
      if (!all && !L.moves && !L.alpha && !h.dirty) continue;
      // The ripple: a placed thing squashes about its own place, a crowd's instance about its own.
      let R: THREE.Matrix4 | null = null;
      if (h.roll >= 0 && L.top && L.delay) {
        const q = rippleQ(h.roll, L.delay[0]!);
        if (q) {
          _inv.copy(L.top.matrixWorld).invert();
          R = _q.copy(L.top.matrixWorld).multiply(_m2.makeScale(1 - 0.12 * q, 1 + 0.22 * q, 1 - 0.12 * q)).multiply(_inv);
        }
      }
      for (let j = 0; j < L.n; j++) {
        const id = L.ids[hi * L.n + j]!;
        if (!vis) {
          mesh.setVisibleAt(id, false);
          continue;
        }
        mesh.setVisibleAt(id, true);
        _m.copy(h.M);
        if (R) _m.multiply(R);
        _m.multiply(L.o.matrixWorld);
        if (im.isInstancedMesh) {
          im.getMatrixAt(j, _m2);
          _m.multiply(_m2);
          if (h.roll >= 0 && L.delay) {
            const q = rippleQ(h.roll, L.delay[j]!);
            if (q) _m.multiply(_m2.makeScale(1 - 0.1 * q, 1 + 0.18 * q, 1 - 0.1 * q));
          }
        }
        mesh.setMatrixAt(id, _m);
        const c = L.base[j]!;
        if (L.batch.rgba) mesh.setColorAt(id, _c4.set(c.r * h.fx.r, c.g * h.fx.g, c.b * h.fx.b, opacity));
        else mesh.setColorAt(id, _c.setRGB(c.r * h.fx.r, c.g * h.fx.g, c.b * h.fx.b));
      }
    }
  }

  private writeSprite(k: Kind, sp: SpriteLeaf) {
    const m = sp.o.material;
    const vis = visibleIn(sp.o, k.tile.group) && m.opacity > 0.002;
    const col = sp.sb.color.array as Float32Array;
    for (let hi = 0; hi < k.hexes.length; hi++) {
      const h = k.hexes[hi]!;
      const i = sp.first + hi;
      if (!vis) {
        col[i * 4 + 3] = 0;
        sp.sb.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      sp.o.matrixWorld.decompose(_p, _rot, _s);
      _m.copy(h.M).multiply(sp.o.matrixWorld);
      _p.setFromMatrixPosition(_m);
      _m.compose(_p, _rot.identity(), _s);
      sp.sb.mesh.setMatrixAt(i, _m);
      col[i * 4] = m.color.r * h.fx.r;
      col[i * 4 + 1] = m.color.g * h.fx.g;
      col[i * 4 + 2] = m.color.b * h.fx.b;
      col[i * 4 + 3] = m.opacity;
    }
  }

  // For the proofs. The ground's height (world y) at a point of a hex, from the hex's centre.
  groundAt(id: string, dx: number, dz: number) {
    const e = this.byHex.get(id);
    return e ? e.h.T.elements[13]! + e.k.tile.ground(dx, dz) : NaN;
  }

  // For the proofs: per kind, how near to the hex's centre (horizontally) anything on it comes now, by its bounding sphere,
  // and what that is. The block itself, water, fog and glows are not things standing on the hex.
  clearance() {
    const out: Record<string, { min: number; what: string }> = {};
    const sph = new THREE.Sphere();
    for (const k of this.kinds) {
      let min = Infinity;
      let what = "";
      const [top, side] = k.tile.group.children;
      for (const L of k.leaves) {
        const mat = L.o.material as THREE.Material;
        if (L.o === top || L.o === side || mat.transparent || !visibleIn(L.o, k.tile.group)) continue;
        const g = L.o.geometry;
        g.boundingSphere ?? g.computeBoundingSphere();
        const im = L.o as THREE.InstancedMesh;
        for (let j = 0; j < L.n; j++) {
          sph.copy(g.boundingSphere!);
          _m.copy(L.o.matrixWorld);
          if (im.isInstancedMesh) _m.multiply(im.getMatrixAt(j, _m2));
          sph.applyMatrix4(_m);
          const d = Math.hypot(sph.center.x, sph.center.z) - sph.radius;
          if (d < min) {
            min = d;
            let ref = "";
            for (let q: THREE.Object3D | null = L.o; q && !ref; q = q.parent) ref = (q.userData.ref as string) ?? "";
            what = ref || mat.customProgramCacheKey();
          }
        }
      }
      out[k.kind] = { min, what };
    }
    return out;
  }

  stats(): JellyStats {
    let triangles = 0;
    for (const b of this.batches.values()) {
      const counts = new Map<number, number>();
      for (const k of this.kinds) for (const L of k.leaves) if (L.batch === b) counts.set(b.geos.get(L.o.geometry)!, (counts.get(b.geos.get(L.o.geometry)!) ?? 0) + L.ids.length);
      for (const [gid, n] of counts) triangles += b.tris.get(gid)! * n;
    }
    for (const sb of this.sprites) triangles += 2 * sb.count;
    return { drawCalls: this.batches.size + this.sprites.length, triangles: Math.round(triangles), kinds: this.kinds.length, batches: this.batches.size, sprites: this.sprites.length };
  }

  dispose() {
    for (const b of this.batches.values()) {
      b.mesh.dispose();
      (b.mesh.material as THREE.Material).dispose();
    }
    for (const sb of this.sprites) {
      sb.mesh.geometry.dispose();
      (sb.mesh.material as THREE.Material).dispose();
      sb.mesh.dispose();
    }
    for (const k of this.kinds)
      k.tile.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
    this.group.clear();
    this.batches.clear();
    this.sprites = [];
    this.kinds = [];
    this.byHex.clear();
  }
}
