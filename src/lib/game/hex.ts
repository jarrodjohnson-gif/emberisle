export const HEX_SIZE = 1.12;
export const SQRT3 = Math.sqrt(3);

export function axialKey(q: number, r: number) {
  return `${q},${r}`;
}

export function parseKey(k: string): { q: number; r: number } {
  const [q, r] = k.split(",").map(Number);
  return { q, r };
}

export function hexToWorld(q: number, r: number, size = HEX_SIZE) {
  const x = size * SQRT3 * (q + r / 2);
  const z = size * (3 / 2) * r;
  return { x, z };
}

export function cubeDist(a: { q: number; r: number }, b: { q: number; r: number }) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export const AXIAL_DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function hexesInRadius(radius: number) {
  const out: { q: number; r: number }[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

export function hexCorners(q: number, r: number, size = HEX_SIZE) {
  const c = hexToWorld(q, r, size);
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: c.x + size * Math.cos(angle), z: c.z + size * Math.sin(angle) });
  }
  return pts;
}

export function roundCoord(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function vertexId(x: number, z: number) {
  return `${roundCoord(x)},${roundCoord(z)}`;
}

export function edgeId(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function parseVertex(id: string) {
  const [x, z] = id.split(",").map(Number);
  return { x, z };
}
