// #312: the seat's mark as geometry, merged into the piece it sits on (docs/design/seat-marks.md, option B). A glyph is a
// few flat shapes in a unit square, every one wholly on one side of x = 0, so the same glyph can lie on a flat top (a
// path's badge, a stronghold's keep) or fold over an outpost's ridge with each half tilted onto its slope. Each shape is
// a thin extrusion standing MARK_RELIEF above the surface it sits on, with its underside sunk into the piece.
import * as THREE from "three";
import type { SeatMark } from "@/lib/game/types";

export const MARK_RELIEF = 0.02;
const SINK = 0.005;
const STROKE = 0.28; // of the glyph's width: 2 px on an 8 px mark

function rect(x0: number, y0: number, x1: number, y1: number) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.closePath();
  return s;
}

// Half an open ring, on the side `sign` of x = 0.
function halfRing(sign: 1 | -1) {
  const a0 = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.5, a0, a0 + Math.PI, false);
  s.absarc(0, 0, 0.5 - STROKE, a0 + Math.PI, a0, true);
  s.closePath();
  return s;
}

function shapes(mark: SeatMark): THREE.Shape[] {
  switch (mark) {
    case "triangle": {
      // Solid, apex toward -z (screen-up in the overhead view), split along its axis.
      const l = new THREE.Shape();
      l.moveTo(0, -0.5);
      l.lineTo(0, 0.5);
      l.lineTo(-0.5, -0.5);
      l.closePath();
      const r = new THREE.Shape();
      r.moveTo(0, -0.5);
      r.lineTo(0.5, -0.5);
      r.lineTo(0, 0.5);
      r.closePath();
      return [l, r];
    }
    case "bars":
      return [rect(-0.5, -0.5, -0.5 + STROKE, 0.5), rect(0.5 - STROKE, -0.5, 0.5, 0.5)];
    case "ring":
      return [halfRing(-1), halfRing(1)];
    case "plus":
      return [rect(-STROKE / 2, -0.5, 0, 0.5), rect(0, -0.5, STROKE / 2, 0.5), rect(-0.5, -STROKE / 2, 0, STROKE / 2), rect(0, -STROKE / 2, 0.5, STROKE / 2)];
  }
}

// The glyph's parts, `size` wide, lying flat with their undersides at y = -SINK and their faces at y = MARK_RELIEF - SINK.
// Non-indexed (ExtrudeGeometry is), so a piece's mergeGeometries takes them.
export function markParts(mark: SeatMark, size: number): THREE.BufferGeometry[] {
  return shapes(mark).map((s) =>
    new THREE.ExtrudeGeometry(s, { depth: MARK_RELIEF, bevelEnabled: false, curveSegments: 8 })
      .scale(size, size, 1)
      .rotateX(-Math.PI / 2)
      .translate(0, -SINK, 0),
  );
}

// Fold a flat glyph over a gable ridge along z: each part turns about the ridge onto the slope its side faces, which
// falls `rise` over `run` from the ridge.
export function foldOverRidge(parts: THREE.BufferGeometry[], rise: number, run: number) {
  const tilt = Math.atan2(rise, run);
  for (const g of parts) {
    g.computeBoundingBox();
    const side = Math.sign(g.boundingBox!.min.x + g.boundingBox!.max.x) || 1;
    g.rotateZ(-side * tilt);
  }
  return parts;
}
