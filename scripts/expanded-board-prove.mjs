// #1604: the five and six seat island and its supplies (docs/design/six-players.md), and classic parity.
// Node only: it imports the rules directly, like spiral-prove.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createGame } from "../src/lib/game/board.ts";
import { hexesInRadius } from "../src/lib/game/hex.ts";
import {
  EXPANDED_COLORS,
  EXPANDED_COORDS,
  EXPANDED_TOKENS,
  coastLoop,
  cornerHexes,
  createAnyGame,
  spiralPath,
} from "../src/lib/game/expanded.ts";

const key = (q, r) => `${q},${r}`;
const sorted = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const tally = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

function hexCount(game) {
  const byId = new Map(game.vertices.map((v) => [v.id, v]));
  return new Map(game.edges.map((e) => [e.id, byId.get(e.va).hexes.filter((h) => byId.get(e.vb).hexes.includes(h)).length]));
}

// 1. Topology of the 30-hex island.
const rows = [[-3, 1, 3], [-2, 0, 3], [-1, -1, 3], [0, -2, 3], [1, -2, 2], [2, -2, 1], [3, -2, 0]];
const expectCoords = rows.flatMap(([r, lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => key(lo + i, r)));
eq(rows.map(([, lo, hi]) => hi - lo + 1), [3, 4, 5, 6, 5, 4, 3], "rows of 3, 4, 5, 6, 5, 4, 3");
eq(EXPANDED_COORDS.map((c) => key(c.q, c.r)), expectCoords, "the design's axial rows");
{
  const g = createAnyGame({ seed: 1, humans: [], bots: 6 });
  eq(g.hexes.map((h) => h.id), expectCoords, "30 hexes in row order");
  eq(new Set(g.hexes.map((h) => h.id)).size, 30, "30 distinct hexes");
  // A filled hex patch: corners - edges + hexes = 1 (Euler). Classic is 54 - 72 + 19.
  eq([g.vertices.length, g.edges.length], [80, 109], "80 corners and 109 edges");
  eq(g.vertices.length - g.edges.length + g.hexes.length, 1, "Euler");
  const classic = createGame({ seed: 1, humans: [], bots: 3 });
  eq([classic.vertices.length, classic.edges.length], [54, 72], "classic stays 54 corners and 72 edges");
  for (const v of g.vertices) ok(v.hexes.length >= 1 && v.hexes.length <= 3, `corner ${v.id} touches ${v.hexes.length} hexes`);
  const counts = hexCount(g);
  for (const [id, n] of counts) ok(n === 1 || n === 2, `edge ${id} touches ${n} hexes`);
  const coastal = g.edges.filter((e) => counts.get(e.id) === 1);
  eq(coastal.length, 38, "38 coastal edges");
  const perCorner = tally(coastal.flatMap((e) => [e.va, e.vb]));
  ok(Object.values(perCorner).every((n) => n === 2), "every coastal corner has exactly two coastal edges");
  const loop = coastLoop(g.edges, counts);
  eq(loop.length, coastal.length, "the coast is one loop through every coastal edge");
  eq(new Set(loop.map((e) => e.id)).size, coastal.length, "the loop repeats no edge");
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    ok([a.va, a.vb].some((v) => v === b.va || v === b.vb), `coast edges ${i} and ${i + 1} share a corner`);
  }
  eq(cornerHexes(EXPANDED_COORDS).map((c) => key(c.q, c.r)).sort(), sorted(["1,-3", "3,-3", "3,0", "0,3", "-2,3", "-2,0"]), "six corner hexes");
}

