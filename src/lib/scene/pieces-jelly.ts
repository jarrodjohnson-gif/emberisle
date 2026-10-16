// The players' pieces in the jelly look (#638; the owner, 2026-10-16: "distinct and easy to see where you have built").
// Glossy, rounded, and each its own shape so a piece reads by silhouette as well as by colour:
// - a path: a rounded causeway in the seat's colour on cream kerbs;
// - an outpost: today's house shape made jelly, all in the seat's colour under a steep, deeper roof
//   (docs/design/pieces-jelly-prompt.md);
// - a stronghold: a watchtower keep, taller, tapering, pillowy crenels, a banner flying.
// Every piece keeps the dark-and-cream base ring that makes it pop on any terrain. Same signatures as the slabs they
// replace (origin at the piece's foot; a path runs along +z, `len` long).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RIM } from "@/lib/scene/palette";

// One glossy jelly material for every piece (shared: disposeGroup leaves it alone).
export const JELLY_PIECE_MAT = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.35 });
JELLY_PIECE_MAT.userData.shared = true;

const WARM = "#ffd27a";
const DOOR = "#4a3226";

function col(geo: THREE.BufferGeometry, hex: string | THREE.Color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = hex instanceof THREE.Color ? hex : new THREE.Color(hex);
  const a = new Float32Array(g.attributes.position!.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
// A rounded box whose bottom is at y, centred on (x, z).
const rbox = (w: number, h: number, d: number, r: number, hex: string | THREE.Color, y = 0, x = 0, z = 0) =>
  col(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, h / 2, w / 2, d / 2)).translate(x, y + h / 2, z), hex);
// A disc (a short cylinder) whose bottom is at y.
const disc = (r: number, h: number, hex: string | THREE.Color, y = 0, seg = 28) => col(new THREE.CylinderGeometry(r, r * 1.03, h, seg).translate(0, y + h / 2, 0), hex);

function mesh(parts: THREE.BufferGeometry[], k = K) {
  const m = new THREE.Mesh(mergeGeometries(parts).scale(k, k, k), JELLY_PIECE_MAT);
  for (const p of parts) p.dispose();
  m.castShadow = true;
  return m;
}
// Walls in the seat's own colour, a touch lighter; roofs and tops a touch deeper, so the seat dominates in both views.
const pale = (seat: string) => new THREE.Color(seat).lerp(new THREE.Color(RIM.light), 0.18);
const deep = (seat: string) => new THREE.Color(seat).multiplyScalar(0.82);
// A little bigger than the slabs they replace, so a build reads from the whole-board camera. The widest ring (the keep's,
// 0.24) is then 0.552 across, under HEX_SIZE / 2 (pieces-prove 5).
const K = 1.15;

// A triangular prism (a gable roof) w wide, h tall, d deep, its eaves at y, bevelled soft.
function gable(w: number, h: number, d: number, hex: string | THREE.Color, y: number, bev = 0.014, x = 0, z = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 1 });
  return col(g.translate(x, y, z - d / 2), hex);
}
const front = (w: number, h: number, hex: string, x: number, y: number, z: number) => rbox(w, h, 0.012, Math.min(w, h) * 0.3, hex, y, x, z);

// The owner's pick (2026-10-16, "A"): today's house shape, jelly: a chunky block all in the seat's colour under a steep,
// deeper gable roof, a door, a lit window and a chimney.
export function makeJellyOutpost(seat: string) {
  const parts = [disc(0.235, 0.035, RIM.dark), disc(0.2, 0.03, RIM.light, 0.035)];
  const y0 = 0.065;
  parts.push(rbox(0.24, 0.14, 0.2, 0.03, seat, y0));
  parts.push(gable(0.27, 0.14, 0.22, deep(seat), y0 + 0.135));
  parts.push(front(0.05, 0.08, DOOR, -0.05, y0, 0.102));
  parts.push(front(0.045, 0.045, WARM, 0.055, y0 + 0.055, 0.102));
  parts.push(rbox(0.045, 0.1, 0.045, 0.012, RIM.light, y0 + 0.17, 0.075, -0.04));
  return mesh(parts);
}

export function makeJellyStronghold(seat: string) {
  const parts = [disc(0.24, 0.04, RIM.dark), disc(0.205, 0.035, RIM.light, 0.04)];
  const y0 = 0.075;
  const p = pale(seat);
  const d = deep(seat);
  // The keep: a round tower, tapering a little, pale walls, a seat-coloured band and top.
  parts.push(col(new THREE.CylinderGeometry(0.14, 0.172, 0.26, 28).translate(0, y0 + 0.13, 0), p));
  parts.push(col(new THREE.TorusGeometry(0.152, 0.018, 8, 28).rotateX(Math.PI / 2).translate(0, y0 + 0.21, 0), d));
  parts.push(disc(0.152, 0.04, d, y0 + 0.255));
  // Pillowy crenels round the top, in the seat's colour.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(col(new RoundedBoxGeometry(0.062, 0.056, 0.052, 3, 0.024).rotateY(-a).translate(Math.cos(a) * 0.125, y0 + 0.295 + 0.028, Math.sin(a) * 0.125), seat));
  }
  // A side turret, the door and arrow-slit windows facing the camera.
  parts.push(col(new THREE.CylinderGeometry(0.058, 0.066, 0.2, 16).translate(0.135, y0 + 0.1, -0.07), p));
  parts.push(col(new THREE.TorusGeometry(0.062, 0.01, 6, 16).rotateX(Math.PI / 2).translate(0.135, y0 + 0.2, -0.07), d));
  parts.push(col(new THREE.ConeGeometry(0.078, 0.095, 16).translate(0.135, y0 + 0.247, -0.07), d));
  parts.push(rbox(0.06, 0.09, 0.012, 0.006, DOOR, y0, 0, 0.165));
  for (const x of [-0.07, 0.07]) parts.push(rbox(0.02, 0.05, 0.012, 0.006, WARM, y0 + 0.13, x, 0.142));
  // The banner on its pole.
  parts.push(col(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 6).translate(-0.05, y0 + 0.295 + 0.09, -0.02), RIM.dark));
  parts.push(rbox(0.09, 0.055, 0.012, 0.005, seat, y0 + 0.385, -0.005, -0.02));
  return mesh(parts);
}

// A path keeps its length (it spans its edge); only its width and height grow.
export function makeJellyPath(seat: string, len: number) {
  const m = mesh([
    rbox(0.3 * K, 0.035 * K, len, 0.015, RIM.dark),
    rbox(0.23 * K, 0.03 * K, len - 0.05, 0.012, RIM.light, 0.03 * K),
    rbox(0.17 * K, 0.055 * K, len - 0.1, 0.026, seat, 0.06 * K),
  ], 1);
  return m;
}
