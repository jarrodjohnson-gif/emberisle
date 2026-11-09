// #1452 and #1453: the results screen's award rules and dice line (src/lib/game/story.ts), with no browser.
// - The pictured game of the design packet (docs/design/results-awards-dice/README.md) gives its four awards and its
//   plain-facts dice line; its winning move is played here with the real rules.
// - islandAwards: each player holds at most one title and every loser exactly one; ties share; a title below its threshold
//   is skipped; "best among those without one yet"; the fallbacks "Dry spell" and "Good sport" go to losers only; the
//   winner never gets a fallback and gets nothing when no title is left; an old save with no counts gives a shared Dry spell.
// - diceLine: the exact sentence for an unusual spread, a usual one, under 30 rolls and a sum that never came up; no
//   strip with no count kept or no rolls; the test's bins at 113 rolls.
// - False alarms, by simulation: 20,000 fair games at each length from 30 to 200 rolls are called unusual at about 5 % or
//   less, and no game under 30 rolls ever is. The dice come from a seeded generator, so the numbers repeat run to run.
// Run: node --import ./server/register.mjs scripts/results-story-prove.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/lib/game/rules.ts";
import { AWARDS, bins, diceLine, islandAwards, MIN_ROLLS, unusual } from "../src/lib/game/story.ts";

// ---- The pictured game ---------------------------------------------------------------------------------------------------
const fixture = JSON.parse(readFileSync(new URL("./fixtures/results-story-game.json", import.meta.url), "utf8"));
const won = applyAction(fixture.before, fixture.actor, fixture.action);
assert.ifError(won.error);
const end = won.state;
assert.equal(end.phase, "over");
assert.equal(end.winner, "p0");
const named = (g, awards) => Object.fromEntries(g.players.map((p) => [p.name, awards[p.id] ? `${awards[p.id].title} · ${awards[p.id].fact}` : null]));
assert.deepEqual(named(end, islandAwards(end)), {
  Jarrod: "Ore baron · 63 ore from rolls",
  Josh: "Trade broker · 2 trades with the table",
  Maya: "Hit by 7s · threw away 8 goods on 7s",
  "Bartholomew Featherstonehaugh": "Wayfarer's favourite · lost 13 goods to steals",
}, "the pictured game's awards, as the README lists them");
// Maya threw away 8 goods and the winner 13: the title is best among those without one yet, and the fact is her own.
assert.equal(end.players.find((p) => p.id === "p0").tally.discarded, 13);
assert.deepEqual(end.rollSums, [3, 6, 17, 17, 14, 12, 21, 11, 5, 4, 3]);
assert.deepEqual(diceLine(end.rollSums), { total: 113, sum: null, line: "8 came up most, 21 times. 2 and 12 came up least, 3 times each." });
console.log("pictured game: Ore baron, Trade broker, Hit by 7s, Wayfarer's favourite; dice line states plain facts at 113 rolls");

// ---- islandAwards on made-up tables -----------------------------------------------------------------------------------
const zero = () => ({ earned: { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 }, discarded: 0, stole: 0, tableTrades: 0, bankTrades: 0 });
// A table of `n` seats; `set[i]` fills seat i's counts. p0 wins unless `winner` says otherwise.
function table(set, winner = "p0") {
  return {
    winner,
    players: set.map((s, i) => {
      const t = zero();
      Object.assign(t, s.tally ?? {});
      t.earned = { ...zero().earned, ...(s.earned ?? {}) };
      return { id: `p${i}`, name: `P${i}`, pathsLeft: 15 - (s.paths ?? 0), goodsLost: s.lost, tally: s.none ? undefined : t };
    }),
  };
}
const titles = (g) => {
  const a = islandAwards(g);
  return g.players.map((p) => (a[p.id] ? `${a[p.id].title} · ${a[p.id].fact}` : null));
};
// Every check below also holds the two rules every table must meet.
function rules(g, why) {
  const a = islandAwards(g);
  for (const p of g.players) {
    if (p.id === g.winner) continue;
    assert(a[p.id], `${why}: every loser holds a title`);
  }
  const w = a[g.winner];
  assert(!w || !["Dry spell", "Good sport"].includes(w.title), `${why}: the winner never gets a fallback`);
  assert.equal(Object.keys(a).length, new Set(Object.keys(a)).size);
  return titles(g);
}