// 2. The spiral walk. On the classic 19 hexes it is exactly createGame's spiral (the paths spiral-prove checks).
{
  const outer = [[0, -2], [1, -2], [2, -2], [2, -1], [2, 0], [1, 1], [0, 2], [-1, 2], [-2, 2], [-2, 1], [-2, 0], [-1, -1]];
  const inner = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  const rotate = ([q, r], n) => { while (n-- > 0) [q, r] = [-r, q + r]; return [q, r]; };
  const classic = hexesInRadius(2);
  for (let corner = 0; corner < 6; corner++) for (const dir of [1, -1]) {
    const want = [...outer.map((_, i) => outer[(i * dir + 12) % 12]), ...inner.map((_, i) => inner[(i * dir + 6) % 6]), [0, 0]].map((p) => key(...rotate(p, corner)));
    const [q, r] = rotate([0, -2], corner);
    eq(spiralPath(classic, { q, r }, dir).map((c) => key(c.q, c.r)), want, `classic spiral, corner ${corner}, direction ${dir}`);
  }
  for (const c of cornerHexes(EXPANDED_COORDS)) for (const dir of [1, -1]) {
    const path = spiralPath(EXPANDED_COORDS, c, dir).map((x) => key(x.q, x.r));
    eq(sorted(path), sorted(expectCoords), `expanded spiral from ${key(c.q, c.r)}, direction ${dir}, visits all 30 once`);
    // Every walk is a true inward spiral: each step moves to a touching hex, and the 16 coast hexes (those with fewer
    // than six neighbours on the island) come first, then the interior.
    const at = (k) => k.split(",").map(Number);
    const touching = (a, b) => { const [aq, ar] = at(a), [bq, br] = at(b); const dq = aq - bq, dr = ar - br; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1; };
    ok(path.every((k, i) => i === 0 || touching(path[i - 1], k)), `expanded spiral from ${key(c.q, c.r)}, direction ${dir}: every step touches the last`);
    const coast = expectCoords.filter((k) => expectCoords.filter((o) => touching(k, o)).length < 6);
    eq(coast.length, 16, "sixteen coast hexes");
    eq(sorted(path.slice(0, 16)), sorted(coast), `expanded spiral from ${key(c.q, c.r)}, direction ${dir}: the coast ring comes first`);
  }
  // Official 5-6 rules (2021 rulebook, Illustration B): A on corner 3,-3, counter-clockwise, wastes at -1,-1 and 1,1.
  // The PDF text renders the token at 0,1 as "12" with one pip; the rulebook's token counts (two 2s, two 12s) make it 2.
  const illustration = {
    "1,-3": 4, "2,-3": 5, "3,-3": 2,
    "0,-2": 6, "1,-2": 11, "2,-2": 10, "3,-2": 8,
    "0,-1": 12, "1,-1": 12, "2,-1": 9, "3,-1": 4,
    "-2,0": 3, "-1,0": 10, "0,0": 3, "1,0": 6, "2,0": 5, "3,0": 8,
    "-2,1": 9, "-1,1": 5, "0,1": 2, "2,1": 3,
    "-2,2": 8, "-1,2": 4, "0,2": 9, "1,2": 6,
    "-2,3": 11, "-1,3": 11, "0,3": 10,
  };
  eq(sorted(Object.values(illustration)), sorted(EXPANDED_TOKENS), "Illustration B holds the 28 extension tokens");
  const wastes = new Set(["-1,-1", "1,1"]);
  const laid = spiralPath(EXPANDED_COORDS, { q: 3, r: -3 }, -1).map((c) => key(c.q, c.r));
  eq(laid[1], "2,-3", "direction -1 from 3,-3 runs along the top row like the rulebook");
  const placed = {};
  let i = 0;
  for (const id of laid) if (!wastes.has(id)) placed[id] = EXPANDED_TOKENS[i++];
  eq(placed, illustration, "the letter sequence laid by the spiral reproduces Illustration B");
}

