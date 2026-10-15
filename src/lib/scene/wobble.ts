import * as THREE from "three";

// The island answers a tap (crystal-water.md "Touch the sea"): the tapped tile and what stands on it swell to 1.03 and settle
// back over 220 ms, about the tile's base, so the props ride along. A tap again mid-wobble restarts it from where it stands.
export const WOBBLE = { ms: 220, peak: 0.03 } as const;

type Part = { o: THREE.Object3D; y: number; scale: THREE.Vector3 };

export class Wobble {
  private live = new Map<string, { parts: Part[]; base: number; start: number }>();

  start(id: string, objects: THREE.Object3D[], base: number, now: number) {
    const was = this.live.get(id);
    if (was) {
      // Back onto the rising half of the curve at the scale it stands at, so it swells on from there without a jump.
      const k = scaleAt((now - was.start) / WOBBLE.ms);
      const eased = Math.asin(Math.min(1, (k - 1) / WOBBLE.peak)) / Math.PI;
      was.start = now - (1 - Math.sqrt(1 - eased)) * WOBBLE.ms;
      return;
    }
    this.live.set(id, { parts: objects.map((o) => ({ o, y: o.position.y, scale: o.scale.clone() })), base, start: now });
  }

  /** The scale each live wobble stands at now (1 once it is over), by id; for the proof. */
  scales(now: number) {
    return Object.fromEntries([...this.live].map(([id, w]) => [id, scaleAt((now - w.start) / WOBBLE.ms)]));
  }

  step(now: number) {
    for (const [id, w] of this.live) {
      const u = (now - w.start) / WOBBLE.ms;
      const k = scaleAt(u);
      for (const p of w.parts) {
        p.o.scale.copy(p.scale).multiplyScalar(k);
        p.o.position.y = w.base + (p.y - w.base) * k;
      }
      if (u >= 1) this.live.delete(id);
    }
  }
}

// Up fast and down slower: the half sine over an eased-out clock.
function scaleAt(u: number) {
  if (u <= 0 || u >= 1) return 1;
  return 1 + WOBBLE.peak * Math.sin(Math.PI * (1 - (1 - u) ** 2));
}
