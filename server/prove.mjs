import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalSettle, legalRoads } from "../src/lib/game/rules.ts";

function fresh() {
  return createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 7 });
}

function timberSetup(bank) {
  const g = fresh();
  const hex = g.hexes.find((h) => h.terrain === "timber");
  for (const h of g.hexes) {
    h.pip = null;
    h.blocked = false;
  }
  hex.pip = 6;
  const verts = g.vertices.filter((v) => v.hexes.includes(hex.id)).slice(0, 2);
  verts[0].building = { playerId: "p0", kind: "outpost" };
  verts[1].building = { playerId: "p1", kind: bank === 3 ? "stronghold" : "outpost" };
  g.bank.timber = bank;
  g.phase = "roll";
  g.current = "p0";
  return { g, verts };
}

function rollUntil(g, sum) {
  for (let i = 0; i < 80; i++) {
    g.phase = "roll";
    g.current = "p0";
    const next = applyAction(g, "p0", { type: "roll" });
    if (next.error) throw new Error(next.error);
    g = next.state;
    if (g.dice[0] + g.dice[1] === sum) return g;
  }
  throw new Error("no roll");
}

let { g } = timberSetup(1);
const before = JSON.stringify(g.players.map((p) => p.resources.timber));
g = rollUntil(g, 6);
const after = g.players.map((p) => p.resources.timber);
if (after.some((n, i) => n !== JSON.parse(before)[i]) || g.bank.timber !== 1) {
  console.log("FAIL short bank", before, after, g.bank.timber);
  process.exit(1);
}
console.log("short bank pays nobody: timber hands", after, "bank", g.bank.timber);

({ g } = timberSetup(3));
g = rollUntil(g, 6);
const paid = g.players.map((p) => p.resources.timber);
if (paid[0] !== 1 || paid[1] !== 2 || g.bank.timber !== 0) {
  console.log("FAIL full bank", paid, g.bank.timber);
  process.exit(1);
}
console.log("bank of 3 pays 1 and 2:", paid);

const counts = {};
let diceGame = fresh();
for (const h of diceGame.hexes) h.pip = null;
for (let i = 0; i < 600; i++) {
  diceGame.phase = "roll";
  diceGame.current = "p0";
  const next = applyAction(diceGame, "p0", { type: "roll" });
  diceGame = next.state;
  const sum = diceGame.dice[0] + diceGame.dice[1];
  counts[sum] = (counts[sum] ?? 0) + 1;
}
console.log("histogram", counts);
if (counts[7] < 80 || counts[7] > 120) {
  console.log("FAIL histogram");
  process.exit(1);
}

let setup = fresh();
const goodsAt = [];
for (let step = 0; step < 12; step++) {
  const pid = setup.current;
  if (setup.phase === "setupSettle") {
    const id = legalSettle(setup, pid, true)[0];
    const beforeCards = { ...setup.players.find((p) => p.id === pid).resources };
    const next = applyAction(setup, pid, { type: "setupSettle", vertexId: id });
    if (next.error) throw new Error(next.error);
    setup = next.state;
    const p = setup.players.find((x) => x.id === pid);
    const gained = ["timber", "clay", "wool", "grain", "ore"].reduce((n, r) => n + p.resources[r] - beforeCards[r], 0);
    goodsAt.push(gained);
  } else {
    const id = legalRoads(setup, pid, true)[0];
    const next = applyAction(setup, pid, { type: "setupRoad", edgeId: id });
    if (next.error) throw new Error(next.error);
    setup = next.state;
  }
}
const firstRound = goodsAt.slice(0, 3);
const secondRound = goodsAt.slice(3);
if (firstRound.some((n) => n !== 0) || secondRound.some((n) => n <= 0)) {
  console.log("FAIL setup goods", goodsAt);
  process.exit(1);
}
console.log("setup goods first then second", goodsAt);

let illegal = fresh();
const spot = legalSettle(illegal, illegal.current, true)[0];
let placed = applyAction(illegal, illegal.current, { type: "setupSettle", vertexId: spot });
illegal = placed.state;
const road = legalRoads(illegal, illegal.current, true)[0];
placed = applyAction(illegal, illegal.current, { type: "setupRoad", edgeId: road });
illegal = placed.state;
const built = illegal.vertices.filter((v) => v.building).length;
const again = applyAction(illegal, illegal.current, { type: "setupSettle", vertexId: spot });
const builtAfter = again.state.vertices.filter((v) => v.building).length;
if (!again.error || builtAfter !== built) {
  console.log("FAIL illegal", again.error, built, builtAfter);
  process.exit(1);
}
console.log("illegal second place:", again.error, "buildings", builtAfter);
