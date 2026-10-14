// Writes public/kits/placeholder/kit.glb: the stand-in kit for the glTF pipeline (docs/design/assets.md). Same bytes on every run.
// Run: npm run make-placeholder-kit. Uncompressed: @gltf-transform is not a dependency, so there is no Draco pass (the file is
// well under budget anyway; the loader still reads Draco and meshopt kits).
import { mkdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// GLTFExporter reads its buffers back through FileReader, which Node lacks.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((r) => { this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(r).toString("base64")}`; this.onloadend?.(); }); }
};

const R = 1 / Math.sqrt(3); // circumradius of a hex 1 unit flat-to-flat; pointy-top, so the flats face +-x
const H = 0.12, BEVEL = 0.03;
const col = (hex) => new THREE.Color(hex); // hex is sRGB; Color stores it linear, as glTF wants

function flat(tris) {
  const pos = [], nor = [], rgb = [];
  for (const [a, b, c, color] of tris) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const [v, k] of [[a, color[0]], [b, color[1]], [c, color[2]]]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); rgb.push(k.r, k.g, k.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
  return g;
}

function tile(top, rim) {
  const ring = (r, y) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)); });
  const base = ring(R, 0), wall = ring(R, H - BEVEL), lip = ring(R - BEVEL * 1.2, H);
  const stone = col(0x6b5a4a), stoneLit = col(0x8a755f), t = col(top), r = col(rim);
  const c = new THREE.Vector3(0, H / 2, 0);
  const out = [];
  const add = (a, b, d, k) => { // wind outward from the slab centre
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const mid = a.clone().add(b).add(d).divideScalar(3).sub(c);
    out.push(n.dot(mid) >= 0 ? [a, b, d, k] : [a, d, b, [k[0], k[2], k[1]]]);
  };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    add(base[i], base[j], wall[j], [stone, stone, stoneLit]);
    add(base[i], wall[j], wall[i], [stone, stoneLit, stoneLit]);
    add(wall[i], wall[j], lip[j], [stoneLit, stoneLit, r]);
    add(wall[i], lip[j], lip[i], [stoneLit, r, r]);
    add(lip[i], lip[j], new THREE.Vector3(0, H, 0), [r, r, t]);
    add(base[j], base[i], new THREE.Vector3(0, 0, 0), [stone, stone, stone]);
  }
  return flat(out);
}

// A prop is solids merged into one coloured geometry, flat-shaded.
function solid(geo, y, hex, shade = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  g.translate(0, y, 0);
  const k = col(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const f = 1 + shade * (g.attributes.position.getY(i) - y); a.set([k.r * f, k.g * f, k.b * f], i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  g.computeVertexNormals();
  return g;
}
const merge = (list) => mergeGeometries(list);

const tree = (h, tiers, hue) => {
  const parts = [solid(new THREE.CylinderGeometry(0.018, 0.026, 0.07, 6), 0.035, 0x5b3d26)];
  for (let i = 0; i < tiers; i++) {
    const r = 0.1 - i * (0.05 / tiers), hh = h / tiers + 0.04;
    parts.push(solid(new THREE.ConeGeometry(r, hh, 7), 0.07 + i * (h / tiers) * 0.8 + hh / 2, hue, 0.6));
  }
  return merge(parts);
};

function rock() {
  const g = new THREE.IcosahedronGeometry(0.085, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { // deterministic jitter, no RNG
    const v = new THREE.Vector3().fromBufferAttribute(p, i), s = 1 + 0.18 * Math.sin(v.x * 71 + v.y * 37 + v.z * 53);
    p.setXYZ(i, v.x * s * 1.2, v.y * s * 0.7, v.z * s);
  }
  return solid(g, 0.05, 0x8c8a85, 2);
}

const sign = () => merge([
  solid(new THREE.BoxGeometry(0.03, 0.26, 0.03), 0.13, 0x5b3d26),
  solid(new THREE.BoxGeometry(0.2, 0.09, 0.02), 0.22, 0xd9c7a0),
  solid(new THREE.BoxGeometry(0.12, 0.025, 0.026), 0.22, 0xb5482f),
]);

const TOPS = { forest: [0x3e7d3a, 0x2f6330], pasture: [0x8fbf5a, 0x76a64a], grain: [0xe3c25a, 0xc9a640], clay: [0xc4663d, 0xa95030], ore: [0x8a8f98, 0x6d727b], waste: [0xd9c79a, 0xbfae82] };
const material = new THREE.MeshStandardMaterial({ name: "kit", vertexColors: true, roughness: 0.85, metalness: 0 });
const scene = new THREE.Scene();
const put = (name, geometry) => { const m = new THREE.Mesh(geometry, material); m.name = name; scene.add(m); };
for (const [k, [top, rim]] of Object.entries(TOPS)) put(`tile_${k}`, tile(top, rim));
put("prop_tree_1", tree(0.26, 2, 0x2f6b34));
put("prop_tree_2", tree(0.36, 3, 0x3f7f3a));
put("prop_rock_1", rock());
put("dock_sign", sign());

const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
mkdirSync("public/kits/placeholder", { recursive: true });
writeFileSync("public/kits/placeholder/kit.glb", Buffer.from(glb));
console.log(`public/kits/placeholder/kit.glb ${glb.byteLength} bytes`);
