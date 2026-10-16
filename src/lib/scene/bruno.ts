// The wayfarer piece (the owner, 2026-10-16: "a sneaky lil b… like Bruno"): a short, hunched, sneaky little man in a
// hooded poncho (deep green, a gold diamond band), a scruffy beard under the hood, big wary eyes, sandals, a rat on his
// shoulder and a lantern in his hand. The same figure the waste's scene was designed with (hex-jelly.ts), built here on its
// own so the board's piece needs none of the scenes' chunk; full and lite boards both use it. He faces +z (the renderer's
// lookAt turns him toward where he walks). Idle, he tiptoes and peeks left and right; walking, he hunches forward and
// scurries.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type V3 = [number, number, number];

// A part: a geometry, coloured, placed by position, rotation (XYZ) and scale; non-indexed so any mix merges.
function part(g: THREE.BufferGeometry, hex: string, p: V3, r: V3 = [0, 0, 0], k: V3 = [1, 1, 1]) {
  const geo = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(
    new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...k)),
  );
  geo.deleteAttribute("uv");
  const c = new THREE.Color(hex);
  const a = new Float32Array(geo.attributes.position!.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  for (const p of parts) p.dispose();
  return g;
};
const sphere = (n: number) => new THREE.SphereGeometry(1, n, Math.max(6, Math.round(n * 0.7)));
const cyl = (rt: number, rb: number, n: number) => new THREE.CylinderGeometry(rt, rb, 1, n);

// Board size: about 0.55 tall, as the piece he replaces.
const SCALE = 5.6;

export type Bruno = { g: THREE.Group; lantern: THREE.MeshStandardMaterial; update(t: number, walking: boolean): void; dispose(): void };