assert.equal(AWARDS.length, 7, "seven main titles");
// Thresholds: one below each earns nothing, the threshold itself earns the title.
{
  const cases = [
    ["Wayfarer's favourite", 3, (k) => ({ lost: k }), (k) => `lost ${k} goods to steals`],
    ["Hit by 7s", 4, (k) => ({ tally: { discarded: k } }), (k) => `threw away ${k} goods on 7s`],
    ["Trade broker", 2, (k) => ({ tally: { tableTrades: k } }), (k) => `${k} trades with the table`],
    ["Brick baron", 8, (k) => ({ earned: { clay: k } }), (k) => `${k} brick from rolls`],
    ["Light fingers", 3, (k) => ({ tally: { stole: k } }), (k) => `stole ${k} goods`],
    ["Harbour regular", 4, (k) => ({ tally: { bankTrades: k } }), (k) => `${k} trades at the bank and docks`],
    ["Road crew", 8, (k) => ({ paths: k }), (k) => `built ${k} paths`],
  ];
  for (const [title, min, make, fact] of cases) {
    // The loser p1 sits at the threshold; one below it, the title is skipped and p1 falls back to Dry spell.
    const at = rules(table([{}, make(min)]), title);
    assert.equal(at[1], `${title} · ${fact(min)}`, `${title} at ${min}`);
    const below = rules(table([{}, make(min - 1)]), title);
    assert.notEqual(below[1].split(" · ")[0], title, `${title} below ${min} is skipped`);
  }
  console.log("thresholds: each of the seven titles is earned at its threshold and skipped one below it");
}
// Each good names its baron; the count is the most of one good.
assert.deepEqual(rules(table([{}, { earned: { timber: 9, ore: 8 } }]), "wood")[1], "Wood baron · 9 wood from rolls");
assert.deepEqual(rules(table([{}, { earned: { wool: 12 } }]), "wool")[1], "Wool baron · 12 wool from rolls");
assert.deepEqual(rules(table([{}, { earned: { grain: 10 } }]), "grain")[1], "Grain baron · 10 grain from rolls");
assert.deepEqual(rules(table([{}, { earned: { ore: 8 } }]), "ore")[1], "Ore baron · 8 ore from rolls");
// One of a thing reads in the singular.
assert.deepEqual(rules(table([{}, { tally: { tableTrades: 2 } }, { earned: { wool: 1 } }]), "singular"), [null, "Trade broker · 2 trades with the table", "Dry spell · gathered only 1 good from rolls"]);

// Priority, and "best among those without one yet": p1 leads every count but holds only the first title; the next
// title goes to the best of the rest, with that player's own number.
assert.deepEqual(
  rules(table([{}, { lost: 9, tally: { discarded: 20, tableTrades: 6 } }, { tally: { discarded: 5, tableTrades: 2 } }, { tally: { tableTrades: 3 } }]), "priority"),
  [null, "Wayfarer's favourite · lost 9 goods to steals", "Hit by 7s · threw away 5 goods on 7s", "Trade broker · 3 trades with the table"],
);
// Ties share a title, and each still holds only one.
assert.deepEqual(
  rules(table([{}, { lost: 4, tally: { discarded: 9 } }, { lost: 4 }, { tally: { discarded: 6 } }]), "tie"),
  [null, "Wayfarer's favourite · lost 4 goods to steals", "Wayfarer's favourite · lost 4 goods to steals", "Hit by 7s · threw away 6 goods on 7s"],
);
// Fallbacks: the fewest goods from rolls among those left is a Dry spell (ties share), anyone else is a Good sport.
assert.deepEqual(
  rules(table([{ earned: { ore: 30 } }, { earned: { timber: 5 } }, { earned: { clay: 3, wool: 2 } }, { earned: { grain: 7 } }]), "fallbacks"),
  ["Ore baron · 30 ore from rolls", "Dry spell · gathered only 5 goods from rolls", "Dry spell · gathered only 5 goods from rolls", "Good sport · played to the last turn"],
);
// The winner gets the first main title nobody holds whose threshold it reaches, never one a loser holds.
assert.deepEqual(rules(table([{ lost: 9, tally: { tableTrades: 5 } }, { lost: 3 }]), "winner leftover"), ["Trade broker · 5 trades with the table", "Wayfarer's favourite · lost 3 goods to steals"]);
// Nothing left that the winner reaches: no chip. The win is its moment.
assert.deepEqual(rules(table([{ lost: 9 }, { lost: 3 }, {}]), "winner none"), [null, "Wayfarer's favourite · lost 3 goods to steals", "Dry spell · gathered no goods from rolls"]);
// An old save with no counts: every loser shares a Dry spell and the winner gets nothing. goodsLost and paths still count.
assert.deepEqual(rules(table([{ none: true }, { none: true }, { none: true }, { none: true }]), "old save"), [null, "Dry spell · gathered no goods from rolls", "Dry spell · gathered no goods from rolls", "Dry spell · gathered no goods from rolls"]);
assert.deepEqual(rules(table([{ none: true, paths: 12 }, { none: true, lost: 5 }, { none: true }]), "old save counts"), ["Road crew · built 12 paths", "Wayfarer's favourite · lost 5 goods to steals", "Dry spell · gathered no goods from rolls"]);
// A loser may win the table on its own count: the winner is not part of the losers' pass at all.
assert.deepEqual(rules(table([{}, {}], "p1"), "second seat wins"), ["Dry spell · gathered no goods from rolls", null]);
console.log("awards: one title each at most, every loser exactly one, ties share, best among the rest, fallbacks for losers only, winner leftover or none");

