// #743: roadWitness is the one longest-path traversal. roadLength is its length, unchanged from the old search; the witness
// is a legal trail of the holder's paths and the smallest one among equal lengths (edge ids, then vertex ids, raw order).
import { createGame } from "../src/lib/game/board.ts";
import { roadLength, roadWitness } from "../src/lib/game/rules.ts";

function fail(why, extra) {
  console.log("FAIL", why, extra === undefined ? "" : JSON.stringify(extra));
  process.exit(1);
}

const fresh = (seed = 9) => {
  const g = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed });
  g.phase = "main";
  g.current = "p0";
  return g;
};
const edgesAt = (g, v) => g.edges.filter((e) => e.va === v || e.vb === v);
const far = (e, v) => (e.va === v ? e.vb : e.va);
const vx = (g, id) => g.vertices.find((v) => v.id === id);
const put = (g, vid, playerId, kind = "outpost") => (vx(g, vid).building = { playerId, kind });

// The search roadLength ran before #743, kept here as the reference length.
function oldLength(state, pid) {
  const mine = state.edges.filter((e) => e.path === pid);
  if (!mine.length) return 0;
  const byCorner = new Map();
  for (const e of mine) for (const v of [e.va, e.vb]) byCorner.set(v, [...(byCorner.get(v) ?? []), e]);
  const blocked = (vid) => {
    const b = vx(state, vid)?.building;
    return Boolean(b && b.playerId !== pid);
  };
  const used = new Set();
  const walk = (corner) => {
    if (used.size > 0 && blocked(corner)) return 0;
    let best = 0;
    for (const e of byCorner.get(corner) ?? []) {
      if (used.has(e.id)) continue;
      used.add(e.id);
      best = Math.max(best, 1 + walk(far(e, corner)));
      used.delete(e.id);
    }
    return best;
  };
  let best = 0;
  for (const c of byCorner.keys()) best = Math.max(best, walk(c));
  return best;
}

// Every legal trail, by brute force with no ordering of its own; the expected witness is the smallest longest one.
function expected(state, pid) {
  const mine = state.edges.filter((e) => e.path === pid);
  const all = [];
  const blocked = (vid) => {
    const b = vx(state, vid)?.building;
    return Boolean(b && b.playerId !== pid);
  };
  const go = (es, vs) => {
    if (es.length) all.push({ edgeIds: [...es], vertexIds: [...vs] });
    const at = vs[vs.length - 1];
    if (es.length && blocked(at)) return;
    for (const e of mine) {
      if ((e.va !== at && e.vb !== at) || es.includes(e.id)) continue;
      go([...es, e.id], [...vs, far(e, at)]);
    }
  };
  for (const c of new Set(mine.flatMap((e) => [e.va, e.vb]))) go([], [c]);
  const cmp = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  };
  all.sort((a, b) => b.edgeIds.length - a.edgeIds.length || cmp(a.edgeIds, b.edgeIds) || cmp(a.vertexIds, b.vertexIds));
  return all[0] ?? { edgeIds: [], vertexIds: [] };
}

// A legal trail: owned edges, each once, chained corner to corner, never passing through an opponent's building.
function legal(state, pid, w) {
  if (w.edgeIds.length === 0) return w.vertexIds.length === 0;
  if (w.vertexIds.length !== w.edgeIds.length + 1 || new Set(w.edgeIds).size !== w.edgeIds.length) return false;
  return w.edgeIds.every((id, i) => {
    const e = state.edges.find((x) => x.id === id);
    const [a, b] = [w.vertexIds[i], w.vertexIds[i + 1]];
    const inner = i > 0 ? vx(state, a).building : null;
    return e?.path === pid && ((e.va === a && e.vb === b) || (e.va === b && e.vb === a)) && !(inner && inner.playerId !== pid);
  });
}

// The same board with every list reversed and every edge's ends swapped: the witness must not move.
function mirrored(g) {
  const m = structuredClone(g);
  m.edges.reverse();
  m.vertices.reverse();
  for (const e of m.edges) [e.va, e.vb] = [e.vb, e.va];
  return m;
}

function check(name, g, pid, extra) {
  const w = roadWitness(g, pid);
  const want = expected(g, pid);
  if (!legal(g, pid, w)) fail(`${name}: witness is not a legal trail`, w);
  if (w.edgeIds.length !== oldLength(g, pid)) fail(`${name}: length differs from the old search`, { got: w.edgeIds.length, old: oldLength(g, pid) });
  if (roadLength(g, pid) !== w.edgeIds.length) fail(`${name}: roadLength is not the witness length`);
  if (JSON.stringify(w) !== JSON.stringify(want)) fail(`${name}: not the smallest longest trail`, { got: w, want });
  if (JSON.stringify(roadWitness(mirrored(g), pid)) !== JSON.stringify(w)) fail(`${name}: reversed input moved the witness`);
  extra?.(w);
  return w;
}