// 3. Inventories across seeds, seat counts, token modes and wayfarer modes.
const terrainWant = { timber: 6, clay: 5, wool: 6, grain: 6, ore: 5, waste: 2 };
const dockWant = { any: 5, wool: 2, timber: 1, clay: 1, grain: 1, ore: 1 };
const orientations = new Set();
let games = 0;
for (let seed = 0; seed < 200; seed++) {
  for (const seats of [5, 6]) for (const numberTokens of ["official", "random"]) for (const wayfarerMode of ["on", "off"]) {
    const humans = Array.from({ length: seed % (seats + 1) }, (_, i) => ({ name: `H${i}` }));
    const opts = { seed, humans, bots: seats - humans.length, numberTokens, wayfarerMode };
    const g = createAnyGame(opts);
    games++;
    const tag = `seed ${seed}, ${seats} seats, ${numberTokens}, wayfarer ${wayfarerMode}`;
    eq(JSON.stringify(g), JSON.stringify(createAnyGame(opts)), `${tag}: deterministic`);
    eq(g.variant?.kind, "expanded", `${tag}: expanded variant`);
    eq(g.variant.version, 1, `${tag}: variant version`);
    eq(tally(g.hexes.map((h) => h.terrain)), tally(Object.entries(terrainWant).flatMap(([t, n]) => Array(n).fill(t))), `${tag}: terrain counts`);
    const land = g.hexes.filter((h) => h.terrain !== "waste");
    const waste = g.hexes.filter((h) => h.terrain === "waste");
    ok(waste.every((h) => h.pip === null), `${tag}: no token on a waste`);
    ok(land.every((h) => h.pip !== null), `${tag}: every land hex has a token`);
    eq(sorted(land.map((h) => h.pip)), sorted(EXPANDED_TOKENS), `${tag}: the 28 extension tokens`);
    eq(tally(land.map((h) => h.pip)), { 2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 8: 3, 9: 3, 10: 3, 11: 3, 12: 2 }, `${tag}: token frequencies`);
    eq(sorted(g.variant.wastes), sorted(waste.map((h) => h.id)), `${tag}: both wastes recorded`);
    eq(g.robberHex, g.variant.wastes[0], `${tag}: the wayfarer starts on a waste`);
    eq(g.hexes.filter((h) => h.blocked).map((h) => h.id), wayfarerMode === "off" ? [] : [g.robberHex], `${tag}: only the wayfarer's waste is blocked`);
    if (numberTokens === "official") {
      const { start, direction } = g.variant.spiral;
      orientations.add(`${start} ${direction}`);
      const [q, r] = start.split(",").map(Number);
      const byId = new Map(g.hexes.map((h) => [h.id, h]));
      const seq = spiralPath(EXPANDED_COORDS, { q, r }, direction).map((c) => byId.get(key(c.q, c.r))).filter((h) => h.terrain !== "waste").map((h) => h.pip);
      eq(seq, EXPANDED_TOKENS, `${tag}: tokens follow the recorded spiral`);
    } else {
      eq(g.variant.spiral, undefined, `${tag}: no spiral recorded for random tokens`);
      const red = land.filter((h) => h.pip === 6 || h.pip === 8);
      for (let a = 0; a < red.length; a++) for (let b = a + 1; b < red.length; b++) {
        const dq = red[a].q - red[b].q, dr = red[a].r - red[b].r;
        ok(Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) > 1, `${tag}: random red tokens do not touch`);
      }
    }
    // Docks: eleven distinct coastal edges, 22 distinct land corners, the exact kind multiset.
    const counts = hexCount(g);
    const byId = new Map(g.vertices.map((v) => [v.id, v]));
    const harborCorners = g.vertices.filter((v) => v.harbor);
    eq(harborCorners.length, 22, `${tag}: 22 dock corners`);
    const docks = g.edges.filter((e) => counts.get(e.id) === 1 && byId.get(e.va).harbor && byId.get(e.va).harbor === byId.get(e.vb).harbor);
    eq(docks.length, 11, `${tag}: 11 dock edges`);
    eq(new Set(docks.flatMap((e) => [e.va, e.vb])).size, 22, `${tag}: dock edges share no corner`);
    eq(sorted(docks.flatMap((e) => [e.va, e.vb])), sorted(harborCorners.map((v) => v.id)), `${tag}: every dock corner is on a dock edge`);
    ok(docks.every((e) => byId.get(e.va).hexes.length >= 1 && byId.get(e.vb).hexes.length >= 1), `${tag}: two land corners per dock`);
    eq(tally(docks.map((e) => byId.get(e.va).harbor)), dockWant, `${tag}: dock kinds`);
    // isle-renderer.ts pairs neighbouring same-kind harbor corners into one dock, which holds only while docks sit at least
    // three coast edges apart.
    const at = coastLoop(g.edges, counts).flatMap((e, i) => (docks.includes(e) ? [i] : [])).sort((a, b) => a - b);
    ok(at.every((x, i) => ((at[(i + 1) % at.length] - x + 38) % 38) >= 3), `${tag}: docks at least three coast edges apart`);
    // Supplies and seats.
    eq(g.bank, { timber: 24, clay: 24, wool: 24, grain: 24, ore: 24 }, `${tag}: bank 24 each`);
    eq(Object.values(g.bank).reduce((s, n) => s + n, 0), 120, `${tag}: 120 bank cards`);
    eq(g.deck.length, 34, `${tag}: 34 fortunes`);
    eq(tally(g.deck), { knight: 20, vp: 5, road: 3, plenty: 3, monopoly: 3 }, `${tag}: fortune kinds`);
    eq(g.players.length, seats, `${tag}: seat count`);
    eq(g.players.map((p) => p.id), ["p0", "p1", "p2", "p3", "p4", "p5"].slice(0, seats), `${tag}: seat ids`);
    eq(g.players.map((p) => p.color), EXPANDED_COLORS.slice(0, seats), `${tag}: seat colours`);
    ok(g.players.every((p) => p.pathsLeft === 15 && p.outpostsLeft === 5 && p.strongholdsLeft === 4), `${tag}: pieces per seat unchanged`);
    ok(g.players.every((p) => p.name && !p.name.includes("undefined")), `${tag}: every seat has a name`);
    eq(g.players.map((p) => p.kind), g.players.map((_, i) => (i < humans.length ? "human" : "bot")), `${tag}: humans then bots`);
    eq(sorted(Object.keys(g)), sorted([...Object.keys(createGame({ seed, humans: [], bots: 3 })), "variant"]), `${tag}: classic state fields plus variant`);
  }
}
eq(orientations.size, 12, "all six corners and both directions occur");

