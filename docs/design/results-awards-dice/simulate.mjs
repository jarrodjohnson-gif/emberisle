// #1452 and #1453 design: the numbers behind the README's dice and award rules. Throwaway, not a CI proof.
// Part 1: fair crypto dice (node:crypto, as rules.ts rollDie), 20,000 games per length: how often the line calls the dice unusual.
// Part 2: the edge cases of diceLine and islandAwards.
// Part 3: whole bot games (play.mjs): how the titles fall. Writes simulation.json here with --save.
//   node --import ./server/register.mjs docs/design/results-awards-dice/simulate.mjs [--games=10] [--save]
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AWARDS, MIN_ROLLS, diceLine, islandAwards, unusual } from "./awards.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = { falseAlarm: {}, games: [] };

const GAMES = 20000;
for (const rolls of [MIN_ROLLS, 40, 60, 80, 113, 150, 200]) {
  let hit = 0;
  for (let g = 0; g < GAMES; g++) {
    const sums = Array(11).fill(0);
    for (let r = 0; r < rolls; r++) sums[randomInt(1, 7) + randomInt(1, 7) - 2]++;
    if (unusual(sums)) hit++;
  }
  out.falseAlarm[rolls] = +(hit / GAMES * 100).toFixed(1);
}
console.log("fair dice, % of games called unusual:", JSON.stringify(out.falseAlarm));

// Edge cases.
assert.equal(diceLine(undefined), null, "no rollSums hides the strip");
assert.equal(diceLine(Array(11).fill(0)), null, "no rolls hides the strip");
assert.equal(unusual([0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]), null, "under MIN_ROLLS there is no test");
assert.match(diceLine([0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]).line, /^7 came up most, 5 times\. 2 and 12 never came up\.$/);
assert.match(diceLine([20, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0]).line, /^Unusual dice: 2 came up 20 times, about 1 expected\.$/);
const pictured = [3, 6, 17, 17, 14, 12, 21, 11, 5, 4, 3];
out.pictured = { A: diceLine(pictured, "A"), B: diceLine(pictured, "B") };
console.log("pictured game:", JSON.stringify(out.pictured));
const blank = (id) => ({ id, pathsLeft: 15, goodsLost: 0 });
const aw = islandAwards({ winner: "p0", players: ["p0", "p1", "p2", "p3"].map(blank) });
assert.equal(aw.p0, undefined, "a winner with nothing gets no chip, never a fallback");
for (const id of ["p1", "p2", "p3"]) assert.deepEqual(aw[id], { title: "Dry spell", fact: "gathered no goods from rolls" }, "all-zero losers share Dry spell");
console.log("edge cases: ok");

// Whole bot games.
const games = Number(process.argv.find((a) => a.startsWith("--games="))?.slice(8) ?? 10);
if (games) {
  const { play } = await import("./play.mjs");
  const main = new Set(AWARDS.map((a) => a.title({}, { tally: { earned: { timber: 1 } } })).map((t) => (t.endsWith(" baron") ? "baron" : t)));
  for (let i = 0; i < games; i++) {
    const { final } = play(["Jarrod", "Josh", "Maya", "Bartholomew"], 2000 + i);
    const a = islandAwards(final);
    const titles = final.players.map((p) => a[p.id]?.title ?? null);
    const kind = (t) => (t?.endsWith(" baron") ? "baron" : t);
    out.games.push({
      rolls: final.rollSums.reduce((x, y) => x + y, 0),
      titles: Object.fromEntries(final.players.map((p, k) => [`${p.id}${p.id === final.winner ? " (won)" : ""}`, titles[k]])),
      losersOnMain: final.players.every((p, k) => p.id === final.winner || main.has(kind(titles[k]))),
      winnerChip: !!a[final.winner],
      unusualDice: !!unusual(final.rollSums),
    });
    console.log(JSON.stringify(out.games.at(-1)));
  }
  out.summary = {
    games,
    everyLoserOnMainTitle: out.games.filter((g) => g.losersOnMain).length,
    winnerGotChip: out.games.filter((g) => g.winnerChip).length,
    diceCalledUnusual: out.games.filter((g) => g.unusualDice).length,
  };
  console.log("summary:", JSON.stringify(out.summary));
}
if (process.argv.includes("--save")) writeFileSync(path.join(dir, "simulation.json"), `${JSON.stringify(out, null, 2)}\n`);
