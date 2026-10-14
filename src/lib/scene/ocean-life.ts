import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hashStr, mulberry32 } from "@/lib/utils";

export type OceanSpecies = "dolphin" | "turtle" | "whale";
type Lane = { angle: number; arc: number; direction: number };
type Visit = Lane & { species: OceanSpecies; age: number; duration: number; radius: number };
type Creature = { root: THREE.Group; tail?: THREE.Mesh; fins?: THREE.Mesh[]; breath?: THREE.Mesh; wake: THREE.Mesh };
type View = (x: number, z: number, reach: number) => boolean;
const SETTINGS = {
  dolphin: { radius: 6.4, reach: 0.70, duration: 18, arc: 0.48 },
  turtle: { radius: 6.2, reach: 0.45, duration: 27, arc: 0.36 },
  whale: { radius: 6.9, reach: 1.10, duration: 30, arc: 0.32 },
} satisfies Record<OceanSpecies, { radius: number; reach: number; duration: number; arc: number }>;
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, flatShading: true });

function part(geo: THREE.BufferGeometry, colour: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g = g.scale(sx, sy, sz).translate(x, y, z);
  g.deleteAttribute("uv");
  const c = new THREE.Color(colour);
  const colours = new Float32Array(g.attributes.position!.count * 3);
  for (let i = 0; i < colours.length; i += 3) { colours[i] = c.r; colours[i + 1] = c.g; colours[i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]) {
  const geo = mergeGeometries(parts, false)!;
  parts.forEach(p => p.dispose());
  return new THREE.Mesh(geo, MAT);
}

function fin(points: number[][], colour: number) {
  const geo = new THREE.BufferGeometry();
  // Two sides so the fin is visible as the animal crosses in either direction.
  geo.setAttribute("position", new THREE.Float32BufferAttribute([...points.flat(), ...[...points].reverse().flat()], 3));
  geo.computeVertexNormals();
  return part(geo, colour);
}

function wake() {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.31, 0.33, 24), new THREE.MeshBasicMaterial({ color: 0xc7f4e9, transparent: true, opacity: 0, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  return mesh;
}

function dolphin(): Creature {
  const root = new THREE.Group();
  root.add(merge([
    part(new THREE.SphereGeometry(1, 10, 6), 0x527d89, 0, 0, 0, 0.15, 0.12, 0.44),
    part(new THREE.SphereGeometry(1, 8, 5), 0x729aa1, 0, -0.018, 0.32, 0.13, 0.10, 0.19),
    part(new THREE.ConeGeometry(0.055, 0.24, 6).rotateX(Math.PI / 2), 0x527d89, 0, -0.025, 0.52),
    fin([[0, 0.06, -0.12], [0, 0.27, -0.20], [0, 0.06, 0.08]], 0x3c6471),
    fin([[0.10, -0.02, 0.10], [0.34, -0.07, -0.05], [0.09, -0.05, -0.12]], 0x3c6471),
    fin([[-0.10, -0.02, 0.10], [-0.34, -0.07, -0.05], [-0.09, -0.05, -0.12]], 0x3c6471),
  ]));
  const tail = merge([
    part(new THREE.ConeGeometry(0.09, 0.27, 6).rotateX(-Math.PI / 2), 0x527d89, 0, 0, -0.12),
    fin([[0, 0, -0.20], [0.26, 0.01, -0.32], [0.03, 0, -0.36]], 0x3c6471),
    fin([[0, 0, -0.20], [-0.26, 0.01, -0.32], [-0.03, 0, -0.36]], 0x3c6471),
  ]);
  tail.position.z = -0.30;
  root.add(tail);
  const ripple = wake();
  return { root, tail, wake: ripple };
}

function turtle(): Creature {
  const root = new THREE.Group();
  root.add(merge([
    part(new THREE.SphereGeometry(1, 8, 4), 0x427a50, 0, 0.01, 0, 0.24, 0.13, 0.28),
    part(new THREE.SphereGeometry(1, 6, 4), 0x74995d, 0, -0.02, 0.31, 0.08, 0.06, 0.12),
    part(new THREE.SphereGeometry(1, 6, 3), 0x5d9257, 0, 0.075, 0, 0.17, 0.08, 0.20),
    part(new THREE.ConeGeometry(0.03, 0.14, 5).rotateX(-Math.PI / 2), 0x74995d, 0, -0.035, -0.32),
  ]));
  const fins = [-1, 1].map(side => {
    const m = merge([
      fin([[0, 0, 0.12], [side * 0.22, -0.02, 0.02], [side * 0.19, -0.02, -0.12]], 0x74995d),
      fin([[0, 0, -0.10], [side * 0.15, -0.02, -0.22], [side * 0.12, -0.02, -0.29]], 0x74995d),
    ]);
    m.position.set(side * 0.17, -0.04, 0);
    root.add(m);
    return m;
  });
  const ripple = wake();
  return { root, fins, wake: ripple };
}

function whale(): Creature {
  const root = new THREE.Group();
  root.add(merge([
    part(new THREE.SphereGeometry(1, 12, 7), 0x375c72, 0, 0, 0, 0.32, 0.21, 0.77),
    part(new THREE.SphereGeometry(1, 10, 5), 0x476f80, 0, -0.005, 0.46, 0.29, 0.18, 0.32),
    fin([[0, 0.12, -0.22], [0, 0.34, -0.36], [0, 0.12, -0.07]], 0x2c4c63),
    fin([[0.24, -0.05, 0.22], [0.54, -0.12, -0.10], [0.20, -0.10, -0.28]], 0x2c4c63),
    fin([[-0.24, -0.05, 0.22], [-0.54, -0.12, -0.10], [-0.20, -0.10, -0.28]], 0x2c4c63),
  ]));
  const tail = merge([
    part(new THREE.ConeGeometry(0.14, 0.38, 8).rotateX(-Math.PI / 2), 0x375c72, 0, 0, -0.12),
    fin([[0, 0, -0.24], [0.39, 0.01, -0.40], [0.03, 0, -0.44]], 0x2c4c63),
    fin([[0, 0, -0.24], [-0.39, 0.01, -0.40], [-0.03, 0, -0.44]], 0x2c4c63),
  ]);
  tail.position.z = -0.60; root.add(tail);
  const breath = merge([
    part(new THREE.CylinderGeometry(0.008, 0.025, 0.50, 6), 0xc7f4e9, 0, 0.28, 0.47),
    part(new THREE.IcosahedronGeometry(0.05, 0), 0xc7f4e9, -0.045, 0.57, 0.48),
    part(new THREE.IcosahedronGeometry(0.04, 0), 0xc7f4e9, 0.045, 0.55, 0.46),
  ]);
  breath.visible = false; root.add(breath);
  const ripple = wake();
  return { root, tail, breath, wake: ripple };
}

/** Decorative, bounded, independent of game RNG and state. Hidden/reduced-motion pages never advance it. */
export class OceanLife {
  readonly group = new THREE.Group();
  private readonly creatures: Record<OceanSpecies, Creature> = { dolphin: dolphin(), turtle: turtle(), whale: whale() };
  private rng = mulberry32(hashStr("emberisle-ocean"));
  private next = 10;
  private active: Visit | null = null;
  private visits = 0;

  constructor() {
    this.group.name = "ocean-life";
    for (const [species, c] of Object.entries(this.creatures)) {
      c.root.name = species;
      c.root.visible = false;
      c.wake.visible = false;
      c.root.userData = { ambient: true, species };
      this.group.add(c.root, c.wake);
    }
  }

  reset(seed: string) {
    this.rng = mulberry32(hashStr(`ocean:${seed}`));
    this.next = 8 + this.rng() * 8;
    this.active = null;
    this.visits = 0;
    Object.values(this.creatures).forEach(c => { c.root.visible = false; c.wake.visible = false; });
  }

  private lane(species: OceanSpecies, visible: View): Lane | null {
    const s = SETTINGS[species];
    const first = this.rng() * Math.PI * 2;
    const direction = this.rng() < 0.5 ? -1 : 1;
    // Search clear water in the measured board hole. A shorter arc fits narrow phone water margins.
    for (const arc of [s.arc, s.arc * 0.6]) for (let i = 0; i < 32; i++) {
      const angle = first + i * Math.PI / 16;
      if ([0, 0.5, 1].every(u => {
        const a = angle + (u - 0.5) * arc * direction;
        return visible(Math.cos(a) * s.radius, Math.sin(a) * s.radius, s.reach);
      })) return { angle, arc, direction };
    }
    return null;
  }

  private begin(species: OceanSpecies, lane: Lane) {
    const s = SETTINGS[species];
    this.active = { ...lane, species, age: 0, duration: s.duration, radius: s.radius };
    this.visits++;
    this.creatures[species].root.visible = true;
    this.creatures[species].wake.visible = true;
    this.pose(this.active);
  }

  step(dt: number, enabled: boolean, view: () => View) {
    if (!enabled) {
      // Frozen (reduced motion, hidden page): a visitor must not stay posed mid-air or mid-spout, so the visit ends.
      if (this.active) {
        const c = this.creatures[this.active.species];
        c.root.visible = false;
        c.wake.visible = false;
        this.active = null;
        this.next = 6;
      }
      return;
    }
    if (dt <= 0) return;
    if (this.active) {
      this.active.age = Math.min(this.active.duration, this.active.age + dt);
      this.pose(this.active);
      if (this.active.age >= this.active.duration) {
        this.creatures[this.active.species].root.visible = false;
        this.creatures[this.active.species].wake.visible = false;
        this.active = null;
        this.next = 20 + this.rng() * 24;
      }
      return;
    }
    this.next -= dt;
    if (this.next > 0) return;
    const roll = this.rng();
    const species: OceanSpecies = roll < 0.55 ? "dolphin" : roll < 0.90 ? "turtle" : "whale";
    const lane = this.lane(species, view());
    if (lane) this.begin(species, lane);
    else this.next = 6 + this.rng() * 4;
  }

  private pose(v: Visit) {
    const u = v.age / v.duration;
    const a = v.angle + (u - 0.5) * v.arc * v.direction;
    const c = this.creatures[v.species];
    // Surface and dive over two seconds: geometry appears through the ocean plane without a popup/fade.
    const visible = Math.min(1, v.age / 2, (v.duration - v.age) / 2);
    c.root.position.set(Math.cos(a) * v.radius, -0.48 + visible * 0.46, Math.sin(a) * v.radius);
    c.root.rotation.y = -a + (v.direction > 0 ? 0 : Math.PI);
    c.root.rotation.x = 0;
    if (c.tail) c.tail.rotation.x = Math.sin(v.age * (v.species === "whale" ? 1.25 : 3.2)) * 0.16;
    if (c.fins) c.fins.forEach((f, i) => f.rotation.z = Math.sin(v.age * 1.7 + i * 0.6) * 0.18 * (i ? 1 : -1));
    if (v.species === "dolphin") {
      const jump = Math.max(0, 1 - Math.abs(v.age - 8) / 1.3);
      c.root.position.y += Math.sin(jump * Math.PI / 2) * 0.42;
      c.root.rotation.x = jump > 0 ? (v.age < 8 ? -0.22 : 0.22) * jump : 0;
    }
    if (c.breath) {
      const puff = Math.max(0, 1 - Math.abs(v.age - 12) / 1.5);
      c.breath.visible = puff > 0;
      c.breath.scale.y = puff;
    }
    c.wake.position.set(c.root.position.x, 0.006, c.root.position.z);
    c.wake.rotation.set(-Math.PI / 2, 0, c.root.rotation.y);
    c.wake.scale.set(1.4 + 0.2 * Math.sin(v.age), 2.2, 1);
    (c.wake.material as THREE.MeshBasicMaterial).opacity = visible * 0.13;
  }

  snapshot() {
    return { visits: this.visits, next: this.next, active: this.active ? { ...this.active } : null, visible: Object.values(this.creatures).filter(c => c.root.visible).length };
  }

  dispose() {
    this.group.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (o.material !== MAT) (o.material as THREE.Material).dispose();
      }
    });
    this.group.removeFromParent();
  }
}
