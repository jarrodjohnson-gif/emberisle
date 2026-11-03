import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createGame } from "../src/lib/game/board.ts";

const order = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];
const outer = [[0,-2],[1,-2],[2,-2],[2,-1],[2,0],[1,1],[0,2],[-1,2],[-2,2],[-2,1],[-2,0],[-1,-1]];
const inner = [[0,-1],[1,-1],[1,0],[0,1],[-1,1],[-1,0]];
const rotate = ([q, r], times) => { while (times-- > 0) [q, r] = [-r, q+r]; return [q, r]; };
const paths = [];
for (let corner = 0; corner < 6; corner++) for (const dir of [1, -1]) {
  paths.push([...outer.map((_, i) => outer[(i * dir + 12) % 12]), ...inner.map((_, i) => inner[(i * dir + 6) % 6]), [0,0]].map(p => rotate(p, corner)));
}
const seen = new Set();
for (let seed = 0; seed < 1000; seed++) {
  const opts = { seed, humans: [], bots: 3 };
  const game = createGame(opts);
  assert.deepEqual(game, createGame(opts), `seed ${seed} is deterministic`);
  assert.deepEqual(game, createGame({ ...opts, numberTokens: "official" }));
  const byCoord = new Map(game.hexes.map(h => [`${h.q},${h.r}`, h]));
  assert.equal(game.hexes.filter(h => h.terrain === "waste" && h.pip === null).length, 1);
  const matches = paths.map((path, i) => ({i, values: path.map(([q,r]) => byCoord.get(`${q},${r}`)).filter(h => h.terrain !== "waste").map(h => h.pip)})).filter(x => JSON.stringify(x.values) === JSON.stringify(order));
  assert.equal(matches.length, 1, `seed ${seed} has exactly one official spiral`);
  seen.add(matches[0].i);
  for (const mode of ["official", "random"]) {
    const hexes = createGame({ ...opts, numberTokens: mode }).hexes;
    const red = hexes.filter(h => h.pip === 6 || h.pip === 8);
    assert.equal(red.length, 4);
    for (let i = 0; i < red.length; i++) for (let j = i + 1; j < red.length; j++) {
      const dq = red[i].q - red[j].q, dr = red[i].r - red[j].r;
      assert.ok(Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) > 1, `${mode}, seed ${seed}: red tokens touch`);
    }
  }
}
assert.equal(seen.size, 12, "all six corners and both directions occur");
const baseline = new Map([[0,"95a6da2ecb634bd82de34fdaee2d9bd975cd5f04f0c49be76cf0ebebb95f4ead"],[1,"afc00e1729890de97888188eca83e983e30d900378fe3b47dcaa9c4f9121d39c"],[42,"5a220b3ae7caa720bfa3ae347ed1ff40916e51a7528769a2a9978d388cbe9b80"],[12345,"65b9fb921e92b7461db1fdb7318f5ad453f2445954a0aebd9aa6d480c9d9e5ed"],[20260921,"bfcf123cecbd74e6775ed631929827169ab3682dadacbf8f839bbfedf3bc7ada"]]);
for (const [seed, hash] of baseline) {
  const game = createGame({ seed, humans: [], bots: 3, numberTokens: "random" });
  assert.equal(createHash("sha256").update(JSON.stringify(game)).digest("hex"), hash, `random baseline seed ${seed}`);
}
console.log("spiral-prove: 1000 seeds, 12 orientations, both modes and 5 random baseline games passed");
