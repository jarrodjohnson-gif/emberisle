// Board award markers (#743, docs/design/award-markers.md): a cloth strip on each edge of the longest-path holder's trail
// and one flag on the largest-army holder's stronghold. Static, unlit by any effect, never pickable. Its own chunk: the
// renderer loads it the first time a game has a holder. It takes three's classes from the renderer (`awardsInit`) rather
// than importing three, which would split three out of the IslandCanvas chunk into a shared one.
import type * as THREE from "three";
import { roadWitness } from "@/lib/game/rules";
import type { GameState } from "@/lib/game/types";

// A player has 15 paths; a larger network is malformed, and the banner is left off rather than searched.
export const MAX_STRIPS = 15;
const STRIP_SPAN = 0.6; // of the edge's length
const STRIP_W = 0.055;
export const STRIP_LIFT = 0.045; // above the resting path's top
export const POLE_H = 0.12;
export const PENNANT_W = 0.1;
// The pieces' rim pair (RIM in palette.ts): a dark outer edge and a light seam, so pale and dark seats both read.
const EDGE = "#1c1916";
const SEAM = "#fff6e8";

export type AwardThree = Pick<
  typeof THREE,
  "BufferGeometry" | "Float32BufferAttribute" | "Group" | "Mesh" | "Color" | "CylinderGeometry" | "MeshStandardMaterial" | "DoubleSide" | "Box3" | "Vector3"
>;
let T: AwardThree;

export type AwardPlan = {
  road: { color: string; segs: { id: string; from: string; to: string }[] } | null;
  army: { color: string; vertex: string } | null;
};

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// What to draw, from the canonical holder ids only. A null or unknown holder, or no anchor, draws nothing.
export function awardPlan(state: GameState): AwardPlan {
  const color = (id: string | null) => (id ? state.players.find((p) => p.id === id)?.color : undefined);
  const rc = color(state.longestRoad);
  let road: AwardPlan["road"] = null;
  if (rc && state.edges.filter((e) => e.path === state.longestRoad).length <= MAX_STRIPS) {
    const w = roadWitness(state, state.longestRoad!);
    if (w.edgeIds.length) road = { color: rc, segs: w.edgeIds.map((id, i) => ({ id, from: w.vertexIds[i]!, to: w.vertexIds[i + 1]! })) };
  }
  const ac = color(state.largestArmy);
  const vertex = ac
    ? state.vertices
        .filter((v) => v.building?.playerId === state.largestArmy && v.building.kind === "stronghold")
        .map((v) => v.id)
        .sort(order)[0]
    : undefined;
  return { road, army: ac && vertex ? { color: ac, vertex } : null };
}

