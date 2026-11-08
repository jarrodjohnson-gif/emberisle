// #1452 and #1453 design: the award rules and the dice line, as plain functions. Throwaway: a build writes its own in src/.
// Input is the finished game as the host sends it at the win, plus the proposed counters (README, "What the host records").

export const LABEL = { timber: "Wood", clay: "Brick", wool: "Wool", grain: "Grain", ore: "Ore" };
const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

// Each title: the count it ranks by, the smallest count that earns it, and its fact line. Order is priority.
export const AWARDS = [
  { title: () => "Wayfarer's favourite", min: 3, count: (g, p) => p.goodsLost ?? 0, fact: (k) => `lost ${n(k, "good")} to steals` },
  { title: () => "Hit by 7s", min: 4, count: (g, p) => p.tally?.discarded ?? 0, fact: (k) => `threw away ${n(k, "good")} on 7s` },
  { title: () => "Trade broker", min: 2, count: (g, p) => p.tally?.tableTrades ?? 0, fact: (k) => `${n(k, "trade")} with the table` },
  { title: (g, p) => `${LABEL[topGood(p)]} baron`, min: 8, count: (g, p) => p.tally?.earned[topGood(p)] ?? 0, fact: (k, g, p) => `${k} ${LABEL[topGood(p)].toLowerCase()} from rolls` },
  { title: () => "Light fingers", min: 3, count: (g, p) => p.tally?.stole ?? 0, fact: (k) => `stole ${n(k, "good")}` },
  { title: () => "Harbour regular", min: 4, count: (g, p) => p.tally?.bankTrades ?? 0, fact: (k) => `${n(k, "trade")} at the bank and docks` },
  { title: () => "Road crew", min: 8, count: (g, p) => 15 - p.pathsLeft, fact: (k) => `built ${n(k, "path")}` },
];

function topGood(p) {
  const e = p.tally?.earned ?? {};
  return Object.keys(LABEL).reduce((a, b) => ((e[b] ?? 0) > (e[a] ?? 0) ? b : a));
}
const earned = (p) => Object.values(p.tally?.earned ?? {}).reduce((a, b) => a + b, 0);

// One award per player at most; every player who did not win gets exactly one.
// Pass 1: losers only. Each title in order goes to the highest count among losers without a title, if it reaches `min`.
//         A tie at the top shares the title. A title that nobody reaches is skipped.
// Pass 2: fallbacks for losers still without one. "Dry spell" (fewest goods from rolls, ties share), then "Good sport".
// Pass 3: the winner gets the first title nobody holds whose `min` it reaches, or no chip (the win is its moment).
export function islandAwards(g) {
  const out = {};
  const losers = g.players.filter((p) => p.id !== g.winner);
  const winner = g.players.find((p) => p.id === g.winner);
  const used = new Set();
  for (const [i, a] of AWARDS.entries()) {
    const free = losers.filter((p) => !out[p.id]);
    const best = Math.max(0, ...free.map((p) => a.count(g, p)));
    if (best < a.min) continue;
    for (const p of free) if (a.count(g, p) === best) out[p.id] = { title: a.title(g, p), fact: a.fact(best, g, p) };
    used.add(i);
  }
  const left = losers.filter((p) => !out[p.id]);
  if (left.length) {
    const low = Math.min(...left.map(earned));
    for (const p of left) out[p.id] = earned(p) === low ? { title: "Dry spell", fact: `gathered only ${n(low, "good")} from rolls` } : { title: "Good sport", fact: "played to the last turn" };
  }
  const i = AWARDS.findIndex((a, k) => !used.has(k) && a.count(g, winner) >= a.min);
  if (i >= 0) out[winner.id] = { title: AWARDS[i].title(g, winner), fact: AWARDS[i].fact(AWARDS[i].count(g, winner), g, winner) };
  return out;
}

// Two dice: the chance of each sum 2..12 is (6 - |7 - s|) / 36.
export const chance = (s) => (6 - Math.abs(7 - s)) / 36;

// The one dice line: the sum furthest from its odds (in standard deviations); "ran true" when every sum is within 1.5.
export function diceLine(rollSums) {
  const total = rollSums.reduce((a, b) => a + b, 0);
  let pick = null;
  for (let s = 2; s <= 12; s++) {
    const k = rollSums[s - 2], e = total * chance(s), z = (k - e) / Math.sqrt(e * (1 - chance(s)));
    if (!pick || Math.abs(z) > Math.abs(pick.z)) pick = { s, k, e, z };
  }
  const about = `about ${Math.round(pick.e)} expected`;
  const line = Math.abs(pick.z) < 1.5 ? "The dice ran true to the odds."
    : pick.z > 0 ? `${pick.s} came up ${n(pick.k, "time")} (${about}).`
    : `${pick.s} came up only ${n(pick.k, "time")} (${about}).`;
  return { total, line, sum: Math.abs(pick.z) < 1.5 ? null : pick.s };
}