// 4. Six unique seats and colours, including the two added families.
{
  const six = createAnyGame({ seed: 3, humans: [], bots: 6 });
  eq(new Set(six.players.map((p) => p.id)).size, 6, "six unique seat ids");
  eq(new Set(six.players.map((p) => p.color)).size, 6, "six unique colours");
  eq(new Set(six.players.map((p) => p.name)).size, 6, "six unique default names");
  ok(six.players.some((p) => p.color === "#216d3c") && six.players.some((p) => p.color === "#805532"), "green and brown seats");
  eq(createAnyGame({ seed: 3, humans: [], bots: 9 }).players.length, 6, "never more than six seats");
  eq(createAnyGame({ seed: 3, humans: [], bots: 5 }).players.length, 5, "five seats");
}

// 5. Classic parity: sha256 prefixes of JSON.stringify(createGame(...)) generated from origin/main af826235 (before this
// change) with a throwaway script. Both createGame and createAnyGame must still deal those exact states.
const seeds = [0, 1, 2, 7, 11, 42, 99, 1049, 1150, 12345, 20260921, 987654321];
const cases = [
  (seed) => ({ seed, humans: [], bots: 3 }),
  (seed) => ({ seed, humans: [{ name: "Ember" }], bots: 3 }),
  (seed) => ({ seed, humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, wayfarerMode: "off", numberTokens: "random" }),
  (seed) => ({ seed, humans: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }], bots: 0, winnerFirst: true, victoryTarget: 7 }),
];
const mainHashes = ["308d1fdec2e9df62","b7b2cf8b63852db1","63661f0e044bfdaa","7ec7f7b1d17fce31","d1a21f1591155307","c1fca1830912c558","fbb4c4372f106106","566e08be38a13f2a","a7b910d2e0f5353b","a81fca9f6e0aa727","db740d2d5c43e81f","d1ad3fe248e314ba","abfb9773ba81c3a2","9b012a8715480617","b72431bda09978f0","7f6dd6d6fbf38c15","eab34cf3314a55c3","03385e8543a81432","5ce6f72fe5077eb9","8f0b0ba56ffb4ef7","32af9a8a9a074700","50c49270959f2d8f","456e886886e14ce2","d3f8fb8d21fcd0a6","57107ed01b39bc67","c7ee0681622c9e34","7f38a173fc94fca1","acb4d9c50294c720","764a0f733643fc03","0b46f7de98fe4f09","b25bf7f9f9fd3913","7513d181beb02ffa","5b46f7823af3e847","c4d302b08b09d8b4","a5991cb33fb85ed0","0cfb5edbef164dda","2db2aed6c5502ffc","3a76e2f5b9c5c15f","8a19e349fab28452","885710567f39e132","74f5a767af497423","f98231ab7055fab3","00b052a7029dc1c7","3c10d834373dea05","cff0f36feaaad9eb","1fab996786539f2d","6ecad7b99eeebba1","49eb02562ba98608"];
const hash = (g) => createHash("sha256").update(JSON.stringify(g)).digest("hex").slice(0, 16);
let n = 0;
for (const seed of seeds) for (const c of cases) {
  const want = mainHashes[n++];
  eq(hash(createGame(c(seed))), want, `classic createGame, seed ${seed}, case ${(n - 1) % 4}`);
  const any = createAnyGame(c(seed));
  eq(hash(any), want, `classic createAnyGame, seed ${seed}, case ${(n - 1) % 4}`);
  eq("variant" in any, false, `classic seed ${seed}: no variant field`);
}
eq(n, 48, "48 classic parity games");

console.log(`expanded-board-prove: ${games} expanded games over 200 seeds, 12 spiral orientations, ${n} classic parity games, ${checks} checks passed`);
