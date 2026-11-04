// #758 (#641, docs/design/classic-board.md): the restored Classic land builder, proven on its own, against the actual module
// (src/lib/scene/classic-board.ts, terrain-classic.ts) and the installed three.js, in a software-GL Chromium. No renderer, no store, no
// game: the builder is given hexes and a seed and handed a scene of its own.
// - all six terrains built in full and lite from a real deal, and the same deal with a hole and a missing corner;
// - deterministic geometry and animation (the same seed gives the same bytes, another seed does not);
// - real shader compilation (the tile and prop hooks over three's own chunks, every program linked and runnable, a frame drawn);
// - token clearance (nothing of the props within 0.31 of a hex's centre, through a run of the animation);
// - constant-plane supports (the ground under the token, at the corners and at the edge midpoints is exactly at the block height);
// - coastal seams (the coast from canonical axial neighbours, the beach only there, the body watertight, neighbours' lips meeting);
// - clay-pit apron coverage at each resolution, from above and at grazing angles;
// - glow, blocking, motion, reduced motion, camera-dependent occlusion of the numerals;
// - cancellation, cache ownership, repeated disposal and bounded GPU resources;
// - no game-state, RNG, picking or shared-scene mutation;
// and it records the measured geometry and the Classic code's gzip size. Run: npm run classic-builder-prove
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { build, createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8197;
const ROOT = fileURLToPath(new URL("..", import.meta.url));

// The page's side of the proof. Its free names are the imports of the module below; it runs only in the browser.
async function proofInPage() {
  const checks = [];
  const measures = {};
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const pause = async () => true;
  const TILE_Y = 0.04;
  const SEED = 2026;
  // The tile's constants (terrain-classic.ts) the proof reads the geometry by: the bevel's segments, and the skirt below the base.
  const BEVEL_SEGS = 3;
  const SKIRT = 0.04;
  const SHORE_DIP = 0.016;
  const SQ3 = Math.sqrt(3);
  const TOP = 1.12 * 0.995 - 0.06;
  const TOP_INR = (TOP * SQ3) / 2;
  const CLEAR = 0.31;
  const FULL_R = 18;
  const LITE_R = 12;
  const TOKEN_R = 0.26;
  const PLANE = 5e-6;
  const hexDist = (x, z) => Math.max(Math.abs(x), Math.abs(0.5 * x + (SQ3 / 2) * z), Math.abs(0.5 * x - (SQ3 / 2) * z));

  // --- fixtures: a real deal, every terrain, in the renderer's world
  const dealOf = (seed) => createGame({ seed, humans: [{ name: "Elm" }], bots: 0 });
  const game = dealOf(11);
  const gameBefore = JSON.stringify(game);
  const hexesOf = (state) => state.hexes.map((h) => ({ id: h.id, terrain: h.terrain, q: h.q, r: h.r, ...hexToWorld(h.q, h.r), y: TILE_Y }));
  const HEXES = hexesOf(game);
  const deepFreeze = (o) => (Object.values(o).forEach((v) => typeof v === "object" && v && deepFreeze(v)), Object.freeze(o));
  deepFreeze(HEXES);
  const KINDS = ["timber", "wool", "grain", "clay", "ore", "waste"];
  check("fixture: the deal has all six terrains and 19 hexes", HEXES.length === 19 && KINDS.every((k) => HEXES.some((h) => h.terrain === k)), HEXES.map((h) => h.terrain[0]).join(""));
  // Same deal with a hole in the middle and a corner missing: their neighbours' edges face the sea.
  const HOLEY = HEXES.filter((h) => !(h.q === 0 && h.r === 0) && !(h.q === 2 && h.r === -2));

  const make = (hexes, seed, quality, p = pause) => ClassicBoard.create(hexes, seed, p, quality);
  const FULL = await make(HEXES, SEED, "full");
  const LITE = await make(HEXES, SEED, "lite");
  const bodyOf = (R) => 18 * R * R + 288 * R;
  const tileOf = (board, id) => board.group.getObjectByName(`classic-hex-${id}`);
  const drawn = (board) => {
    const out = [];
    board.group.updateMatrixWorld(true);
    board.group.traverse((o) => o.isMesh && o.visible && out.push(o));
    return out;
  };
  const props = (board) => drawn(board).filter((m) => !m.name.startsWith("classic-hex-"));
  const bytes = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const fnv = (h, arr) => {
    const u = ArrayBuffer.isView(arr) ? bytes(arr) : bytes(Float64Array.from(arr));
    for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
    return h >>> 0;
  };
  // Every byte of the build: each mesh's geometry, placement and instances, and the proxies that carry the props' poses.
  const hashOf = (board) => {
    let h = 2166136261;
    board.group.updateMatrixWorld(true);
    board.group.traverse((o) => {
      if (o.isMesh) {
        for (const name of Object.keys(o.geometry.attributes).sort()) h = fnv(h, o.geometry.attributes[name].array);
        if (o.geometry.index) h = fnv(h, o.geometry.index.array);
        if (o.isInstancedMesh) h = fnv(h, o.instanceMatrix.array.subarray(0, o.count * 16));
      }
      h = fnv(h, o.matrix.elements);
    });
    return h;
  };
  const poseHash = (board) => {
    let h = 2166136261;
    board.group.traverse((o) => {
      if (o.isMesh && !o.visible) h = fnv(h, [...o.position.toArray(), ...o.rotation.toArray().slice(0, 3), ...o.scale.toArray()]);
      if (o.isInstancedMesh) h = fnv(h, o.instanceMatrix.array.subarray(0, o.count * 16));
    });
    return h;
  };
  const run = (board, from, to, dt = 0.1) => {
    for (let t = from + dt; t <= to + 1e-9; t += dt) board.update(t);
    return to;
  };

  // --- 1. all six terrains in full and lite
  const sFull = FULL.stats();
  const sLite = LITE.stats();
  check("1 full build: 18 rings, 19 hexes, props drawn", sFull.quality === "full" && sFull.rings === 18 && sFull.hexes === 19 && sFull.drawCalls > 19, JSON.stringify(sFull));
  check("1 lite build: 12 rings, 19 hexes, the ground alone (one draw per hex)", sLite.quality === "lite" && sLite.rings === LITE_R && sLite.hexes === 19 && sLite.drawCalls === 19 && props(LITE).length === 0, JSON.stringify(sLite));
  check("1 lite draws fewer triangles than full", sLite.triangles < sFull.triangles / 2, `${sLite.triangles} vs ${sFull.triangles}`);
  check("1 every hex has its tile, standing at the hex's base", HEXES.every((h) => [FULL, LITE].every((b) => { const m = tileOf(b, h.id); return m && m.position.x === h.x && m.position.z === h.z && m.position.y === h.y; })));
  const kindStats = {};
  for (const k of KINDS) {
    const one = HEXES.filter((h) => h.terrain === k).slice(0, 1);
    const tri = (b) => tileOf(b, one[0].id).geometry.index.count / 3;
    kindStats[k] = { full: tri(FULL), lite: tri(LITE) };
  }
  measures.perTerrainTileTriangles = kindStats;
  measures.full = { ...sFull };
  measures.lite = { ...sLite };

  // --- 2. determinism
  const hFull = hashOf(FULL);
  const hLite = hashOf(LITE);
  const t0 = performance.now();
  const FULL2 = await make(HEXES, SEED, "full");
  measures.fullBuildMs = Math.round(performance.now() - t0);
  const t1 = performance.now();
  const LITE2 = await make(HEXES, SEED, "lite");
  measures.liteBuildMs = Math.round(performance.now() - t1);
  const FULL3 = await make(HEXES, SEED + 1, "full");
  check("2 full geometry is deterministic for a seed", hashOf(FULL2) === hFull, `${hFull.toString(16)}`);
  check("2 lite geometry is deterministic for a seed", hashOf(LITE2) === hLite, `${hLite.toString(16)}`);
  check("2 another seed gives another island", hashOf(FULL3) !== hFull);
  check("2 the ground is the same at every quality (only the lattice differs)", HEXES.every((h) => [[0, 0], [0.4, 0.3], [-0.7, 0.2], [0.1, -0.8]].every(([x, z]) => FULL.groundAt(h.id, x, z) === LITE.groundAt(h.id, x, z))));
  FULL3.dispose();

  // --- 3. shader compilation, on a real renderer
  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(256, 256, false);
  renderer.shadowMap.enabled = true;
  renderer.debug.checkShaderErrors = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x203040);
  scene.add(new THREE.HemisphereLight(0xdff6f4, 0xc9b58f, 0.52));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
  sun.position.set(-0.82, 1.43, 0.57).multiplyScalar(10);
  sun.castShadow = true;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
  sun.shadow.camera.right = sun.shadow.camera.top = 6;
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 80);
  const at = (az, dist = 14, polar = (52 * Math.PI) / 180) => {
    camera.position.setFromSphericalCoords(dist, polar, az).add(new THREE.Vector3(0, 0.35, 0));
    camera.lookAt(0, 0.35, 0);
    camera.updateMatrixWorld(true);
  };
  at((20 * Math.PI) / 180);
  const chunkBefore = THREE.ShaderChunk.lights_physical_pars_fragment;
  const logs = [];
  const baseError = console.error;
  console.error = (...a) => (logs.push(a.join(" ")), baseError(...a));
  const baseWarn = console.warn;
  console.warn = (...a) => (logs.push(a.join(" ")), baseWarn(...a));
  const ownedBase = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  const paint = (board) => {
    scene.add(board.group);
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const px = new Uint8Array(256 * 256 * 4);
    gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - 0x20) + Math.abs(px[i + 1] - 0x30) + Math.abs(px[i + 2] - 0x40) > 24) lit++;
    return lit;
  };
  const litFull = paint(FULL);
  const programs = [...renderer.info.programs];
  const keyed = (frag) => programs.filter((p) => p.cacheKey.includes(frag));
  check("3 the tile and prop programs both compiled", keyed("sculpted-tile").length >= 1 && keyed("toon-prop").length >= 1, programs.map((p) => p.name).join(","));
  // three keeps diagnostics only for a program with something in a log; one that linked clean has none.
  check("3 every program is linked and runnable, with empty shader logs", programs.length > 0 && programs.every((p) => p.isReady() && (!p.diagnostics || (p.diagnostics.runnable && !p.diagnostics.programLog))), `${programs.length} programs`);
  check("3 a frame of the full board covers the view (not blank)", litFull > 256 * 256 * 0.1, `${litFull} px`);
  scene.remove(FULL.group);
  const litLite = paint(LITE);
  check("3 a frame of the lite board covers the view", litLite > 256 * 256 * 0.1, `${litLite} px`);
  scene.remove(LITE.group);
  // The hooks, over three's own chunks: the toon ramp on the key lamp's diffuse, the sheen, the glow on the top.
  const probe = { vertexShader: THREE.ShaderChunk.meshphysical_vert, fragmentShader: THREE.ShaderChunk.meshphysical_frag };
  const material = tileOf(FULL, HEXES[0].id).material;
  material.onBeforeCompile(probe);
  check("3 the tile hooks land in three's shaders", probe.fragmentShader.includes("toonStep( dotNL ) * directLight.color") && probe.fragmentShader.includes("pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 )") && probe.fragmentShader.includes("totalEmissiveRadiance *= vGlow") && probe.vertexShader.includes("vGlow = aGlow"));
  check("3 no shader or program error was logged", logs.length === 0, logs.join(" | "));
  check("3 three's own shader chunk is untouched", THREE.ShaderChunk.lights_physical_pars_fragment === chunkBefore && !chunkBefore.includes("toonStep"));

  // --- 4. token clearance, through a run of the animation
  const clearanceOf = (board) => {
    let min = Infinity;
    let what = "";
    const v = new THREE.Vector3();
    const m4 = new THREE.Matrix4();
    for (const mesh of props(board)) {
      const pos = mesh.geometry.getAttribute("position");
      const n = mesh.isInstancedMesh ? mesh.count : 1;
      for (let j = 0; j < n; j++) {
        mesh.isInstancedMesh ? (mesh.getMatrixAt(j, m4), m4.premultiply(mesh.matrixWorld)) : m4.copy(mesh.matrixWorld);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m4);
          for (const h of HEXES) {
            const d = Math.hypot(v.x - h.x, v.z - h.z);
            if (d > 0.9) continue;
            if (d < min) (min = d), (what = mesh.name);
          }
        }
      }
    }
    return { min, what };
  };
  const clear = [];
  let tNow = 0;
  for (const until of [0, 6, 20, 45]) {
    tNow = run(FULL, tNow, until);
    clear.push(clearanceOf(FULL));
  }
  const worst = clear.reduce((a, b) => (b.min < a.min ? b : a));
  check(`4 nothing of the props within ${CLEAR} of a hex's centre, through 45 s of motion`, worst.min >= CLEAR, `nearest ${worst.min.toFixed(3)} (${worst.what})`);
  check("4 reduced-motion pose is clear too", (FULL.update(50, true, true), clearanceOf(FULL).min >= CLEAR));
  measures.nearestProp = +worst.min.toFixed(3);

  // --- 5. constant-plane supports, read off the rendered triangles
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const topAt = (board, h, lx, lz, R) => {
    const m = tileOf(board, h.id);
    ray.set(new THREE.Vector3(h.x + lx, 4, h.z + lz), down);
    const hit = ray.intersectObject(m, false).find((x) => x.faceIndex * 3 < bodyOf(R));
    return hit ? hit.point.y - h.y : NaN;
  };
  const disc = (cx, cz, r, rings = 2, around = 8) => {
    const out = [[cx, cz]];
    for (let i = 1; i <= rings; i++) for (let a = 0; a < around; a++) out.push([cx + Math.cos((a / around) * Math.PI * 2) * r * (i / rings), cz + Math.sin((a / around) * Math.PI * 2) * r * (i / rings)]);
    return out;
  };
  // The supports: the token's disc, and the rim where pieces stand. At each corner, the top's tip and points 0.02 to 0.055 along
  // the two edges that meet there; at each edge midpoint, points 0.1 either side along the edge and 0.03 in from it.
  const supportsOf = () => {
    const out = [["token", disc(0, 0, TOKEN_R)]];
    for (let k = 0; k < 6; k++) {
      const c = ((30 + 60 * k) * Math.PI) / 180;
      const tip = [Math.cos(c) * (TOP - 0.002), Math.sin(c) * (TOP - 0.002)];
      const rimCorner = [tip];
      // The corner at 30 + 60 k degrees is the end of the edges facing 60 k and 60 (k + 1) degrees.
      for (const flat of [k, k + 1]) {
        const a = (60 * flat * Math.PI) / 180;
        const tangent = [-Math.sin(a), Math.cos(a)];
        const sign = Math.sign(-(tip[0] * tangent[0] + tip[1] * tangent[1]));
        for (const t of [0.02, 0.04, 0.055]) rimCorner.push([tip[0] + sign * tangent[0] * t, tip[1] + sign * tangent[1] * t]);
      }
      out.push(["corner", rimCorner]);
      const f = (60 * k * Math.PI) / 180;
      const rimMid = [];
      for (const lateral of [-0.1, -0.05, 0, 0.05, 0.1]) for (const inward of [0.002, 0.03]) rimMid.push([Math.cos(f) * (TOP_INR - inward) - Math.sin(f) * lateral, Math.sin(f) * (TOP_INR - inward) + Math.cos(f) * lateral]);
      out.push(["edge", rimMid]);
    }
    return out;
  };
  const planeReport = {};
  for (const [name, board, R] of [["full", FULL, FULL_R], ["lite", LITE, LITE_R]]) {
    let worstDev = 0;
    let worstWhere = "";
    let samples = 0;
    const by = {};
    for (const h of HEXES) {
      for (const [what, pts] of supportsOf()) {
        for (const [lx, lz] of pts) {
          if (hexDist(lx, lz) > TOP_INR - 0.001) continue;
          const dev = Math.abs(topAt(board, h, lx, lz, R) - BLOCK_H);
          samples++;
          const key = `${h.terrain} ${what}`;
          by[key] = Math.max(by[key] ?? 0, dev);
          if (!(dev <= worstDev)) (worstDev = dev), (worstWhere = `${h.id} ${what} ${lx.toFixed(2)},${lz.toFixed(2)}`);
        }
      }
      const g = board.groundAt(h.id, 0, 0);
      if (Math.abs(g - (h.y + BLOCK_H)) > PLANE) (worstDev = Math.max(worstDev, Math.abs(g - (h.y + BLOCK_H)))), (worstWhere = `${h.id} groundAt`);
    }
    planeReport[name] = { samples, worstDev, worstWhere, by };
    check(`5 ${name}: token pad, corners and edge midpoints lie on the block plane (${samples} samples)`, samples > 1000 && worstDev <= PLANE, `worst ${worstDev.toExponential(2)} at ${worstWhere || "-"}`);
  }
  measures.planeDeviation = planeReport;
  check("5 groundAt: finite at a hex, NaN for an id it does not have", Number.isFinite(FULL.groundAt(HEXES[3].id, 0.5, 0.2)) && Number.isNaN(FULL.groundAt("no-such-hex", 0, 0)) && Number.isNaN(LITE.groundAt("9,9", 0, 0)));

  // --- 6. coastal seams
  const edgeReport = (board, hexes, R, label) => {
    const bad = [];
    let coastEdges = 0;
    for (const h of hexes) {
      const pos = tileOf(board, h.id).geometry.getAttribute("position");
      const col = tileOf(board, h.id).geometry.getAttribute("color");
      const count = 3 * R * (R + 1) + 1;
      for (let k = 0; k < 6; k++) {
        const [nx, nz] = [Math.cos((60 * k * Math.PI) / 180), Math.sin((60 * k * Math.PI) / 180)];
        // The neighbour across edge k, by where the world puts it.
        const across = hexes.some((o) => Math.hypot(o.x - (h.x + nx * SQ3 * 1.12), o.z - (h.z + nz * SQ3 * 1.12)) < 0.01);
        const sea = !across;
        if (sea) coastEdges++;
        // The lattice's boundary vertices strictly inside edge k.
        let sand = 0;
        let inside = 0;
        for (let i = 0; i < count; i++) {
          const [x, z] = [pos.getX(i), pos.getZ(i)];
          const onEdge = Math.abs(x * nx + z * nz - TOP_INR) < 1e-4;
          const onOther = [1, 5].some((d) => { const a = (60 * ((k + d) % 6) * Math.PI) / 180; return Math.abs(x * Math.cos(a) + z * Math.sin(a) - TOP_INR) < 1e-4; });
          if (!onEdge || onOther) continue;
          inside++;
          const s = new THREE.Color("#ecdbb2");
          if (Math.abs(col.getX(i) - s.r) + Math.abs(col.getY(i) - s.g) + Math.abs(col.getZ(i) - s.b) < 1e-3) sand++;
        }
        // The beach is sand along the whole of a sea edge, and nowhere on an edge with a neighbour.
        const ok = inside === R - 1 && (sea ? sand === inside : sand === 0);
        if (!ok) bad.push(`${h.id}/${k} sea=${sea} inside=${inside} sand=${sand}`);
      }
    }
    return { label, bad, coastEdges };
  };
  const reports = [edgeReport(FULL, HEXES, FULL_R, "full"), edgeReport(LITE, HEXES, LITE_R, "lite")];
  const HOLE_LITE = await make(HOLEY, SEED, "lite");
  const HOLE_FULL = await make(HOLEY, SEED, "full");
  reports.push(edgeReport(HOLE_LITE, HOLEY, LITE_R, "lite with a hole"), edgeReport(HOLE_FULL, HOLEY, FULL_R, "full with a hole"));
  for (const r of reports) check(`6 ${r.label}: a sand beach on exactly the edges with no neighbour (${r.coastEdges} sea edges)`, r.bad.length === 0 && r.coastEdges > 0, r.bad.slice(0, 3).join("; "));
  // The beach's dip, alone: the same hex with and without a sea edge. Up to SHORE_DIP deep along the edge, nothing where pieces
  // stand, nothing past 0.11 in.
  const shoreCache = terrainCache();
  const shore = [];
  for (const R of [LITE_R, FULL_R]) for (const t of KINDS) for (let k = 0; k < 6; k++) {
    const sea = [0, 1, 2, 3, 4, 5].map((j) => j === k);
    const [a, b] = [false, true].map((on) => sculptHex(shoreCache, { terrain: t }, 1.12 * 0.995, BLOCK_H, TILE_Y, mulberry32(77), on ? sea : [false, false, false, false, false, false], R));
    const [pa, pb] = [a, b].map((x) => x.geo.getAttribute("position"));
    const nx = Math.cos((60 * k * Math.PI) / 180);
    const nz = Math.sin((60 * k * Math.PI) / 180);
    let deepest = 0;
    let wrong = 0;
    for (let i = 0; i < 3 * R * (R + 1) + 1; i++) {
      const d = pa.getY(i) - pb.getY(i);
      const e = TOP_INR - (pa.getX(i) * nx + pa.getZ(i) * nz);
      deepest = Math.max(deepest, d);
      const atPiece = Math.min(...[0, 1, 2, 3, 4, 5].map((c) => Math.hypot(pa.getX(i) - Math.cos(((30 + 60 * c) * Math.PI) / 180) * 1.12, pa.getZ(i) - Math.sin(((30 + 60 * c) * Math.PI) / 180) * 1.12))) < 0.08 || Math.min(...[0, 1, 2, 3, 4, 5].map((c) => Math.hypot(pa.getX(i) - Math.cos((60 * c * Math.PI) / 180) * 0.97, pa.getZ(i) - Math.sin((60 * c * Math.PI) / 180) * 0.97))) < 0.14;
      if (d < -1e-7 || d > SHORE_DIP + 1e-6 || (e > 0.11 && d > 1e-7) || (atPiece && d > 1e-7)) wrong++;
    }
    shore.push({ R, t, k, deepest, wrong });
    a.geo.dispose();
    b.geo.dispose();
  }
  disposeTerrainCache(shoreCache);
  check("6 the beach dips up to " + SHORE_DIP + " along a sea edge, never at a corner or an edge midpoint, nor more than 0.11 in, at both resolutions", shore.every((x) => x.wrong === 0 && x.deepest > SHORE_DIP * 0.6), JSON.stringify(shore.filter((x) => x.wrong || x.deepest <= SHORE_DIP * 0.6).slice(0, 3)));
  check("6 the hole made sea edges the full island does not have", reports[2].coastEdges > reports[1].coastEdges && reports[3].coastEdges > reports[0].coastEdges, reports.map((r) => r.coastEdges).join("/"));
  // Watertight body: every edge of the top, rim and side is shared by two triangles, except the open skirt at the bottom.
  const watertight = (board, hexes, R) => {
    const bad = [];
    for (const h of hexes) {
      const g = tileOf(board, h.id).geometry;
      const pos = g.getAttribute("position");
      const idx = g.index.array;
      const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      const uses = new Map();
      for (let t = 0; t < bodyOf(R); t += 3) {
        for (let e = 0; e < 3; e++) {
          const [a, b] = [key(idx[t + e]), key(idx[t + ((e + 1) % 3)])];
          if (a === b) continue;
          const k = a < b ? `${a}|${b}` : `${b}|${a}`;
          uses.set(k, (uses.get(k) ?? 0) + 1);
        }
      }
      for (const [k, n] of uses) {
        const [a, b] = k.split("|").map((s) => s.split(",").map(Number));
        const onSkirt = a[1] === b[1] && a[1] === Math.round(-SKIRT * 1e4);
        if (n > 2 || (n === 1 && !onSkirt)) bad.push(`${h.terrain} ${h.id} edge used ${n}x at y=${a[1] / 1e4}`);
      }
    }
    return bad;
  };
  const crackFull = watertight(FULL, HEXES, FULL_R);
  const crackLite = watertight(LITE, HEXES, LITE_R);
  check("6 full: the top, rim and strata form a closed body, open only at the skirt", crackFull.length === 0, crackFull.slice(0, 3).join("; "));
  check("6 lite: the top, rim and strata form a closed body, open only at the skirt", crackLite.length === 0, crackLite.slice(0, 3).join("; "));
  // Neighbouring lips meet: across every shared edge the two tiles' extents reach past each other.
  const reach = (board, h, k) => {
    const [nx, nz] = [Math.cos((60 * k * Math.PI) / 180), Math.sin((60 * k * Math.PI) / 180)];
    const pos = tileOf(board, h.id).geometry.getAttribute("position");
    let r = -Infinity;
    for (let i = 0; i < pos.count; i++) r = Math.max(r, pos.getX(i) * nx + pos.getZ(i) * nz);
    return r;
  };
  let gap = Infinity;
  for (const board of [FULL, LITE]) {
    for (const h of HEXES) {
      for (let k = 0; k < 6; k++) {
        const o = HEXES.find((q) => Math.hypot(q.x - (h.x + Math.cos((60 * k * Math.PI) / 180) * SQ3 * 1.12), q.z - (h.z + Math.sin((60 * k * Math.PI) / 180) * SQ3 * 1.12)) < 0.01);
        if (o) gap = Math.min(gap, reach(board, h, k) + reach(board, o, (k + 3) % 6) - SQ3 * 1.12);
      }
    }
  }
  check("6 neighbouring lips reach each other across every shared edge", gap >= 0, `overlap ${gap.toFixed(4)}`);

  // --- 7. clay pit apron coverage, at each resolution
  const dropOf = (geo, R) => {
    const pos = geo.getAttribute("position");
    const idx = geo.index.array;
    const tris = [];
    for (let t = 0; t < 18 * R * R; t += 3) {
      const v = [0, 1, 2].map((e) => new THREE.Vector3(pos.getX(idx[t + e]), pos.getY(idx[t + e]), pos.getZ(idx[t + e])));
      if (v.some((p) => p.y < BLOCK_H - 0.12)) tris.push({ face: t / 3, v });
    }
    return tris;
  };
  const apronOf = (geo) => {
    const pos = geo.getAttribute("position");
    const col = geo.getAttribute("color");
    const a = new THREE.Color("#c9693c");
    const pts = [];
    for (let i = 0; i < pos.count; i++) if (Math.abs(col.getX(i) - a.r) + Math.abs(col.getY(i) - a.g) + Math.abs(col.getZ(i) - a.b) < 1e-4) pts.push([pos.getX(i), pos.getZ(i)]);
    const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
    return { cx: c[0], cz: c[1], outer: Math.max(...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))), pts };
  };
  const samplesIn = (v) => {
    const out = [];
    for (const [a, b, c] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.34, 0.33, 0.33], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) out.push(v[0].clone().multiplyScalar(a).addScaledVector(v[1], b).addScaledVector(v[2], c));
    return out;
  };
  const apronReport = (geo, R, tile) => {
    const ap = apronOf(geo);
    const dropped = dropOf(geo, R);
    let far = 0;
    let uncovered = 0;
    for (const t of dropped) for (const p of samplesIn(t.v)) {
      const d = Math.hypot(p.x - ap.cx, p.z - ap.cz);
      far = Math.max(far, d);
      if (d > ap.outer - 1e-3) uncovered++;
    }
    const onTop = ap.pts.every(([x, z]) => hexDist(x, z) <= TOP_INR + 1e-4);
    const clearOfToken = Math.hypot(ap.cx, ap.cz) - ap.outer >= 0.33;
    // Grazing: from low angles all round, nothing drawn first is a lowered triangle.
    const droppedFaces = new Set(dropped.map((t) => t.face));
    const holes = [];
    if (tile) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      m.updateMatrixWorld(true);
      const r = new THREE.Raycaster();
      for (const el of [5, 12, 25, 45]) for (let a = 0; a < 8; a++) {
        const dir = new THREE.Vector3(Math.cos((a / 8) * Math.PI * 2) * Math.cos((el * Math.PI) / 180), Math.sin((el * Math.PI) / 180), Math.sin((a / 8) * Math.PI * 2) * Math.cos((el * Math.PI) / 180));
        for (const t of dropped) for (const p of samplesIn(t.v).slice(3, 7)) {
          r.set(p.clone().addScaledVector(dir, 6), dir.clone().negate());
          const hit = r.intersectObject(m, false)[0];
          if (hit && droppedFaces.has(hit.faceIndex)) holes.push(`el${el} az${a} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
        }
      }
    }
    return { dropped: dropped.length, far, outer: ap.outer, uncovered, onTop, clearOfToken, holes };
  };
  const SEEDS_CLAY = [1, 2, 3, 4, 5, 6];
  for (const [name, board, R] of [["full", FULL, FULL_R], ["lite", LITE, LITE_R]]) {
    for (const h of HEXES.filter((x) => x.terrain === "clay")) {
      const r = apronReport(tileOf(board, h.id).geometry, R, h === HEXES.find((x) => x.terrain === "clay"));
      check(`7 ${name} ${h.id}: ${r.dropped} lowered triangles all under the apron (reach ${r.far.toFixed(3)} of ${r.outer.toFixed(3)}), on the top, clear of the token, no crack from grazing angles`, r.dropped > 0 && r.uncovered === 0 && r.onTop && r.clearOfToken && r.holes.length === 0, r.holes.slice(0, 2).join("; "));
    }
  }
  // The same geometry at other resolutions, straight from the sculptor.
  const cache = terrainCache();
  const sweep = {};
  for (const R of [10, 11, 12, 14, 18, 24]) {
    let bad = 0;
    let worstGap = Infinity;
    let overrun = 0;
    for (const s of SEEDS_CLAY) {
      const sc = sculptHex(cache, { terrain: "clay" }, 1.12 * 0.995, BLOCK_H, TILE_Y, mulberry32(s), [false, false, false, false, false, false], R);
      const r = apronReport(sc.geo, R, s <= 2);
      worstGap = Math.min(worstGap, r.outer - r.far);
      if (!r.onTop) overrun++;
      if (r.dropped === 0 || r.uncovered || !r.onTop || !r.clearOfToken || r.holes.length) bad++;
      sc.geo.dispose();
    }
    sweep[R] = { bad, overrun, worstGap: +worstGap.toFixed(4) };
  }
  disposeTerrainCache(cache);
  check("7 the apron covers the lowered ground at 12, 14, 18 and 24 rings, six pits each", [12, 14, 18, 24].every((R) => sweep[R].bad === 0), JSON.stringify(sweep));
  // Below the lite lattice the apron, which grows with the lattice step, runs off the tile's top: why lite is not coarser.
  check("7 at 10 and 11 rings the apron overruns the top, which is why lite is not coarser than 12", sweep[10].overrun > 0 && sweep[11].overrun > 0, JSON.stringify([sweep[10], sweep[11]]));
  measures.apronSweep = sweep;

  // --- 8. glow, blocking, motion, reduced motion, roll and tap
  const pick = HEXES[5];
  const other = HEXES[6];
  const B = await make(HEXES, SEED, "full");
  const cap = (board, h) => tileOf(board, h.id).material;
  B.update(1);
  B.glow(pick.id, 0.3);
  B.update(1.1);
  check("8 glow lights its hex alone and keeps the loop awake", cap(B, pick).emissiveIntensity === 0.3 && cap(B, other).emissiveIntensity === 0 && B.busy());
  B.glow(pick.id, 0);
  B.update(1.2);
  check("8 glow at 0 lets the loop rest", cap(B, pick).emissiveIntensity === 0 && !B.busy());
  B.robber(pick.id);
  let seen = [];
  for (let t = 1.3, i = 0; i < 40; i++, t += 0.1) (B.update(t), i % 10 === 0 && seen.push(cap(B, pick).color.r));
  const dull = cap(B, pick).color;
  check("8 blocking dulls its hex gradually, cooler and darker, and the others stay clear", seen[0] < 1 && seen[1] < seen[0] && dull.r < 0.5 && dull.b > dull.r && cap(B, other).color.r === 1 && !B.busy(), seen.map((v) => v.toFixed(2)).join(" "));
  B.robber(other.id);
  B.update(10, false, true);
  check("8 blocking moves to the next hex; snap lands it at once", cap(B, pick).color.r === 1 && Math.abs(cap(B, other).color.r - 0.46) < 1e-3 && !B.busy());
  B.robber(null);
  B.update(10.1, false, true);
  check("8 blocking clears", HEXES.every((h) => cap(B, h).color.r === 1));
  B.update(11);
  B.roll([pick.id, "no-such-hex"]);
  B.tap(other.id);
  B.tap("no-such-hex");
  B.update(11.1);
  const swell = [tileOf(B, pick.id).scale.x, tileOf(B, other.id).scale.x];
  check("8 roll and tap swell their hexes and keep the loop awake", swell[0] !== 1 && swell[1] !== 1 && Math.abs(swell[0] - 1) < 0.05 && Math.abs(swell[1] - 1) < 0.05 && B.busy() && tileOf(B, HEXES[0].id).scale.x === 1, swell.map((v) => v.toFixed(4)).join(" "));
  B.update(12);
  check("8 roll and tap settle back to rest", tileOf(B, pick.id).scale.x === 1 && tileOf(B, other.id).scale.x === 1 && !B.busy());
  B.roll([pick.id]);
  B.update(12.1, false, true);
  check("8 reduced motion settles a roll at once", tileOf(B, pick.id).scale.x === 1);
  // Motion: the flock, the workers and the breeze move, the same way for the same seed; reduced motion holds them still.
  const B2 = await make(HEXES, SEED, "full");
  const idle = poseHash(B2);
  run(B2, 0, 12);
  const moved = poseHash(B2);
  const B3 = await make(HEXES, SEED, "full");
  run(B3, 0, 12);
  check("8 motion: the flock, workers and breeze move", moved !== idle);
  check("8 motion: the same seed moves the same way (no RNG outside the board's own stream)", poseHash(B3) === moved);
  const swayers = [];
  B2.group.traverse((o) => o.userData.sway && swayers.push(o));
  check("8 motion: pines and wheat sway", swayers.length > 0 && swayers.some((o) => o.rotation.z !== 0));
  B2.update(30, false, true);
  const still1 = poseHash(B2);
  B2.update(77.7, false, true);
  check("8 reduced motion: a still pose, whatever the clock", poseHash(B2) === still1 && swayers.every((o) => o.rotation.z === 0));
  check("8 reduced motion: the still pose is the pose the build opens in", still1 === idle);
  B2.update(80);
  B2.update(80.1, true);
  check("8 motion resumes after reduced motion", poseHash(B2) !== still1);

  // --- 9. camera-dependent occlusion of the numerals
  const TOKEN_TILT = (22 * Math.PI) / 180;
  const TOKEN_H = 0.05;
  const TOKEN_LIFT = TOKEN_R * Math.sin(TOKEN_TILT) + (TOKEN_H / 2) * Math.cos(TOKEN_TILT) - TOKEN_H / 2;
  const GLYPH_FOOT = 0.13 * (0.245 / 0.29);
  const tokensFor = (az) => {
    const out = [];
    const pts = [];
    for (const h of game.hexes) {
      if (h.pip === null) continue;
      const w = hexToWorld(h.q, h.r);
      const g = new THREE.Object3D();
      g.position.set(w.x, TILE_Y + BLOCK_H + 0.04 + TOKEN_LIFT, w.z);
      g.rotation.set(TOKEN_TILT, az, 0, "YXZ");
      g.updateMatrixWorld(true);
      out.push({ x: g.position.x, y: g.position.y, z: g.position.z, glyphBottom: g.position.y - GLYPH_FOOT });
      // Five points across the face, as tokens-prove reads it.
      for (const [lx, lz] of [[0, 0], [0, -0.09], [0, 0.09], [-0.09, 0], [0.09, 0]]) pts.push(g.localToWorld(new THREE.Vector3(lx, TOKEN_H / 2, lz)));
    }
    return { tokens: out, pts };
  };
  const hidden = (board, eye, pts) => {
    const list = drawn(board);
    let n = 0;
    for (const p of pts) {
      const dir = p.clone().sub(eye);
      const len = dir.length();
      ray.set(eye, dir.normalize());
      ray.far = len - 0.01;
      if (ray.intersectObjects(list, false).length) n++;
    }
    ray.far = Infinity;
    return n;
  };
  const view = (az) => ({ view: "diorama", azimuth: az, camera: { ...camera.position }, tokens: tokensFor(az).tokens });
  let before = 0;
  let after = 0;
  let total = 0;
  const bad = [];
  for (const board of [FULL, LITE]) {
    for (let i = 0; i < 12; i++) {
      const az = (i / 12) * Math.PI * 2 + (20 * Math.PI) / 180;
      at(az);
      const { tokens, pts } = tokensFor(az);
      board.setVisibilityContext({ view: "overhead", azimuth: az, camera: { ...camera.position }, tokens });
      const b = hidden(board, camera.position.clone(), pts);
      board.setVisibilityContext({ view: "diorama", azimuth: az, camera: { ...camera.position }, tokens });
      const a = hidden(board, camera.position.clone(), pts);
      if (board === FULL) (before += b), (after += a), (total += pts.length);
      else if (a) bad.push(`lite az${i}`);
      if (a) bad.push(`full az${i}: ${a} hidden`);
    }
  }
  check("9 camera-dependent occlusion: in the diorama no numeral point is behind the props or the ground, at twelve azimuths", after === 0 && bad.length === 0, `hidden ${after} of ${total} points with the rule (${before} without it); ${bad.slice(0, 3).join("; ")}`);
  measures.occlusion = { points: total, hiddenWithout: before, hiddenWith: after };
  // The rule is the camera's: the other views leave every prop at full size.
  const scaleSum = (board) => { let s = 0; board.group.traverse((o) => o.isMesh && !o.visible && o.userData.base && (s += o.scale.x + o.scale.y + o.scale.z)); return s; };
  const fullSize = (at(0), FULL.setVisibilityContext({ view: "free", azimuth: 0, camera: { ...camera.position }, tokens: [] }), scaleSum(FULL));
  at((20 * Math.PI) / 180);
  FULL.setVisibilityContext(view((20 * Math.PI) / 180));
  const shrunk = scaleSum(FULL);
  FULL.setVisibilityContext({ view: "overhead", azimuth: 0, camera: { ...camera.position }, tokens: view(0).tokens });
  check("9 the diorama shrinks props in front of numerals, and the other views restore them", shrunk < fullSize && scaleSum(FULL) === fullSize, `${shrunk.toFixed(3)} < ${fullSize.toFixed(3)}`);
  // The adjustment is in the instances when the call returns, so the same frame publishes both.
  FULL.setVisibilityContext(view((20 * Math.PI) / 180));
  let synced = true;
  const proxiesByKind = {};
  FULL.group.traverse((o) => o.isMesh && !o.visible && o.userData.prop && (proxiesByKind[o.userData.prop === "wheat" ? "wheat" : o.userData.prop] ??= []).push(o));
  FULL.group.traverse((o) => {
    if (!o.isInstancedMesh || !o.name.startsWith("props-")) return;
    const kind = o.name.slice(6);
    const list = proxiesByKind[kind === "peak-snow" ? "peak" : kind];
    if (!list || list.length !== o.count) return;
    list.forEach((p, i) => { p.updateMatrix(); for (let k = 0; k < 16; k++) if (o.instanceMatrix.array[i * 16 + k] !== Math.fround(p.matrix.elements[k])) synced = false; });
  });
  check("9 the shrink is already in the instances when setVisibilityContext returns", synced && shrunk < fullSize);
  // The snapshot is copied: changing the caller's data afterwards changes nothing.
  const mine = view((20 * Math.PI) / 180);
  FULL.setVisibilityContext(mine);
  const kept = scaleSum(FULL);
  mine.tokens.forEach((t) => { t.x += 50; t.y += 50; t.z += 50; t.glyphBottom += 50; });
  mine.camera.y = 0;
  FULL.update(90.3);
  check("9 the context is copied by value", scaleSum(FULL) === kept);
  FULL.setVisibilityContext(deepFreeze(view((20 * Math.PI) / 180)));
  check("9 a frozen context is accepted (the board never writes to it)", true);

  // --- 10. cancellation, ownership and disposal
  const instances = [];
  const realDispose = ClassicBoard.prototype.dispose;
  ClassicBoard.prototype.dispose = function () { instances.push(this); return realDispose.call(this); };
  const timers = { n: 0 };
  const wrap = (name) => { const real = window[name]; window[name] = (...a) => (timers.n++, real.apply(window, a)); return () => (window[name] = real); };
  const unwrap = ["setTimeout", "setInterval", "requestAnimationFrame"].map(wrap);
  let calls = 0;
  const counted = await make(HEXES, SEED, "full", async () => (calls++, true));
  counted.dispose();
  const total2 = calls;
  const cancelled = [];
  for (const [quality, cut] of [["full", 1], ["full", 2], ["full", 8], ["full", Math.floor(total2 / 2)], ["full", total2 - 2], ["full", total2 - 1], ["full", total2], ["lite", 1], ["lite", 10], ["lite", 20]]) {
    let n = 0;
    const was = instances.length;
    const out = await make(HEXES, SEED, quality, async () => ++n < cut);
    cancelled.push({ quality, cut, nulled: out === null, freed: instances.length === was + 1 && instances[was].group.children.length === 0 && instances[was].cache.disposed && instances[was].stats().objects.meshes === 0 });
  }
  check(`10 cancelling at any of ${total2} yields returns null and frees the build`, cancelled.every((c) => c.nulled && c.freed), JSON.stringify(cancelled.filter((c) => !c.nulled || !c.freed)));
  let threw = false;
  const was = instances.length;
  try {
    let n = 0;
    await make(HEXES, SEED, "full", async () => { if (++n === 6) throw new Error("injected"); return true; });
  } catch (e) {
    threw = e.message === "injected";
  }
  check("10 a build that throws rejects and frees what it made", threw && instances.length === was + 1 && instances[was].cache.disposed && instances[was].group.children.length === 0);
  // Two builds interleaved: cancelling one leaves the other as if it were alone (the caches are each board's own).
  let flip = 0;
  const [cut, whole] = await Promise.all([make(HEXES, SEED, "full", async () => (await Promise.resolve(), ++flip < 30)), make(HEXES, SEED, "full", async () => (await Promise.resolve(), true))]);
  check("10 cancelling one build leaves a concurrent one untouched and identical to a solo build", cut === null && whole && hashOf(whole) === hFull);
  const later = await make(HEXES, SEED, "full");
  check("10 a build after another's disposal is identical", hashOf(later) === hFull);
  // Repeated disposal.
  const D = await make(HEXES, SEED, "full");
  D.dispose();
  D.dispose();
  D.dispose();
  let after2 = true;
  try { D.update(1); D.update(2, true, true); D.glow("1,0", 1); D.roll(["1,0"]); D.tap("1,0"); D.robber("1,0"); D.setVisibilityContext(view(0)); } catch { after2 = false; }
  check("10 disposal is idempotent and the disposed board answers harmlessly", after2 && D.stats().objects.meshes === 0 && D.group.children.length === 0 && Number.isNaN(D.groundAt("1,0", 0, 0)) && D.busy() === false, JSON.stringify(D.stats()));
  unwrap.forEach((f) => f());
  ClassicBoard.prototype.dispose = realDispose;
  check("10 the board sets no timer or frame callback of its own", timers.n === 0, `${timers.n}`);
  [counted, later, whole, B, B2, B3, FULL2, LITE2].forEach((b) => b?.dispose());
  // GPU resources are bounded: building, drawing and disposing again and again returns the renderer to where it began.
  const gpuBefore = { g: renderer.info.memory.geometries, t: renderer.info.memory.textures };
  const spans = [];
  for (let i = 0; i < 4; i++) {
    const b = await make(HEXES, SEED, i % 2 ? "lite" : "full");
    paint(b);
    spans.push({ g: renderer.info.memory.geometries, p: renderer.info.programs.length });
    scene.remove(b.group);
    b.dispose();
  }
  const rest = { g: renderer.info.memory.geometries, t: renderer.info.memory.textures, p: renderer.info.programs.length };
  check("10 repeated build, draw and disposal returns the renderer's geometries and textures to where they began", rest.g === gpuBefore.g && rest.t === gpuBefore.t && rest.g > 0, `${JSON.stringify(rest)} from ${JSON.stringify(gpuBefore)}`);
  check("10 programs do not accumulate across builds", spans[2].p <= spans[0].p && spans[3].p <= spans[1].p && rest.p <= spans[1].p, JSON.stringify(spans));

  // --- 11. no game-state, RNG, picking or shared-scene mutation
  const stateBefore = JSON.stringify(dealOf(11));
  const realRandom = Math.random;
  // three itself draws uuids from Math.random; any other caller is the board's.
  let randomCalls = 0;
  Math.random = () => (/generateUUID/.test((new Error().stack.split("\n")[2] ?? "")) || randomCalls++, realRandom());
  const sentinel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  sentinel.name = "sentinel";
  scene.add(sentinel);
  const sceneBefore = JSON.stringify(scene.toJSON());
  const lightsBefore = [sun.intensity, sun.shadow.mapSize.x, sun.castShadow, camera.position.toArray().join()].join();
  const M = await make(HEXES, SEED, "full");
  run(M, 0, 8);
  M.glow(HEXES[0].id, 0.2);
  M.roll([HEXES[1].id]);
  M.tap(HEXES[2].id);
  M.robber(HEXES[3].id);
  M.setVisibilityContext(view(0));
  M.update(9, true, true);
  M.stats();
  M.dispose();
  Math.random = realRandom;
  check("11 no Math.random call in build or animation", randomCalls === 0, `${randomCalls}`);
  check("11 the game's state is byte-identical afterwards", JSON.stringify(dealOf(11)) === stateBefore && JSON.stringify(game) === gameBefore);
  check("11 the frozen hex descriptors were only read", Object.isFrozen(HEXES) && HEXES.every(Object.isFrozen));
  check("11 the scene it was not given is unchanged (children, lights, camera)", JSON.stringify(scene.toJSON()) === sceneBefore && lightsBefore === [sun.intensity, sun.shadow.mapSize.x, sun.castShadow, camera.position.toArray().join()].join());
  const other3 = [];
  FULL.group.traverse((o) => {
    if (o !== FULL.group && !o.isMesh && o.type !== "Group") other3.push(o.type);
  });
  const pickKeys = [];
  FULL.group.traverse((o) => ["id", "kind", "token", "pickable"].forEach((k) => k in o.userData && pickKeys.push(`${o.name}.${k}`)));
  check("11 it registers nothing pickable and brings no lights, cameras or sprites", pickKeys.length === 0 && other3.length === 0, `${pickKeys.slice(0, 3)} ${other3.slice(0, 3)}`);
  check("11 its group holds only its ground and props", FULL.group.children.length === 20 && FULL.group.children.filter((o) => o.name.startsWith("classic-hex-")).length === 19 && FULL.group.children.some((o) => o.name === "classic-props"));

  // --- measured geometry
  measures.fullGroundTriangles = HEXES.reduce((s, h) => s + tileOf(FULL, h.id).geometry.index.count / 3, 0);
  measures.liteGroundTriangles = HEXES.reduce((s, h) => s + tileOf(LITE, h.id).geometry.index.count / 3, 0);
  measures.propMeshes = props(FULL).map((m) => `${m.name}${m.isInstancedMesh ? `x${m.count}` : ""}`);
  [FULL, LITE, HOLE_FULL, HOLE_LITE].forEach((b) => b.dispose());
  check("10 disposing the last boards leaves the renderer holding none of the Classic land's geometry", renderer.info.memory.geometries === ownedBase.geometries, `${renderer.info.memory.geometries}`);
  renderer.dispose();
  return { checks, measures };
}

// The module the page runs in: the imports are the free names of proofInPage.
const virtual = "virtual:classic-builder-prove";
const source = `
import * as THREE from "three";
import { ClassicBoard } from "/src/lib/scene/classic-board.ts";
import { disposeTerrainCache, sculptHex, terrainCache } from "/src/lib/scene/terrain-classic.ts";
import { BLOCK_H } from "/src/lib/scene/jelly-dims.ts";
import { createGame } from "/src/lib/game/board.ts";
import { hexToWorld } from "/src/lib/game/hex.ts";
import { mulberry32 } from "/src/lib/game/random.ts";
export default ${proofInPage.toString()};
`;

const vite = await createServer({
  root: ROOT,
  server: { host: "127.0.0.1", port: PORT, strictPort: true },
  logLevel: "error",
  optimizeDeps: { include: ["three", "three/addons/utils/BufferGeometryUtils.js"] },
  plugins: [{ name: "classic-builder-prove", resolveId: (id) => (id === virtual ? `\0${virtual}` : undefined), load: (id) => (id === `\0${virtual}` ? source : undefined) }],
});
await vite.listen();

const errors = [];
let failed = 0;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.route(`http://127.0.0.1:${PORT}/__classic-builder-prove`, (r) => r.fulfill({ contentType: "text/html", body: '<!doctype html><title>classic</title><canvas id="c" width="256" height="256"></canvas>' }));
  await page.goto(`http://127.0.0.1:${PORT}/__classic-builder-prove`);
  const { checks, measures } = await page.evaluate(async (id) => (await import(id)).default(), `/@id/__x00__${virtual}`);
  for (const c of checks) {
    console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}${c.detail ? ` [${c.detail}]` : ""}`);
    if (!c.ok) failed++;
  }
  // The Classic code's own weight when it is a chunk: three, the game and the shared utilities stay in the main bundle.
  const out = await build({
    configFile: false,
    root: ROOT,
    logLevel: "silent",
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    build: {
      write: false,
      minify: true,
      lib: { entry: "src/lib/scene/classic-board.ts", formats: ["es"], fileName: "classic-board" },
      rolldownOptions: { external: [/^three/, /[\\/]src[\\/]lib[\\/](utils|game)[\\/]?/, /[\\/]src[\\/]lib[\\/]utils\.ts$/] },
    },
  });
  const chunk = (Array.isArray(out) ? out[0] : out).output.find((o) => o.type === "chunk");
  measures.classicChunk = { bytes: Buffer.byteLength(chunk.code), gzip: gzipSync(chunk.code).length };
  console.log("\nmeasured (software GL; the chunk is the Classic code alone, three and the game stay in the main bundle):");
  for (const [k, v] of Object.entries(measures)) console.log(`  ${k}: ${JSON.stringify(v)}`);
  if (!(measures.classicChunk.gzip > 10_000)) (console.log("FAIL the Classic chunk build measured nothing"), failed++);
  if (errors.length) (console.log("FAIL console errors:", errors.join(" | ")), failed++);
} finally {
  await browser.close();
  await vite.close();
}
console.log(failed ? `\n${failed} FAILED` : "\nall ok");
process.exit(failed ? 1 : 0);