const own = (g, ids, pid) => ids.forEach((id) => (g.edges.find((x) => x.id === id).path = pid));
const ring = (g, hexIdx = 0) => {
  const h = g.hexes.filter((x) => x.terrain !== "sea")[hexIdx];
  const corners = g.vertices.filter((v) => v.hexes.includes(h.id)).map((v) => v.id);
  return g.edges.filter((e) => corners.includes(e.va) && corners.includes(e.vb));
};

// No paths.
{
  const g = fresh();
  check("no paths", g, "p0", (w) => w.edgeIds.length === 0 || fail("no paths: nonempty"));
  console.log("no paths: empty witness");
}

// A fork: a line of 4 with a 1-segment spur at an interior corner. The trail runs the line, not every branch.
{
  const g = fresh();
  const v = g.vertices.find((x) => edgesAt(g, x.id).length === 3).id;
  const [a, b, c] = edgesAt(g, v);
  const ext = (e) => edgesAt(g, far(e, v)).find((x) => x.id !== e.id);
  own(g, [a.id, b.id, ext(a).id, ext(b).id, c.id], "p0");
  check("fork", g, "p0", (w) => w.edgeIds.length === 4 || fail("fork: length", w));
  console.log("fork with a short branch: trail 4 along the line");
}

// A closed ring of 6: every edge once, ending where it started; and a ring with a tail of 2.
{
  const g = fresh();
  const r = ring(g, 4);
  own(g, r.map((e) => e.id), "p0");
  check("ring", g, "p0", (w) => (w.edgeIds.length === 6 && w.vertexIds[0] === w.vertexIds[6]) || fail("ring: not closed", w));
  const v = r[0].va;
  const out = edgesAt(g, v).find((e) => !r.includes(e));
  if (out) {
    const out2 = edgesAt(g, far(out, v)).find((e) => e.id !== out.id);
    own(g, [out.id, out2.id], "p0");
    check("ring with tail", g, "p0", (w) => w.edgeIds.length === 8 || fail("ring with tail: length", w));
    // An opponent's building on the ring's junction: a trail may start there but never passes through it.
    put(g, v, "p1");
    check("opponent at the junction", g, "p0");
    // The holder's own building there changes nothing.
    put(g, v, "p0", "stronghold");
    check("own building at the junction", g, "p0", (w) => w.edgeIds.length === 8 || fail("own building cut the trail", w));
  }
  console.log("ring of 6 closes on itself; ring with a tail is 8; opponent at the junction blocks, own building does not");
}

// Two disconnected lines: one trail, on the longer one.
{
  const g = fresh();
  const lines = [];
  const used = new Set();
  for (const start of g.vertices) {
    if (lines.length === 2) break;
    const path = [];
    let at = start.id;
    const seen = new Set([at]);
    while (path.length < (lines.length ? 2 : 3)) {
      const e = edgesAt(g, at).find((x) => !seen.has(far(x, at)) && !used.has(far(x, at)) && !used.has(at));
      if (!e) break;
      path.push(e);
      at = far(e, at);
      seen.add(at);
    }
    if (path.length < (lines.length ? 2 : 3)) continue;
    for (const e of path) {
      used.add(e.va);
      used.add(e.vb);
      for (const n of [...edgesAt(g, e.va), ...edgesAt(g, e.vb)]) used.add(far(n, e.va)), used.add(far(n, e.vb));
    }
    lines.push(path);
  }
  own(g, lines.flat().map((e) => e.id), "p0");
  check("disconnected", g, "p0", (w) => w.edgeIds.length === 3 || fail("disconnected: combined branches", w));
  console.log("disconnected paths: only the longer line");
}

// Random networks of up to 15 paths, with opponent and own buildings scattered on them, across several islands.
let cases = 0;
for (let seed = 1; seed <= 12; seed++) {
  for (let t = 0; t < 40; t++) {
    const g = fresh(seed);
    let r = (seed * 7919 + t * 104729) >>> 0;
    const rnd = (n) => ((r = (r * 1103515245 + 12345) >>> 0) >>> 8) % n;
    let at = g.vertices[rnd(g.vertices.length)].id;
    const n = 3 + rnd(13);
    for (let i = 0; i < n; i++) {
      const es = edgesAt(g, at);
      const e = es[rnd(es.length)];
      e.path = "p0";
      at = far(e, at);
      // Now and then jump back to a corner already on the network, to make forks and loops.
      if (rnd(4) === 0) {
        const mine = g.edges.filter((x) => x.path === "p0");
        const pick = mine[rnd(mine.length)];
        at = rnd(2) ? pick.va : pick.vb;
      }
    }
    const corners = [...new Set(g.edges.filter((x) => x.path === "p0").flatMap((e) => [e.va, e.vb]))];
    for (let k = rnd(3); k > 0; k--) put(g, corners[rnd(corners.length)], rnd(2) ? "p1" : "p0");
    check(`random seed ${seed} case ${t}`, g, "p0");
    cases++;
  }
}
console.log(`${cases} random networks: witness legal, smallest, order-independent, and the old length`);
console.log("award witness prove ok");