export function makeBruno(): Bruno {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffcf6a, emissive: 0xff9a2e, emissiveIntensity: 1.6, roughness: 0.3 });
  const geos: THREE.BufferGeometry[] = [];
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material = mat) => {
    geos.push(geo);
    const me = new THREE.Mesh(geo, m);
    me.castShadow = true;
    return me;
  };
  // He stands on a round dark base, a game piece's, so he reads on every hex from the overhead view (a green poncho alone
  // would sink into a forest).
  const base = mesh(merge([part(cyl(1, 1.06, 28), "#2b2420", [0, 0.012, 0], [0, 0, 0], [0.15, 0.024, 0.15]), part(cyl(1, 1, 28), "#e2b84a", [0, 0.025, 0], [0, 0, 0], [0.135, 0.003, 0.135])]));
  base.receiveShadow = true;
  g.add(base);
  // Built facing +x (as in the waste's scene), turned to face +z, standing on the base.
  const w = new THREE.Group();
  w.rotation.y = -Math.PI / 2;
  w.scale.setScalar(SCALE);
  w.position.y = 0.027;
  g.add(w);
  const poncho = new THREE.LatheGeometry([[0, 0.03], [0.028, 0.03], [0.026, 0.045], [0.02, 0.065], [0.012, 0.075], [0, 0.078]].map(([x, y]) => new THREE.Vector2(x!, y!)), 18);
  const legs = [0.007, -0.007].map((z) => {
    const leg = mesh(
      merge([
        part(cyl(0.004, 0.004, 6), "#4a3a30", [0, -0.014, 0], [0, 0, 0], [1, 0.03, 1]),
        part(new THREE.BoxGeometry(1, 1, 1), "#7a5434", [0.003, -0.028, 0], [0, 0, 0], [0.012, 0.003, 0.006]),
      ]),
    );
    leg.position.set(0.002, 0.03, z);
    w.add(leg);
    return leg;
  });
  const body: THREE.BufferGeometry[] = [part(poncho, "#2f6a4a", [0, 0, 0])];
  // The gold diamond band round the poncho.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    body.push(part(new THREE.OctahedronGeometry(1, 0), "#e2b84a", [Math.cos(a) * 0.0262, 0.042, Math.sin(a) * 0.0262], [0, -a, 0], [0.0012, 0.0045, 0.0035]));
  }
  body.push(part(new THREE.TorusGeometry(0.026, 0.0012, 4, 24), "#e2b84a", [0, 0.036, 0], [Math.PI / 2, 0, 0]));
  const torso = new THREE.Group();
  torso.add(mesh(merge(body)));
  w.add(torso);
  const head = new THREE.Group();
  head.position.set(0.006, 0.08, 0);
  head.add(
    mesh(
      merge([
        // The hood, drawn up behind and over a big face so it reads from above.
        part(sphere(16), "#2a5e42", [-0.006, 0.01, 0], [0, 0, 0.35], [0.018, 0.021, 0.019]),
        part(sphere(12), "#2a5e42", [0.004, 0.02, 0], [0, 0, 0], [0.013, 0.006, 0.014]),
        // Face peeking out: skin, a scruffy beard and curls, big wary eyes, a big nose.
        part(sphere(14), "#d8a07a", [0.01, 0.004, 0], [0, 0, 0], [0.011, 0.012, 0.012]),
        part(sphere(12), "#3a2a22", [0.013, -0.006, 0], [0, 0, 0], [0.009, 0.007, 0.011]),
        part(sphere(8), "#2a1e18", [0.004, 0.016, 0.009], [0, 0, 0], [0.005, 0.004, 0.004]),
        part(sphere(8), "#2a1e18", [0.004, 0.016, -0.009], [0, 0, 0], [0.005, 0.004, 0.004]),
        part(sphere(10), "#ffffff", [0.019, 0.008, 0.0055], [0, 0, 0], [0.0036, 0.0044, 0.0036]),
        part(sphere(10), "#ffffff", [0.019, 0.008, -0.0055], [0, 0, 0], [0.0036, 0.0044, 0.0036]),
        part(sphere(8), "#1a1414", [0.0222, 0.008, 0.005], [0, 0, 0], [0.0018, 0.0022, 0.0018]),
        part(sphere(8), "#1a1414", [0.0222, 0.008, -0.005], [0, 0, 0], [0.0018, 0.0022, 0.0018]),
        part(sphere(8), "#c88a64", [0.022, 0.002, 0], [0, 0, 0], [0.0038, 0.0042, 0.0034]),
      ]),
    ),
  );
  torso.add(head);
  // The rat on his shoulder, nose twitching.
  const rat = new THREE.Group();
  rat.position.set(-0.004, 0.072, 0.016);
  rat.add(
    mesh(
      merge([
        part(sphere(10), "#7a6e66", [0, 0.004, 0], [0, 0, 0], [0.009, 0.005, 0.005]),
        part(sphere(8), "#7a6e66", [0.009, 0.006, 0], [0, 0, 0], [0.004, 0.0035, 0.0035]),
        part(sphere(6), "#e8a8a8", [0.007, 0.01, 0.003], [0, 0, 0], [0.002, 0.002, 0.0012]),
        part(sphere(6), "#e8a8a8", [0.007, 0.01, -0.003], [0, 0, 0], [0.002, 0.002, 0.0012]),
        part(sphere(6), "#1a1414", [0.012, 0.007, 0.002], [0, 0, 0], [0.0008, 0.0008, 0.0008]),
        part(cyl(0.0008, 0.0006, 4), "#c8a0a0", [-0.014, 0.003, 0], [0, 0, 1.3], [1, 0.018, 1]),
      ]),
    ),
  );
  torso.add(rat);
  // The lantern hanging from his hand.
  const lantern = new THREE.Group();
  lantern.position.set(0.02, 0.04, -0.016);
  lantern.add(mesh(merge([part(new THREE.BoxGeometry(1, 1, 1), "#2a2420", [0, 0.008, 0], [0, 0, 0], [0.007, 0.002, 0.007]), part(cyl(0.0006, 0.0006, 4), "#2a2420", [0, 0.012, 0], [0, 0, 0], [1, 0.008, 1])])));
  const flame = mesh(new THREE.SphereGeometry(0.0042, 10, 8), lanternMat);
  flame.castShadow = false;
  lantern.add(flame);
  torso.add(lantern);

  let lean = 0;
  return {
    g,
    lantern: lanternMat,
    update(t: number, walking: boolean) {
      // Walking he hunches forward and scurries; idle he tiptoes and peeks left, pauses, peeks right.
      lean += ((walking ? 0.35 : 0.06) - lean) * 0.2;
      const peek = walking ? 0 : Math.sin(t * 0.9) > 0.3 ? 1 : Math.sin(t * 0.9) < -0.3 ? -1 : 0;
      const step = walking ? 16 : 4;
      torso.rotation.set(0, 0.25 * peek, -lean - 0.03 * Math.sin(t * step));
      head.rotation.set(0, 0.7 * peek, -0.15 + (walking ? 0.2 : 0));
      torso.position.y = 0.002 * Math.abs(Math.sin(t * step));
      legs.forEach((l, i) => (l.rotation.z = (walking ? 0.6 : 0.08) * Math.sin(t * step + (i ? Math.PI : 0))));
      rat.rotation.y = 0.5 * Math.sin(t * 2.3);
      rat.position.y = 0.072 + 0.0015 * Math.max(0, Math.sin(t * 9)) ** 4;
      lantern.rotation.z = (walking ? 0.5 : 0.25) * Math.sin(t * (walking ? 6 : 1.8));
      flame.scale.setScalar(1 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3));
    },
    dispose() {
      for (const geo of geos) geo.dispose();
      mat.dispose();
      lanternMat.dispose();
    },
  };
}
