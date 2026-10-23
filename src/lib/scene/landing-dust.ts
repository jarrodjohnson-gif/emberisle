import * as THREE from "three";

const DUST_N = 8;
const DUST_LIFE = 0.35;
const DUST_SPEED = 0.22;
const DUST_RISE = 0.1;
const MAX_GRAINS = 48;

interface Grain {
  mesh: THREE.Mesh;
  age: number;
  vx: number;
  vy: number;
  vz: number;
  s0: number;
}

const geo = new THREE.SphereGeometry(0.02, 5, 3);
const proto = new THREE.MeshStandardMaterial({ color: 0xd4c0a0, transparent: true, roughness: 1, depthWrite: false });

export class LandingDust {
  private grains: Grain[] = [];
  readonly group = new THREE.Group();
  private puffs = 0;

  constructor() {
    this.group.name = "landing-dust";
  }

  emit(x: number, y: number, z: number) {
    this.puffs++;
    const room = MAX_GRAINS - this.grains.length;
    if (room <= 0) return;
    const n = Math.min(DUST_N, room);
    for (let i = 0; i < n; i++) {
      const a = (i / DUST_N) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const sp = DUST_SPEED * (0.6 + Math.random() * 0.8);
      const mat = proto.clone();
      const mesh = new THREE.Mesh(geo, mat);
      const s0 = 0.5 + Math.random() * 0.5;
      mesh.position.set(x, y + 0.005, z);
      mesh.scale.setScalar(s0);
      this.group.add(mesh);
      this.grains.push({ mesh, age: 0, vx: Math.cos(a) * sp, vy: DUST_RISE * (0.7 + Math.random() * 0.6), vz: Math.sin(a) * sp, s0 });
    }
  }

  step(dt: number) {
    let i = this.grains.length;
    while (i--) {
      const g = this.grains[i]!;
      g.age += dt;
      if (g.age >= DUST_LIFE) {
        this.group.remove(g.mesh);
        (g.mesh.material as THREE.Material).dispose();
        this.grains.splice(i, 1);
        continue;
      }
      const u = g.age / DUST_LIFE;
      g.mesh.position.x += g.vx * dt;
      g.mesh.position.y += g.vy * dt;
      g.mesh.position.z += g.vz * dt;
      g.vy -= 0.4 * dt;
      (g.mesh.material as THREE.MeshStandardMaterial).opacity = 1 - u * u;
      g.mesh.scale.setScalar(g.s0 * (1 + u * 0.6));
    }
  }

  clear() {
    for (const g of this.grains) {
      this.group.remove(g.mesh);
      (g.mesh.material as THREE.Material).dispose();
    }
    this.grains = [];
    this.puffs = 0;
  }

  dispose() {
    this.clear();
    this.group.parent?.remove(this.group);
  }

  get active() {
    return this.grains.length > 0;
  }

  get count() {
    return this.grains.length;
  }

  get puffCount() {
    return this.puffs;
  }
}