type P = [number, number];
// Flat coloured triangles in the XY plane, each layer `z` off it, as one geometry (built by hand: no shared merge helper).
function flat(layers: { tris: P[][]; color: string; z: number }[]) {
  const pos: number[] = [];
  const col: number[] = [];
  for (const { tris, color: hex, z } of layers) {
    const color = new T.Color(hex);
    for (const t of tris) {
      for (const [x, y] of t) {
        pos.push(x, y, z);
        col.push(color.r, color.g, color.b);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// A swallow-tailed strip `len` long (along y), `w` across, forked `fork` deep at both ends: two convex halves.
function strip(len: number, w: number, fork: number): P[][] {
  const [l, h] = [len / 2, w / 2];
  const quad = (a: P, b: P, c: P, d: P) => [[a, b, c], [a, c, d]];
  return [...quad([-h, -l], [0, -l + fork], [0, l - fork], [-h, l]), ...quad([0, -l + fork], [h, -l], [h, l], [0, l - fork])];
}

export type AwardAnchors = {
  // A corner's position on the table.
  at: (vid: string) => { x: number; z: number } | undefined;
  // The world y of a resting piece's top (`e:<id>` or `v:<id>`), or undefined if it is not on the board.
  top: (key: string) => number | undefined;
};

// The decorations for a plan, each child keyed by the piece it sits on (`e:<id>`, `v:<id>`) for landing suppression.
export function buildAwards(plan: AwardPlan, anchors: AwardAnchors, material: THREE.Material): THREE.Group {
  const group = new T.Group();
  group.name = "awardMarkers";
  const add = (mesh: THREE.Mesh, key: string, id: string) => {
    mesh.userData = { key, id };
    mesh.raycast = () => {};
    mesh.castShadow = mesh.receiveShadow = false;
    group.add(mesh);
  };
  if (plan.road) {
    const face = plan.road.color;
    for (const s of plan.road.segs) {
      const a = anchors.at(s.from);
      const b = anchors.at(s.to);
      const top = anchors.top(`e:${s.id}`);
      if (!a || !b || top === undefined) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z) * STRIP_SPAN;
      const fork = STRIP_W * 0.6;
      const geo = flat([
        { tris: strip(len, STRIP_W, fork), color: EDGE, z: 0 },
        { tris: strip(len - 0.012, STRIP_W - 0.012, fork), color: face, z: 0.001 },
        { tris: strip(len - fork * 2 - 0.02, 0.008, 0), color: SEAM, z: 0.002 },
      ]);
      // Laid flat: the shape's +Y runs along the edge, its face up.
      geo.rotateX(-Math.PI / 2);
      const m = new T.Mesh(geo, material);
      m.position.set((a.x + b.x) / 2, top + STRIP_LIFT, (a.z + b.z) / 2);
      m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      add(m, `e:${s.id}`, s.id);
    }
  }
  if (plan.army) {
    const v = anchors.at(plan.army.vertex);
    const roof = anchors.top(`v:${plan.army.vertex}`);
    if (v && roof !== undefined) {
      const pole = new T.CylinderGeometry(0.007, 0.007, POLE_H, 6);
      pole.translate(0, POLE_H / 2, 0);
      const pc = pole.getAttribute("position").count;
      const dark = new T.Color(EDGE);
      pole.setAttribute("color", new T.Float32BufferAttribute(Array.from({ length: pc }, () => [dark.r, dark.g, dark.b]).flat(), 3));
      // The pennant stands in the XY plane, flying toward +x: a dark edge, the seat's face and a light seam on each side.
      const tri = (inset: number): P[] => [[inset, POLE_H - inset], [inset, POLE_H - 0.06 + inset], [PENNANT_W - inset * 2, POLE_H - 0.03]];
      const seam: P[] = [[0.012, POLE_H - 0.0315], [0.012, POLE_H - 0.0285], [0.07, POLE_H - 0.03]];
      const seat = plan.army.color;
      const pennant = flat([
        { tris: [tri(0)], color: EDGE, z: 0 },
        ...[0.001, -0.001].map((z) => ({ tris: [tri(0.006)], color: seat, z })),
        ...[0.0015, -0.0015].map((z) => ({ tris: [seam], color: SEAM, z })),
      ]);
      for (const g of [pole, pennant]) {
        const m = new T.Mesh(g, material);
        m.position.set(v.x, roof, v.z);
        add(m, `v:${plan.army.vertex}`, plan.army.vertex);
      }
    }
  }
  return group;
}

// The one material every marker on a renderer shares: opaque, lit like the pieces, coloured per vertex, both faces drawn.
function awardMaterial() {
  return new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: T.DoubleSide });
}

// What the renderer owns and lends each frame: the hole the play view is fitted to (null off the play view).
export type AwardView = { cam: THREE.Camera; w: number; h: number; hole: { top: number; right: number; bottom: number; left: number } | null };

// The markers on one renderer: one group, rebuilt only when the plan or the island changes, disposed with the renderer.
export class AwardMarkers {
  readonly group: THREE.Group;
  private key = "";
  private material: THREE.Material;

  // The renderer hands over three's classes, not the namespace, so this chunk imports no three of its own.
  constructor(three: AwardThree) {
    T = three;
    this.group = new T.Group();
    this.group.name = "awardMarkers";
    this.material = awardMaterial();
  }

  // Draw what the canonical holders earn on `state`, or nothing for null (title, lobby, no holder). `pieces` are the
  // renderer's current piece objects, keyed `e:<id>`/`v:<id>`, each with its resting y. True when the group changed.
  sync(state: GameState | null, pieces: THREE.Object3D[], land: string): boolean {
    const plan = state && (state.longestRoad || state.largestArmy) ? awardPlan(state) : null;
    const key = plan ? `${land}|${JSON.stringify(plan)}` : "";
    if (key === this.key) return false;
    this.clear();
    this.key = key;
    if (!plan || !state) return true;
    const vmap = new Map(state.vertices.map((v) => [v.id, v]));
    const tops = new Map<string, number>();
    const box = new T.Box3();
    for (const o of pieces) {
      // The resting top, measured from the piece's own geometry. A landing piece is posed at rest for the measure (its
      // drop and squash move it and scale it), then put back where its landing has it.
      const [y, scale] = [o.position.y, o.scale.clone()];
      o.position.y = o.userData.restY as number;
      o.scale.set(1, 1, 1);
      tops.set(o.userData.key as string, box.setFromObject(o).max.y);
      o.position.y = y;
      o.scale.copy(scale);
      o.updateMatrixWorld(true);
    }
    const built = buildAwards(plan, { at: (id) => vmap.get(id), top: (k) => tops.get(k) }, this.material);
    for (const m of [...built.children]) this.group.add(m);
    return true;
  }

  // Hide a marker while its piece lands (`busy` keys), while its edge or corner is a legal or pending target (`cued`), and
  // while any corner of its bounds falls outside the hole (or the canvas). It returns, unchanged, once these clear.
  // True when any visibility flipped.
  step(busy: Set<string>, cued: (id: string) => boolean, view: AwardView): boolean {
    let flipped = false;
    if (!this.group.children.length) return flipped;
    const { cam, w, h, hole } = view;
    const [l, t, r, b] = hole ? [hole.left, hole.top, w - hole.right, h - hole.bottom] : [0, 0, w, h];
    cam.updateMatrixWorld();
    const box = new T.Box3();
    const p = new T.Vector3();
    for (const o of this.group.children) {
      let show = !busy.has(o.userData.key as string) && !cued(o.userData.id as string);
      if (show) {
        box.setFromObject(o);
        for (let i = 0; i < 8 && show; i++) {
          p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
          const [x, y] = [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h];
          show = p.z < 1 && x >= l && x <= r && y >= t && y <= b;
        }
      }
      if (o.visible !== show) flipped = true;
      o.visible = show;
    }
    return flipped;
  }

  // Geometry goes with its meshes; the one material stays until dispose.
  private clear() {
    for (const m of this.group.children) (m as THREE.Mesh).geometry.dispose();
    this.group.clear();
    this.key = "";
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
    this.material.dispose();
  }
}
