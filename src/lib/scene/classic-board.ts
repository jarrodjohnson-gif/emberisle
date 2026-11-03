import * as THREE from "three";
import type { HexCell } from "@/lib/game/types";
import { HEX_SIZE } from "@/lib/game/hex";
import { BLOCK_H } from "@/lib/scene/jelly-dims";
import type { LandAppearance, LandHex, LandQuality, LandStats, VisibilityContext } from "@/lib/scene/land-appearance";
import { PropKit, coastOf, decorate, disposeTerrainCache, sculptHex, terrainCache, tileMaterial, type Life, type Sculpt, type TerrainCache } from "@/lib/scene/terrain-classic";
import { hashStr, mulberry32 } from "@/lib/utils";

// The Classic board (#641, #758; docs/design/classic-board.md): the sculpted terrain archived in legacy/terrain-v1 behind the
// land appearance contract. It builds the ground of every hex, and on a full board the props on it, from a seed; it owns its
// geometry, materials, caches and animation, and touches nothing of the renderer's.
//
// Quality is the lattice resolution and the props. Full is the archive's 18 rings and every prop; lite keeps the ground, its
// landforms and its strata at 12 rings (the jelly board's own lattice) and draws no props. 12 is the coarsest lattice whose clay
// pit apron, which grows with the lattice step, still lies inside the tile's top (scripts/classic-builder-prove.mjs sweeps it).
export const CLASSIC_RINGS: Record<LandQuality, number> = { full: 18, lite: 12 };

// The tile is the archive's size (a hair under the hex's corner radius, so neighbours leave their seam); its top stands the block
// height above the hex's base, the same on every terrain.
const TILE_SIZE = HEX_SIZE * 0.995;
const ROLL_S = 0.6;
const TAP_S = 0.22;
// The wayfarer's shade on his hex, as the jelly board dulls it: darker and cooler, as if a cloud stood over it.
const DULL = new THREE.Color(0.46, 0.48, 0.58);
// A tall prop standing between a token and the diorama camera (in front of it within SHADE_DEPTH, within SHADE_SIDE of the
// line) is shrunk until the sight line from the eye to the glyph's lowest row (plus SHADE_MARGIN) clears it, never below
// SHADE_MIN of its size. Props in the zone that already clear it stay full size.
const SHADE_DEPTH = 1.7;
const SHADE_SIDE = 0.55;
const SHADE_MARGIN = 0.05;
const SHADE_MIN = 0.3;

type Hex = {
  id: string;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  sc: Sculpt;
  rollAt: number;
  tapAt: number;
  dull: number;
  dullTo: number;
  glow: number;
};
type Tall = { o: THREE.Object3D; height: number };
type Home = { x: number; y: number; z: number; ry: number };
type Seen = { diorama: boolean; sx: number; sz: number; cam: THREE.Vector3; tokens: Float32Array };

const swing = (u: number, cycles: number) => Math.sin(u * Math.PI * cycles) * (1 - u) ** 1.5;

export type ClassicStats = LandStats & { rings: number; hexes: number };

export class ClassicBoard implements LandAppearance {
  readonly group = new THREE.Group();
  private living = new THREE.Group();
  private hexes = new Map<string, Hex>();
  private cache: TerrainCache = terrainCache();
  private kit: PropKit | null = null;
  private life: Life = { sheep: [], oreWork: [], farmWork: [], tall: [] };
  private tall: Tall[] = [];
  private homes = new Map<THREE.Object3D, Home>();
  private rng: () => number;
  private t = 0;
  private ambient = 0;
  private seen: Seen | null = null;
  private disposed = false;

  private constructor(private quality: LandQuality, seed: number) {
    this.group.name = "classic-board";
    this.living.name = "classic-props";
    this.group.add(this.living);
    // The sheep's wandering draws from this stream, never the game's: the same seed walks the same flock.
    this.rng = mulberry32(hashStr(`${seed}|classic-life`));
  }

