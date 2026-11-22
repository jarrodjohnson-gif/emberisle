// #722 (#608): the decorative board cue under what a bot just did. docs/design/bot-action-moments.md, "Decorative targets".
// A ring round a corner's piece, a plate under a path, or a rim round the wayfarer's hex, in the actor's colour with a
// contrasting neutral edge, for exactly the line's lifetime. Reduced motion holds a steady outline.
//
// This layer is its own group. It is never in the renderer's pickables or marks (the only things it raycasts), and it reads no
// camera, so legal highlights, hover, picking, the camera fit and the pieces' own squash stay exactly as they are. It keeps
// only ids: after a board rebuild it places them again, and a target that is gone is skipped, never swapped for another.
import * as THREE from "three";
import { HEX_SIZE } from "@/lib/game/hex";
import { RIM } from "@/lib/scene/palette";

// Where one id sits on the current board, from the renderer's resolver. `y` is the ground under it; an edge also has its
// heading and length.
export interface CueTarget {
  kind: "vertex" | "edge" | "hex";
  x: number;
  y: number;
  z: number;
  rot?: number;
  span?: number;
}
export type CueResolve = (id: string) => CueTarget | null;

export interface CueRequest {
  // The presentation epoch (#720's feed): an older epoch's line is refused, a newer one replaces the cue.
  epoch: number;
  // Stable edge, vertex or hex ids. A Path fortune passes both edges.
  targets: readonly string[];
  // The actor's seat colour, #rrggbb; none draws nothing.
  color?: string;
  // The line's end on the performance.now() clock. The cue is gone from the first step at or after it.
  until: number;
}

// Sizes in world units, as [outer, inner] half-sizes: a corner ring's radii, a hex rim's corner radii, or a path plate's
// half width and half length (as a share of the edge). A built piece's base ends at about 0.28 (HOME_HALO in
// isle-renderer.ts), so the corner ring lies outside it, clear of the legal-corner ring (0.2) and the home halo (0.31 to
// 0.39). A jelly path's base is 0.345 wide (pieces-jelly.ts), so the plate is 0.6 wide. At the diorama's tilt the far half
// hides behind the piece, so both are wide. The neutral edge is 0.03 wider all round than the accent band, and the cue lies
// LIFT above the ground (`RIM_W` and `LIFT`).
// A ring's third number is its segments round: 6 makes the hex rim, its corners turned onto the board's.
export const CUE = {
  vertex: [0.55, 0.46, 40],
  edge: [0.3, 0.42, 0],
  hex: [HEX_SIZE * 0.97, HEX_SIZE * 0.84, 6],
} as const;
export const RIM_W = 0.03;
export const LIFT = 0.05;

// The neutral edge for an accent: the board's dark rim, or its light rim on a dark seat. Relative luminance 0.18 is where
// the two stand equally far (WCAG contrast) from the accent. THREE.Color holds the linear values WCAG weighs.
export function neutralFor(accent: string) {
  const { r, g, b } = new THREE.Color(accent);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18 ? RIM.light : RIM.dark;
}

const mat = () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });

export class BotCues {
  readonly group = new THREE.Group();
  private req: CueRequest | null = null;
  // [neutral edge, accent], recoloured for each line and kept until dispose.
  private mats = [mat(), mat()];
  private epoch = -Infinity;

  // Show one line's targets, replacing whatever cue is up. Returns how many targets drew: an id the board lacks is skipped,
  // and an older epoch's line or no colour draws nothing (a line already past its deadline ends at the next step). A line with no targets just starts its epoch:
  // the cue goes, and older lines are refused from then on (a new deal, a welcome, a rematch); with the current epoch it just
  // ends the cue. The request is kept as given; the caller does not change it afterwards.
  show(req: CueRequest, resolve: CueResolve): number {
    if (!(req.epoch >= this.epoch)) return 0;
    this.epoch = req.epoch;
    this.clear();
    if (!req.color) return 0;
    this.mats[0]!.color.set(neutralFor(req.color));
    this.mats[1]!.color.set(req.color);
    this.req = req;
    this.resync(resolve);
    return this.group.children.length / 2;
  }

  // After a board rebuild: place the same ids on the board as it is now. A target that is gone drops out, and with none
  // left the cue ends. Never adds an id the line did not name. Each target is two meshes, the neutral edge below and the
  // accent band a hair above and inset from it, so the edge shows on both sides.
  resync(resolve: CueResolve) {
    if (!this.req) return;
    this.empty();
    for (const id of this.req.targets) {
      const t = resolve(id);
      if (!t) continue;
      const [a, b, sides] = CUE[t.kind];
      for (const k of [0, 1]) {
        // k 0: the neutral edge, `rim` wider all round; k 1: the accent band, a hair above.
        const r = RIM_W * (1 - k);
        const m = new THREE.Mesh(
          t.kind === "edge" ? new THREE.PlaneGeometry(2 * (a + r), 2 * (b * t.span! + r)) : new THREE.RingGeometry(b - r, a + r, sides),
          this.mats[k],
        );
        m.position.set(t.x, t.y + LIFT + k * 0.002, t.z);
        // Flat on the ground, then turned in its own plane: along the edge, or to put a hex's corners on the board's.
        m.rotation.set(-Math.PI / 2, 0, t.rot ?? Math.PI / 6);
        m.renderOrder = 90 + k;
        this.group.add(m);
      }
    }
    if (!this.group.children.length) this.clear();
  }

  // Advance to `now`: the cue ends at its deadline, and with motion its accent's opacity swings between 0.7 and 1 about once
  // a second (1.1 Hz), enough to see and still the seat's hue over the neutral below; reduced motion holds 1. Returns true
  // when the picture changed, so a frame should draw.
  step(now: number, calm: boolean): boolean {
    const accent = this.mats[1]!;
    const o = calm ? 1 : 0.85 + 0.15 * Math.cos(now * 0.00691);
    if (this.req && now >= this.req.until) return this.clear(), true;
    if (!this.req || o === accent.opacity) return false;
    accent.opacity = o;
    return true;
  }

  // Remove the cue.
  clear() {
    this.empty();
    this.req = null;
  }

  dispose() {
    this.clear();
    this.mats.map((m) => m.dispose());
  }

  private empty() {
    for (const m of this.group.children) (m as THREE.Mesh).geometry.dispose();
    this.group.clear();
  }
}
