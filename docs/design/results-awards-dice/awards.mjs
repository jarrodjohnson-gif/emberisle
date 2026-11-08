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
// Pass 3: the winner gets the first of the seven main titles nobody holds whose `min` it reaches, or no chip (the win is
//         its moment). The winner never gets a fallback.
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
    for (const p of left) out[p.id] = earned(p) === low ? { title: "Dry spell", fact: low ? `gathered only ${n(low, "good")} from rolls` : "gathered no goods from rolls" } : { title: "Good sport", fact: "played to the last turn" };
  }
  const i = AWARDS.findIndex((a, k) => !used.has(k) && a.count(g, winner) >= a.min);
  if (i >= 0) out[winner.id] = { title: AWARDS[i].title(g, winner), fact: AWARDS[i].fact(AWARDS[i].count(g, winner), g, winner) };
  return out;
}

// Two dice: the chance of each sum 2..12 is (6 - |7 - s|) / 36.
export const chance = (s) => (6 - Math.abs(7 - s)) / 36;

// The smallest game the dice test runs on. Below it the line is always the neutral one.
export const MIN_ROLLS = 30;
// Chi-square critical values at 5 % for 1..10 degrees of freedom.
const CRIT5 = [3.841, 5.991, 7.815, 9.488, 11.07, 12.592, 14.067, 15.507, 16.919, 18.307];

// Bins of sums with an expected count of at least 5: merge the smallest bin into its smaller neighbour until all reach 5.
export function bins(total) {
  const b = Array.from({ length: 11 }, (_, i) => ({ sums: [i + 2], e: total * chance(i + 2) }));
  for (;;) {
    const i = b.reduce((m, x, k) => (x.e < b[m].e ? k : m), 0);
    if (b[i].e >= 5 || b.length <= 2) return b;
    const j = i === 0 ? 1 : i === b.length - 1 ? i - 1 : b[i - 1].e <= b[i + 1].e ? i - 1 : i + 1;
    const [lo, hi] = [Math.min(i, j), Math.max(i, j)];
    b.splice(lo, 2, { sums: [...b[lo].sums, ...b[hi].sums], e: b[lo].e + b[hi].e });
  }
}

// Whether the whole 2..12 spread is unlikely for fair dice: chi-square over the bins, 5 % level.
export function unusual(rollSums) {
  const total = rollSums.reduce((a, b) => a + b, 0);
  if (total < MIN_ROLLS) return null;
  const b = bins(total);
  const x2 = b.reduce((a, { sums, e }) => { const k = sums.reduce((s, x) => s + rollSums[x - 2], 0); return a + (k - e) ** 2 / e; }, 0);
  return x2 > CRIT5[b.length - 2] ? x2 : null;
}

const list = (xs) => (xs.length === 1 ? `${xs[0]}` : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// The one dice line, or null to hide the strip (no rollSums: an old save or a game from before the build; or no rolls).
// Unusual spread: name the sum furthest from its odds. Otherwise, and under MIN_ROLLS: the most and least common sums,
// with no judgement. `wording` "A" or "B" is the owner's choice (README, The dice sentence).
export function diceLine(rollSums, wording = "A") {
  if (!Array.isArray(rollSums) || rollSums.length !== 11) return null;
  const total = rollSums.reduce((a, b) => a + b, 0);
  if (!total) return null;
  if (unusual(rollSums)) {
    let pick = null;
    for (let s = 2; s <= 12; s++) {
      const k = rollSums[s - 2], e = total * chance(s), z = (k - e) / Math.sqrt(e);
      if (!pick || Math.abs(z) > Math.abs(pick.z)) pick = { s, k, e, z };
    }
    const fact = `${pick.s} came up ${pick.z < 0 ? "only " : ""}${n(pick.k, "time")}, about ${Math.round(pick.e)} expected.`;
    return { total, sum: pick.s, line: wording === "A" ? `Unusual dice: ${fact}` : `${fact} Fair dice do that less than 1 game in 20.` };
  }
  const hi = Math.max(...rollSums), lo = Math.min(...rollSums);
  if (hi === lo) return { total, sum: null, line: `Every sum came up ${n(hi, "time")}.` };
  const at = (k) => rollSums.flatMap((c, i) => (c === k ? [i + 2] : []));
  const most = `${list(at(hi))} came up most, ${n(hi, "time")}${at(hi).length > 1 ? " each" : ""}.`;
  const least = lo === 0 ? `${list(at(0))} never came up.` : `${list(at(lo))} came up least, ${n(lo, "time")}${at(lo).length > 1 ? " each" : ""}.`;
  const close = wording === "B" && total >= MIN_ROLLS ? "Close to the odds. " : "";
  return { total, sum: null, line: `${close}${most} ${least}` };
}