  // Build the land for these hexes from a seed, deterministic for the same hexes, seed and quality. `pause` runs between hexes
  // (a hex takes a few milliseconds), so no one task holds the page for long; it answers false when the board is no longer
  // wanted, and the build stops there and frees what it made. A build that throws leaves nothing behind either.
  static async create(hexes: readonly LandHex[], seed: number, pause: () => Promise<boolean>, quality: LandQuality = "full"): Promise<ClassicBoard | null> {
    const b = new ClassicBoard(quality, seed);
    try {
      if (await b.build(hexes, seed, pause)) return b;
    } catch (e) {
      b.dispose();
      throw e;
    }
    b.dispose();
    return null;
  }

  private async build(hexes: readonly LandHex[], seed: number, pause: () => Promise<boolean>) {
    // A breath after the chunk itself loads and runs.
    if (!(await pause())) return false;
    // A missing neighbour is the sea: the coast is found from the canonical axial coordinates of the hexes given.
    const land = new Set(hexes.map((h) => `${h.q},${h.r}`));
    const full = this.quality === "full";
    const kit = full ? (this.kit = new PropKit(this.living, this.cache)) : null;
    const decorations: (() => void)[] = [];
    for (const h of hexes) {
      const cell: Pick<HexCell, "id" | "terrain"> = { id: h.id, terrain: h.terrain };
      const rng = mulberry32(hashStr(`${seed}|${h.id}|${h.terrain}`));
      const coast = coastOf(h, (q, r) => land.has(`${q},${r}`));
      const sc = sculptHex(this.cache, cell, TILE_SIZE, BLOCK_H, h.y, rng, coast, CLASSIC_RINGS[this.quality]);
      const mesh = new THREE.Mesh(sc.geo, tileMaterial(h.terrain));
      mesh.name = `classic-hex-${h.id}`;
      mesh.position.set(h.x, h.y, h.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.hexes.set(h.id, { id: h.id, mesh, sc, rollAt: -Infinity, tapAt: -Infinity, dull: 0, dullTo: 0, glow: 0 });
      if (kit) decorations.push(() => decorate(kit, this.life, cell, h.x, h.z, sc, rng));
      if (!(await pause())) return false;
    }
    // The props are the heavier half: a hex at a time, then merged.
    for (const place of decorations) {
      place();
      if (!(await pause())) return false;
    }
    if (kit) {
      kit.finish();
      for (const o of this.life.tall) {
        const g = (o as THREE.Mesh).geometry;
        g.boundingBox ?? g.computeBoundingBox();
        this.tall.push({ o, height: g.boundingBox!.max.y * (o.userData.base as THREE.Vector3).y });
      }
      for (const s of this.life.sheep) this.homes.set(s.g, { x: s.g.position.x, y: s.g.position.y, z: s.g.position.z, ry: s.g.rotation.y });
    }
    this.update(0, true, true);
    return !this.disposed;
  }

  // The paying-hex glow on a hex this frame (the game times it: docs/design/dice.md).
  glow(id: string, level: number) {
    const h = this.hexes.get(id);
    if (h) h.glow = level;
  }

  roll(ids: string[]) {
    for (const id of ids) {
      const h = this.hexes.get(id);
      if (h) h.rollAt = this.t;
    }
  }

  tap(id: string) {
    const h = this.hexes.get(id);
    if (h) h.tapAt = this.t;
  }

  // The wayfarer stands on this hex (or none): it dulls, the others clear.
  robber(id: string | null) {
    for (const h of this.hexes.values()) h.dullTo = h.id === id ? 1 : 0;
  }

  // Something is still playing out (a roll, a tap, a dulling, a glow): the loop should draw at full rate. The flock and the
  // breeze do not count: they play at the idle rate.
  busy() {
    for (const h of this.hexes.values()) if (this.t - h.rollAt < ROLL_S || this.t - h.tapAt < TAP_S || Math.abs(h.dull - h.dullTo) > 1e-3 || h.glow > 0) return true;
    return false;
  }

  // Advance to time t (seconds). `all` rewrites every pose; `snap` lands the dulling and the swell at once and holds the
  // flock, the workers and the breeze at rest (reduced motion).
  update(t: number, all = false, snap = false) {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, t - this.t));
    this.t = t;
    for (const h of this.hexes.values()) {
      const ur = (t - h.rollAt) / ROLL_S;
      const ut = (t - h.tapAt) / TAP_S;
      const k = snap ? 0 : (ur >= 0 && ur <= 1 ? 0.012 * swing(ur, 4) : 0) + (ut >= 0 && ut <= 1 ? 0.03 * Math.sin(Math.PI * (1 - (1 - ut) ** 2)) : 0);
      h.mesh.scale.setScalar(1 + k);
      const was = h.dull;
      h.dull = snap ? h.dullTo : h.dull + (h.dullTo - h.dull) * Math.min(1, dt * 3);
      if (Math.abs(h.dull - h.dullTo) < 1e-3) h.dull = h.dullTo;
      if (all || h.dull !== was) h.mesh.material.color.setRGB(1, 1, 1).lerp(DULL, h.dull);
      h.mesh.material.emissiveIntensity = h.glow;
    }
    if (!this.kit) return;
    if (!snap) this.ambient += dt;
    const amb = snap ? 0 : this.ambient;
    // The breeze: pines and wheat sway, each by its own amount (radians).
    for (const { o } of this.tall) if (o.userData.sway) o.rotation.z = snap ? 0 : Math.sin(t * 1.05 + o.position.x * 2) * (o.userData.sway as number);
    for (const s of this.life.sheep) {
      if (snap) {
        const home = this.homes.get(s.g)!;
        s.g.position.set(home.x, home.y, home.z);
        s.g.rotation.set(0, home.ry, 0);
        s.tx = home.x;
        s.tz = home.z;
        s.graze = 0;
        continue;
      }
      s.wait -= dt;
      if (s.wait <= 0) {
        // A step of at most 0.3 rad around the ring keeps the straight walk to the target off the token.
        const a = Math.atan2(s.tz - s.oz, s.tx - s.ox) + (this.rng() - 0.5) * 0.6;
        const r = 0.54 + this.rng() * 0.2;
        s.tx = s.ox + Math.cos(a) * r;
        s.tz = s.oz + Math.sin(a) * r;
        s.wait = 1.8 + this.rng() * 2.8;
        s.graze = this.rng() > 0.4 ? 1.1 : 0;
      }
      s.g.position.x += (s.tx - s.g.position.x) * (1 - Math.exp(-dt * 1.6));
      s.g.position.z += (s.tz - s.g.position.z) * (1 - Math.exp(-dt * 1.6));
      s.g.position.y = s.ground(s.g.position.x, s.g.position.z) + 0.1;
      const heading = Math.atan2(s.tx - s.g.position.x, s.tz - s.g.position.z);
      const turn = Math.atan2(Math.sin(heading - s.g.rotation.y), Math.cos(heading - s.g.rotation.y));
      s.g.rotation.y += turn * (1 - Math.exp(-dt * 3));
      s.g.rotation.x = s.graze > 0 ? 0.32 : 0;
      if (s.graze > 0) s.graze -= dt;
    }
    for (const work of this.life.oreWork) {
      const phase = amb + work.phase;
      const roll = 0.05 * Math.sin((phase * Math.PI) / 3);
      work.cart.position.x = work.x + work.dx * roll;
      work.cart.position.z = work.z + work.dz * roll;
      work.cart.rotation.z = 0.035 * Math.sin(phase * 2.4);
      work.cart.rotation.x = 0.018 * Math.sin(phase * 1.6);
      work.arm.rotation.z = 0.22 * Math.sin((phase * Math.PI) / 2);
    }
    for (const work of this.life.farmWork) {
      const phase = amb + work.phase;
      const cycle = phase % 18;
      const walking = cycle > 10 && cycle < 16;
      const step = walking ? Math.sin(((cycle - 10) * Math.PI) / 6) * 0.1 : 0;
      const [bx, bz] = [work.x + Math.cos(work.angle) * step, work.z + Math.sin(work.angle) * step];
      work.body.position.set(bx, work.ground(bx, bz) + (walking ? Math.abs(Math.sin(phase * 6)) * 0.006 : 0), bz);
      work.body.rotation.y = Math.PI / 2 - work.angle + (walking && cycle > 13 ? Math.PI : 0);
      work.arm.position.set(work.body.position.x, work.body.position.y + 0.13, work.body.position.z);
      work.arm.rotation.set(0, work.body.rotation.y, cycle < 8 ? -0.15 + Math.sin(phase * 2.2) * 0.28 : 0);
    }
    this.shade(true);
  }

  // The camera and the tokens, copied: the tall props in front of a token shrink until its numeral is in sight. Settled here, in
  // the call, so the same frame publishes the token pose with the adjustment already in the instances.
  setVisibilityContext(context: VisibilityContext) {
    if (this.disposed) return;
    const tokens = new Float32Array(context.tokens.length * 4);
    context.tokens.forEach((k, i) => tokens.set([k.x, k.y, k.z, k.glyphBottom], i * 4));
    this.seen = { diorama: context.view === "diorama", sx: Math.sin(context.azimuth), sz: Math.cos(context.azimuth), cam: new THREE.Vector3(context.camera.x, context.camera.y, context.camera.z), tokens };
    this.shade(false);
  }

  // Scales each tall prop to the sight lines in `seen`, and uploads the instances when anything moved (`always`: after the poses
  // moved, which the upload follows regardless).
  private shade(always: boolean) {
    if (!this.kit) return;
    const v = this.seen;
    let moved = false;
    for (const { o, height } of this.tall) {
      const base = o.userData.base as THREE.Vector3;
      let k = 1;
      if (v?.diorama) {
        for (let i = 0; i < v.tokens.length; i += 4) {
          const [tx, ty, tz, bottom] = [v.tokens[i]!, v.tokens[i + 1]!, v.tokens[i + 2]!, v.tokens[i + 3]!];
          const [dx, dz] = [o.position.x - tx, o.position.z - tz];
          const along = dx * v.sx + dz * v.sz;
          if (along <= 0 || along >= SHADE_DEPTH || Math.abs(dx * v.sz - dz * v.sx) >= SHADE_SIDE) continue;
          // The sight line's height over the prop's foot where it passes the prop.
          const rise = (v.cam.y - ty) / Math.hypot(v.cam.x - tx, v.cam.z - tz);
          const clear = bottom - o.position.y + along * rise - SHADE_MARGIN;
          k = Math.min(k, Math.max(SHADE_MIN, clear / height));
        }
      }
      if (o.scale.x !== base.x * k || o.scale.y !== base.y * k || o.scale.z !== base.z * k) {
        o.scale.copy(base).multiplyScalar(k);
        moved = true;
      }
    }
    if (moved || always) this.kit.sync();
  }

  // The world height of the ground at a point of a hex, from its centre.
  groundAt(id: string, dx: number, dz: number) {
    const h = this.hexes.get(id);
    return h ? h.sc.ground(dx, dz) : NaN;
  }

  stats(): ClassicStats {
    const meshes: THREE.Mesh[] = [];
    this.group.traverse((o) => (o as THREE.Mesh).isMesh && o.visible && meshes.push(o as THREE.Mesh));
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    let triangles = 0;
    for (const m of meshes) {
      geometries.add(m.geometry);
      materials.add(m.material as THREE.Material);
      const g = m.geometry;
      triangles += (g.index ? g.index.count : g.getAttribute("position").count) / 3 * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    }
    // The proxies are invisible and draw nothing, but they hold the shapes, which are owned all the same.
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !o.visible) geometries.add(m.geometry);
    });
    return {
      quality: this.quality,
      drawCalls: meshes.length,
      triangles: Math.round(triangles),
      objects: { meshes: meshes.length, geometries: geometries.size, materials: materials.size },
      rings: CLASSIC_RINGS[this.quality],
      hexes: this.hexes.size,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const h of this.hexes.values()) {
      h.mesh.geometry.dispose();
      h.mesh.material.dispose();
    }
    this.kit?.dispose();
    disposeTerrainCache(this.cache);
    this.group.clear();
    this.hexes.clear();
    this.tall = [];
    this.homes.clear();
    this.life = { sheep: [], oreWork: [], farmWork: [], tall: [] };
    this.seen = null;
    this.kit = null;
  }
}
