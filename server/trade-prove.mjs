import { createGame } from "../src/lib/game/board.ts";
import { applyAction, legalSettle, legalRoads } from "../src/lib/game/rules.ts";

function game() {
  const g = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 3 });
  for (const v of g.vertices) v.harbor = null;
  return g;
}

let g = game();
g.phase = "main";
g.current = "p0";
g.players[0].resources.wool = 4;
g.bank.ore = 5;
let next = applyAction(g, "p0", { type: "bankTrade", give: "wool", want: "ore" });
if (next.error) throw new Error(next.error);
g = next.state;
if (g.players[0].resources.wool !== 0 || g.players[0].resources.ore !== 1 || g.bank.ore !== 4) {
  console.log("FAIL bank", g.players[0].resources, g.bank.ore);
  process.exit(1);
}
console.log("4 wool became 1 ore, bank ore", g.bank.ore);

g.players[0].resources.wool = 3;
const short = applyAction(g, "p0", { type: "bankTrade", give: "wool", want: "ore" });
if (!short.error || short.state.players[0].resources.wool !== 3) {
  console.log("FAIL 3 wool", short.error, short.state.players[0].resources.wool);
  process.exit(1);
}
console.log("3 wool at 4:1:", short.error);

g = game();
for (const h of g.hexes) h.pip = null;
g.players[0].resources.timber = 8;
g.phase = "roll";
g.current = "p0";
for (let i = 0; i < 80; i++) {
  g.phase = "roll";
  const rolled = applyAction(g, "p0", { type: "roll" });
  g = rolled.state;
  if (g.dice[0] + g.dice[1] === 7) break;
}
if (g.discardNeeded.p0 !== 4) {
  console.log("FAIL discard need", g.discardNeeded, g.dice);
  process.exit(1);
}
const bad = applyAction(g, "p0", { type: "discard", resources: { timber: 3 } });
if (!bad.error || bad.state.players[0].resources.timber !== 8) {
  console.log("FAIL discard 3", bad.error);
  process.exit(1);
}
console.log("discard 3 rejected, hand", bad.state.players[0].resources.timber);
const ok = applyAction(g, "p0", { type: "discard", resources: { timber: 4 } });
if (ok.error || ok.state.players[0].resources.timber !== 4) {
  console.log("FAIL discard 4", ok.error, ok.state.players[0].resources);
  process.exit(1);
}
console.log("discard 4 accepted, hand", ok.state.players[0].resources.timber);

g = game();
const hex = g.hexes.find((h) => h.terrain !== "waste");
const verts = g.vertices.filter((v) => v.hexes.includes(hex.id)).slice(0, 2);
verts[0].building = { playerId: "p0", kind: "outpost" };
verts[1].building = { playerId: "p1", kind: "outpost" };
g.players[1].resources.ore = 1;
g.phase = "robber";
g.current = "p0";
g.robberHex = "none";
const stolen = applyAction(g, "p0", { type: "moveRobber", hexId: hex.id, stealFrom: "p1" });
if (stolen.error) throw new Error(stolen.error);
const ore0 = stolen.state.players[0].resources.ore;
const ore1 = stolen.state.players[1].resources.ore;
if (ore0 !== 1 || ore1 !== 0) {
  console.log("FAIL steal", ore0, ore1);
  process.exit(1);
}
console.log("one ore moved", ore0, ore1);

let setup = game();
const spot = legalSettle(setup, setup.current, true)[0];
setup = applyAction(setup, setup.current, { type: "setupSettle", vertexId: spot }).state;
const road = legalRoads(setup, setup.current, true)[0];
if (!road) throw new Error("no setup road");
console.log("legal settle and road exist", spot, road);
