import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { HEX_SIZE, SQRT3 } from "@/lib/game/hex";

// The glTF asset pipeline (docs/design/assets.md, epic #599). Import this module with import(), never statically: it carries
// three's glTF, Draco and meshopt loaders, which the first paint does not need.

/** A kit is authored with a tile 1 unit flat-to-flat; multiply by this to get the island's hex pitch in world units. */
export const KIT_TO_WORLD = HEX_SIZE * SQRT3;
export const MAX_TEXTURE_PX = 1024;

export type KitPart = { name: string; geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial };
export type Kit = { url: string; parts: Map<string, KitPart>; dispose(): void };
export type PartStat = { name: string; triangles: number; drawCalls: 1 };
export type KitStats = { parts: PartStat[]; triangles: number; drawCalls: number; materials: number; textureBytes: number };

const isTile = (name: string) => name.startsWith("tile_");

function loader() {
  const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  const gltf = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  return { gltf, draco };
}

function shrink(tex: THREE.Texture) {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | null;
  if (!img || Math.max(img.width, img.height) <= MAX_TEXTURE_PX) return;
  const k = MAX_TEXTURE_PX / Math.max(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * k));
  canvas.height = Math.max(1, Math.round(img.height * k));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  tex.image = canvas;
  tex.needsUpdate = true;
}

function standard(src: THREE.Material, hasColor: boolean, cache: Map<THREE.Material, THREE.MeshStandardMaterial>) {
  const hit = cache.get(src);
  if (hit) return hit;
  const s = src as Partial<THREE.MeshStandardMaterial>;
  const m = src instanceof THREE.MeshStandardMaterial ? src : new THREE.MeshStandardMaterial({
    name: src.name,
    color: s.color ?? 0xffffff,
    map: s.map ?? null,
    roughness: s.roughness ?? 0.85,
    metalness: s.metalness ?? 0,
  });
  m.vertexColors = hasColor;
  for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap]) if (t) shrink(t);
  cache.set(src, m);
  return m;
}

/** Bake the node transform, centre on the footprint (x, z), stand on y = 0. Returns the box of the result. */
function seat(geometry: THREE.BufferGeometry, world: THREE.Matrix4) {
  geometry.applyMatrix4(world);
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geometry.computeBoundingBox();
}

export async function loadKit(url: string): Promise<Kit> {
  const { gltf, draco } = loader();
  let scene: THREE.Group;
  try {
    scene = (await gltf.loadAsync(url)).scene;
  } finally {
    draco.dispose();
  }
  scene.updateMatrixWorld(true);
  const found: { name: string; geometry: THREE.BufferGeometry; source: THREE.Material }[] = [];
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.name) return;
    const source = Array.isArray(o.material) ? o.material[0] : o.material;
    const geometry = o.geometry.clone();
    seat(geometry, o.matrixWorld);
    found.push({ name: o.name, geometry, source });
  });

  // Tiles are scaled one by one so each is exactly 1 unit flat-to-flat (x). Props share the kit's mean tile scale, so a tree
  // keeps its size against the tile it was sculpted for.
  const tileScale = (g: THREE.BufferGeometry) => 1 / (g.boundingBox!.max.x - g.boundingBox!.min.x);
  const tiles = found.filter((f) => isTile(f.name));
  const mean = tiles.length ? tiles.reduce((s, f) => s + tileScale(f.geometry), 0) / tiles.length : 1;

  const cache = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const parts = new Map<string, KitPart>();
  for (const f of found) {
    const k = isTile(f.name) ? tileScale(f.geometry) : mean;
    f.geometry.scale(k, k, k);
    for (const a of Object.keys(f.geometry.attributes)) {
      if (!["position", "normal", "uv", "color"].includes(a)) f.geometry.deleteAttribute(a);
    }
    if (!f.geometry.attributes.normal) f.geometry.computeVertexNormals();
    f.geometry.computeBoundingBox();
    f.geometry.computeBoundingSphere();
    parts.set(f.name, { name: f.name, geometry: f.geometry, material: standard(f.source, !!f.geometry.attributes.color, cache) });
  }
  return {
    url,
    parts,
    dispose() {
      const seen = new Set<THREE.MeshStandardMaterial>();
      for (const p of parts.values()) {
        p.geometry.dispose();
        seen.add(p.material);
      }
      for (const m of seen) {
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap]) t?.dispose();
        m.dispose();
      }
      parts.clear();
    },
  };
}

export function partStats(kit: Kit): KitStats {
  const parts: PartStat[] = [];
  const materials = new Set<THREE.MeshStandardMaterial>();
  const textures = new Set<THREE.Texture>();
  for (const p of kit.parts.values()) {
    const g = p.geometry;
    parts.push({ name: p.name, triangles: Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3), drawCalls: 1 });
    materials.add(p.material);
  }
  for (const m of materials) {
    for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap]) if (t) textures.add(t);
  }
  let textureBytes = 0;
  for (const t of textures) {
    const img = t.image as { width: number; height: number } | null;
    if (img) textureBytes += img.width * img.height * 4;
  }
  return {
    parts,
    triangles: parts.reduce((s, p) => s + p.triangles, 0),
    drawCalls: parts.length,
    materials: materials.size,
    textureBytes,
  };
}
