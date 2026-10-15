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
// Two small schools circle under the shallows just off the coast (crystal-water.md "Touch the sea"). A splash within `reach`
// sends a fish (or the visitor) darting away from it over `dart` s; it holds there until `hold` and is back on its round by `back`.
const FISH = { schools: 2, per: 5, radius: 5.75, orbit: 0.28, speed: 0.5, y: -0.1 } as const;
const SCATTER = { reach: 1.5, dart: 0.25, hold: 1.5, back: 4, far: 0.9 } as const;
type Flee = { dx: number; dz: number; age: number };

export function part(geo: THREE.BufferGeometry, colour: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
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

// How far along its dart a scattered animal is: out fast, a hold, then an eased return.
function fled(f: Flee | null) {
  if (!f || f.age >= SCATTER.back) return 0;
  if (f.age < SCATTER.dart) return 1 - (1 - f.age / SCATTER.dart) ** 2;
  if (f.age < SCATTER.hold) return 1;
  return 1 - THREE.MathUtils.smoothstep(f.age, SCATTER.hold, SCATTER.back);
}

// Away from the splash at (sx, sz), never toward the island: the inward part of the dart is dropped.
function flee(x: number, z: number, sx: number, sz: number): Flee | null {
  const d = Math.hypot(x - sx, z - sz);
  if (d > SCATTER.reach) return null;
  let dx = d > 1e-3 ? (x - sx) / d : x, dz = d > 1e-3 ? (z - sz) / d : z;
  const r = Math.hypot(x, z) || 1, radial = (dx * x + dz * z) / r;
  if (radial < 0) [dx, dz] = [dx - (radial * x) / r, dz - (radial * z) / r];
  const l = Math.hypot(dx, dz) || 1;
  const far = SCATTER.far * (0.5 + 0.5 * (1 - d / SCATTER.reach));
  return { dx: (dx / l) * far, dz: (dz / l) * far, age: 0 };
}

function fishMesh() {
  const { geometry } = merge([
    part(new THREE.SphereGeometry(1, 6, 4), 0xf2a25a, 0, 0, 0, 0.022, 0.02, 0.05),
    part(new THREE.ConeGeometry(0.018, 0.035, 4).rotateX(-Math.PI / 2), 0xe07f3c, 0, 0, -0.06),
  ]);
  const mesh = new THREE.InstancedMesh(geometry, MAT, FISH.schools * FISH.per);
  mesh.name = "fish";
  // The instances move every frame; the bounds three caches would cull them by where they first were.
  mesh.frustumCulled = false;
  return mesh;
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
  // The height of the sea's waves at a point, so a surfaced animal and its wake ride them (crystal-water.md).
  private surface: (x: number, z: number) => number = () => 0;
  // The schools, apart from the visitors' group (the visitor budget counts that one), and the visitor's dart.
  readonly fish = new THREE.Group();
  private fishMesh = fishMesh();
  private schools: { angle: number; turn: number }[] = [];
  private fishFlee: (Flee | null)[] = Array.from({ length: FISH.schools * FISH.per }, () => null);
  private fishTime = 0;
  private visitorFlee: Flee | null = null;
  private dummy = new THREE.Object3D();

  constructor() {
    this.group.name = "ocean-life";
    for (const [species, c] of Object.entries(this.creatures)) {
      c.root.name = species;
      c.root.visible = false;
      c.wake.visible = false;
      c.root.userData = { ambient: true, species };
      this.group.add(c.root, c.wake);
    }
    this.fish.name = "fish";
    this.fish.add(this.fishMesh);
    this.seedFish("");
  }

  private seedFish(seed: string) {
    const fr = mulberry32(hashStr(`fish:${seed}`));
    const first = fr() * Math.PI * 2;
    this.schools = Array.from({ length: FISH.schools }, (_, i) => ({ angle: first + (i * Math.PI * 2) / FISH.schools + (fr() - 0.5), turn: fr() < 0.5 ? -1 : 1 }));
    this.fishFlee.fill(null);
    this.visitorFlee = null;
    this.fishTime = 0;
    this.swim();
  }

  reset(seed: string) {
    this.rng = mulberry32(hashStr(`ocean:${seed}`));
    this.next = 8 + this.rng() * 8;
    this.active = null;
    this.visits = 0;
    this.seedFish(seed);
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

  step(dt: number, enabled: boolean, view: () => View, surface: (x: number, z: number) => number = () => 0) {
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
    this.surface = surface;
    this.fishTime += dt;
    for (const f of this.fishFlee) if (f) f.age += dt;
    if (this.visitorFlee) this.visitorFlee.age += dt;
    this.swim();
    if (this.active) {
      this.active.age = Math.min(this.active.duration, this.active.age + dt);
      this.pose(this.active);
      if (this.active.age >= this.active.duration) {
        this.creatures[this.active.species].root.visible = false;
        this.creatures[this.active.species].wake.visible = false;
        this.active = null;
        this.visitorFlee = null;
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

  /** A splash at (x, z): fish and the visitor within reach dart away from it, and come back a few seconds later. */
  scatter(x: number, z: number) {
    this.fishAt().forEach((p, i) => {
      const f = flee(p.x, p.z, x, z);
      if (f) this.fishFlee[i] = f;
    });
    const root = this.active && this.creatures[this.active.species].root;
    const f = root && flee(root.position.x, root.position.z, x, z);
    if (f) this.visitorFlee = f;
  }

  /** Where each fish is now, for the scatter and the proof. */
  fishAt() {
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    return Array.from({ length: this.fishMesh.count }, (_, i) => {
      this.fishMesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      return { x: p.x, z: p.z };
    });
  }

  // Each school follows its leader round a small circle; a scattered fish is carried off its place and faces its dart.
  private swim() {
    const d = this.dummy;
    this.schools.forEach((s, si) => {
      const cx = Math.cos(s.angle) * FISH.radius, cz = Math.sin(s.angle) * FISH.radius;
      for (let j = 0; j < FISH.per; j++) {
        const i = si * FISH.per + j;
        const a = s.turn * (this.fishTime * FISH.speed - j * 0.32) + si;
        const r = FISH.orbit * (1 + 0.15 * Math.sin(this.fishTime * 0.7 + j));
        const f = this.fishFlee[i] ?? null, u = fled(f);
        d.position.set(cx + Math.cos(a) * r + (f ? f.dx * u : 0), FISH.y + 0.01 * Math.sin(this.fishTime * 2 + j), cz + Math.sin(a) * r + (f ? f.dz * u : 0));
        // Along the circle (its tangent), or along the dart while it is going out.
        const darting = f && f.age < SCATTER.hold;
        d.rotation.set(0, darting ? Math.atan2(f.dx, f.dz) : Math.atan2(-Math.sin(a) * s.turn, Math.cos(a) * s.turn), 0);
        d.updateMatrix();
        this.fishMesh.setMatrixAt(i, d.matrix);
      }
    });
    this.fishMesh.instanceMatrix.needsUpdate = true;
  }

  private pose(v: Visit) {
    const u = v.age / v.duration;
    const a = v.angle + (u - 0.5) * v.arc * v.direction;
    const c = this.creatures[v.species];
    // Surface and dive over two seconds: geometry appears through the ocean plane without a popup/fade.
    const visible = Math.min(1, v.age / 2, (v.duration - v.age) / 2);
    // A visitor startled by a splash darts off its lane and dips, then comes back to it.
    const f = this.visitorFlee, off = fled(f);
    const x = Math.cos(a) * v.radius + (f ? f.dx * off : 0), z = Math.sin(a) * v.radius + (f ? f.dz * off : 0);
    const sea = this.surface(x, z);
    c.root.position.set(x, -0.48 + visible * (0.46 + sea) - 0.15 * off, z);
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
    c.wake.position.set(c.root.position.x, 0.006 + sea, c.root.position.z);
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
    this.fishMesh.geometry.dispose();
    this.fishMesh.dispose();
    this.fish.removeFromParent();
  }
}