// ---- diceLine --------------------------------------------------------------------------------------------------------
assert.equal(diceLine(undefined), null, "no count kept (an older game): no strip");
assert.equal(diceLine([1, 2, 3]), null, "a count of the wrong shape: no strip");
assert.equal(diceLine(Array(11).fill(0)), null, "no rolls: no strip");
assert.deepEqual(bins(113).map((b) => b.sums), [[2, 3], [4], [5], [6], [7], [8], [9], [10], [11, 12]], "the bins at 113 rolls");
assert.equal(unusual([3, 6, 17, 17, 14, 12, 21, 11, 5, 4, 3]), false, "the pictured game is not unusual");
// An unusual spread names the sum furthest from its odds.
const hot = [3, 6, 22, 9, 15, 13, 18, 7, 8, 5, 3];
assert.equal(unusual(hot), true);
assert.deepEqual(diceLine(hot), { total: 109, sum: 4, line: "Unusual dice: 4 came up 22 times, about 9 expected." });
const cold = [3, 6, 9, 12, 15, 1, 15, 12, 9, 6, 3];
assert.deepEqual(diceLine(cold), { total: 91, sum: 7, line: "Unusual dice: 7 came up only 1 time, about 15 expected." });
// A spread a little short of the cut-off is not unusual: its least common sum is named as a plain fact.
assert.deepEqual(diceLine([3, 6, 10, 13, 16, 2, 16, 13, 10, 6, 3]), { total: 98, sum: null, line: "6 and 8 came up most, 16 times each. 7 came up least, 2 times." });
// A sum that never came up, and ties in most and least.
assert.deepEqual(diceLine([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 0]), { total: 35, sum: null, line: "7 came up most, 6 times. 12 never came up." });
assert.deepEqual(diceLine([0, 2, 3, 4, 6, 5, 6, 4, 3, 2, 0]), { total: 35, sum: null, line: "6 and 8 came up most, 6 times each. 2 and 12 never came up." });
assert.deepEqual(diceLine([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), { total: 11, sum: null, line: "Every sum came up 1 time." });
// Under 30 rolls there is no test: the wildest spread still states plain facts.
assert.equal(MIN_ROLLS, 30);
const short = [29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
assert.equal(unusual(short), false);
assert.deepEqual(diceLine(short), { total: 29, sum: null, line: "2 came up most, 29 times. 3, 4, 5, 6, 7, 8, 9, 10, 11 and 12 never came up." });
assert.equal(unusual([30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), true, "the same spread at 30 rolls is tested, and is unusual");
console.log("dice line: unusual spreads name the furthest sum; usual ones, short games and a missing sum state plain facts; no count or no rolls draws no strip");

// ---- False alarms, by simulation ------------------------------------------------------------------------------------------
// mulberry32: a small seeded generator, so the simulation is the same every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const GAMES = 20000;
const rand = rng(1453);
const die = () => 1 + Math.floor(rand() * 6);
function rate(rolls) {
  let flagged = 0;
  for (let g = 0; g < GAMES; g++) {
    const sums = Array(11).fill(0);
    for (let r = 0; r < rolls; r++) sums[die() + die() - 2]++;
    if (unusual(sums)) flagged++;
    if (diceLine(sums).sum !== null) assert(unusual(sums), "only an unusual spread colours a bar");
  }
  return flagged / GAMES;
}
const table5 = {};
for (const rolls of [30, 40, 60, 80, 113, 150, 200]) {
  const r = rate(rolls);
  table5[rolls] = `${(r * 100).toFixed(1)} %`;
  assert(r <= 0.055, `${rolls} rolls: fair games called unusual ${(r * 100).toFixed(2)} %, more than about 5 %`);
  assert(r >= 0.02, `${rolls} rolls: the test still fires on fair dice now and then (${(r * 100).toFixed(2)} %)`);
}
let early = 0;
for (let rolls = 1; rolls < MIN_ROLLS; rolls++) early += rate(rolls) * GAMES;
assert.equal(early, 0, "no fair game under 30 rolls is ever called unusual");
console.log(`false alarms over ${GAMES} fair games at each length: ${JSON.stringify(table5)}; under 30 rolls: 0 of ${GAMES * (MIN_ROLLS - 1)}`);
console.log("results-story prove ok");
