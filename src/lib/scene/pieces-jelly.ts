// The players' pieces in the jelly look (#638; the owner, 2026-10-16: "distinct and easy to see where you have built").
// Glossy, rounded, and each its own shape so a piece reads by silhouette as well as by colour:
// - a path: a rounded causeway in the seat's colour on cream kerbs;
// - an outpost: a hut on a mound (docs/design/pieces-jelly-prompt.md), half sunk in a knoll of the seat's colour under a
//   big round roof of it (what the overhead view sees), a round door, a lit window and a chimney with a puff;
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
const box = (w: number, h: number, d: number, hex: string | THREE.Color, y: number, x = 0, z = 0) => col(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), hex);

function mesh(parts: THREE.BufferGeometry[], k = K) {
  const m = new THREE.Mesh(mergeGeometries(parts).scale(k, k, k), JELLY_PIECE_MAT);
  for (const p of parts) p.dispose();
  m.castShadow = true;
  return m;
}
// Walls in the seat's own colour, a touch lighter; roofs and tops a touch deeper, so the seat dominates in both views.
const pale = (seat: string) => new THREE.Color(seat).lerp(new THREE.Color(RIM.light), 0.18);
const deep = (seat: string) => new THREE.Color(seat).multiplyScalar(0.82);
// A little bigger than the slabs they replace, so a build reads from the whole-board camera.
const K = 1.15;

export function makeJellyOutpost(seat: string) {
  const parts = [disc(0.235, 0.035, RIM.dark), disc(0.2, 0.03, RIM.light, 0.035)];
  const y0 = 0.065;
  const d = deep(seat);
  // The knoll: a soft mound of the seat's colour the hut sits half sunk in.
  parts.push(col(new THREE.SphereGeometry(0.17, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(0, y0, 0), seat));
  // The round walls, pale; a round door and one round lit window facing the camera (+z).
  parts.push(col(new THREE.CylinderGeometry(0.098, 0.106, 0.14, 24).translate(0, y0 + 0.07, 0), pale(seat)));
  const round = (r: number, hex: string, x: number, y: number) =>
    col(new THREE.CylinderGeometry(r, r, 0.012, 16).rotateX(Math.PI / 2).translate(x, y, Math.sqrt(0.1 * 0.1 - x * x) + 0.002), hex);
  parts.push(round(0.032, DOOR, -0.028, y0 + 0.068));
  parts.push(round(0.02, WARM, 0.048, y0 + 0.095));
  // The roof: a big pillowy overhanging dome in the seat's colour, a deeper roll at its rim.
  const ry = y0 + 0.13;
  const prof = [[0.001, -0.004], [0.14, -0.004], [0.148, 0.01], [0.13, 0.03], [0.095, 0.062], [0.058, 0.096], [0.024, 0.12], [0, 0.126]].map(([x, y]) => new THREE.Vector2(x, y));
  parts.push(col(new THREE.LatheGeometry(prof, 28).translate(0, ry, 0), seat));
  parts.push(col(new THREE.TorusGeometry(0.14, 0.016, 8, 28).rotateX(Math.PI / 2).translate(0, ry + 0.008, 0), d));
  // A round chimney through the roof, a puff on top.
  parts.push(col(new THREE.CylinderGeometry(0.022, 0.024, 0.08, 12).translate(0.06, ry + 0.085, -0.035), pale(seat)));
  parts.push(col(new THREE.TorusGeometry(0.023, 0.007, 6, 12).rotateX(Math.PI / 2).translate(0.06, ry + 0.125, -0.035), d));
  parts.push(col(new THREE.SphereGeometry(0.024, 12, 8).translate(0.064, ry + 0.15, -0.035), RIM.light));
  parts.push(col(new THREE.SphereGeometry(0.016, 10, 6).translate(0.082, ry + 0.175, -0.04), RIM.light));
  return mesh(parts);
}

export function makeJellyStronghold(seat: string) {
  const parts = [disc(0.275, 0.04, RIM.dark), disc(0.24, 0.035, RIM.light, 0.04)];
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
  parts.push(col(new THREE.CylinderGeometry(0.058, 0.066, 0.2, 16).translate(0.155, y0 + 0.1, -0.06), p));
  parts.push(col(new THREE.TorusGeometry(0.062, 0.01, 6, 16).rotateX(Math.PI / 2).translate(0.155, y0 + 0.2, -0.06), d));
  parts.push(col(new THREE.ConeGeometry(0.078, 0.095, 16).translate(0.155, y0 + 0.247, -0.06), d));
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
