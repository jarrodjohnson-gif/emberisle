// #1452 and #1453: the results screen's island awards and dice line, from the finished game only
// (docs/design/results-awards-dice/README.md, approved by the owner on 2026-11-09, option A). Imported only by the
// ResultsStory chunk, so none of it is in the first load.
import type { GameState, PlayerState, Resource } from "@/lib/game/types";

// The award titles name the goods as the README lists them.
const LABEL: Record<Resource, string> = { timber: "Wood", clay: "Brick", wool: "Wool", grain: "Grain", ore: "Ore" };
const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;

function topGood(p: PlayerState): Resource {
  const e = p.tally?.earned;
  return (Object.keys(LABEL) as Resource[]).reduce((a, b) => ((e?.[b] ?? 0) > (e?.[a] ?? 0) ? b : a));
}
const earned = (p: PlayerState) => Object.values(p.tally?.earned ?? {}).reduce((a, b) => a + b, 0);

// Each title: its name, the smallest count that earns it, the count it ranks by, and its fact line, where "#" is the count
// with its noun. The order is the priority. The goods baron (no name here) is named after the good its count is of.
type Rule = [title: string, min: number, count: (p: PlayerState) => number, fact: string, noun?: string];
export const AWARDS: Rule[] = [
  ["Wayfarer's favourite", 3, (p) => p.goodsLost ?? 0, "lost # to steals", "good"],
  ["Hit by 7s", 4, (p) => p.tally?.discarded ?? 0, "threw away # on 7s", "good"],
  ["Trade broker", 2, (p) => p.tally?.tableTrades ?? 0, "# with the table", "trade"],
  ["", 8, (p) => p.tally?.earned[topGood(p)] ?? 0, "# from rolls"],
  ["Light fingers", 3, (p) => p.tally?.stole ?? 0, "stole #", "good"],
  ["Harbour regular", 4, (p) => p.tally?.bankTrades ?? 0, "# at the bank and docks", "trade"],
  ["Road crew", 8, (p) => 15 - p.pathsLeft, "built #", "path"],
];

function award([title, , count, fact, noun]: Rule, p: PlayerState) {
  const good = LABEL[topGood(p)];
  const k = count(p);
  return { title: title || `${good} baron`, fact: fact.replace("#", noun ? n(k, noun) : `${k} ${good.toLowerCase()}`) };
}

export type Award = { title: string; fact: string };

// At most one title per player, and exactly one for every player who did not win. A title means "best among those
// without one yet": its fact line always shows the player's own true count.
// 1. Losers first: each title in order goes to the highest count among losers without a title, if it reaches `min`.
//    Ties share it. A title nobody reaches is skipped.
// 2. A loser still without one gets "Dry spell" if their goods from rolls are the fewest of those left (ties share), and
//    anyone left after that gets "Good sport".
// 3. The winner gets the first of the seven titles nobody holds whose `min` it reaches, or none: the win is its moment.
export function islandAwards(g: GameState): Record<string, Award> {
  const out: Record<string, Award> = {};
  const losers = g.players.filter((p) => p.id !== g.winner);
  const winner = g.players.find((p) => p.id === g.winner);
  const used = new Set<Rule>();
  for (const a of AWARDS) {
    const free = losers.filter((p) => !out[p.id]);
    const best = Math.max(0, ...free.map(a[2]));
    if (best < a[1]) continue;
    for (const p of free) if (a[2](p) === best) out[p.id] = award(a, p);
    used.add(a);
  }
  const left = losers.filter((p) => !out[p.id]);
  const low = Math.min(...left.map(earned));
  for (const p of left) {
    out[p.id] = earned(p) === low
      ? { title: "Dry spell", fact: low ? `gathered only ${n(low, "good")} from rolls` : "gathered no goods from rolls" }
      : { title: "Good sport", fact: "played to the last turn" };
  }
  const a = winner && AWARDS.find((r) => !used.has(r) && r[2](winner) >= r[1]);
  if (a && winner) out[winner.id] = award(a, winner);
  return out;
}

// Two dice: the chance of each sum 2 to 12 is (6 - |7 - s|) / 36.
export const chance = (s: number) => (6 - Math.abs(7 - s)) / 36;

// The fewest rolls the dice test runs on. Below it the line always states plain facts.
export const MIN_ROLLS = 30;
// Chi-square cut-offs at the 5 % level for 1 to 10 degrees of freedom.
const CRIT5 = [3.841, 5.991, 7.815, 9.488, 11.07, 12.592, 14.067, 15.507, 16.919, 18.307];

// The test's bins: sums whose expected count is under 5 merge with their smaller neighbour until every bin reaches 5.
export function bins(total: number) {
  const b = Array.from({ length: 11 }, (_, i) => ({ sums: [i + 2], e: total * chance(i + 2) }));
  for (;;) {
    const i = b.reduce((m, x, k) => (x.e < b[m]!.e ? k : m), 0);
    if (b[i]!.e >= 5 || b.length <= 2) return b;
    const j = i === 0 ? 1 : i === b.length - 1 ? i - 1 : b[i - 1]!.e <= b[i + 1]!.e ? i - 1 : i + 1;
    const lo = Math.min(i, j);
    const [x, y] = [b[lo]!, b[lo + 1]!];
    b.splice(lo, 2, { sums: [...x.sums, ...y.sums], e: x.e + y.e });
  }
}

// Whether the whole spread of sums is unlikely for fair dice: chi-square over the bins at the 5 % level. Never under
// MIN_ROLLS rolls.
export function unusual(rollSums: number[]) {
  const total = rollSums.reduce((a, b) => a + b, 0);
  if (total < MIN_ROLLS) return false;
  const b = bins(total);
  const x2 = b.reduce((a, { sums, e }) => a + (sums.reduce((k, s) => k + rollSums[s - 2]!, 0) - e) ** 2 / e, 0);
  return x2 > CRIT5[b.length - 2]!;
}

const list = (xs: number[]) => (xs.length === 1 ? `${xs[0]}` : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// The strip's one sentence (wording A: facts only), or null for no strip (no rollSums, as in an older game, or no rolls).
// An unusual spread names the sum furthest from its odds, whose bar is then drawn in sea ink (`sum`). Otherwise the
// most and least common sums, with no judgement.
export function diceLine(rollSums: number[] | undefined): { total: number; sum: number | null; line: string } | null {
  if (rollSums?.length !== 11) return null;
  const total = rollSums.reduce((a, b) => a + b, 0);
  if (!total) return null;
  if (unusual(rollSums)) {
    let pick = { s: 2, k: 0, e: 0, z: 0 };
    for (let s = 2; s <= 12; s++) {
      const k = rollSums[s - 2]!;
      const e = total * chance(s);
      const z = (k - e) / Math.sqrt(e);
      if (Math.abs(z) > Math.abs(pick.z)) pick = { s, k, e, z };
    }
    return { total, sum: pick.s, line: `Unusual dice: ${pick.s} came up ${pick.z < 0 ? "only " : ""}${n(pick.k, "time")}, about ${Math.round(pick.e)} expected.` };
  }
  const hi = Math.max(...rollSums);
  const lo = Math.min(...rollSums);
  if (hi === lo) return { total, sum: null, line: `Every sum came up ${n(hi, "time")}.` };
  const at = (k: number) => rollSums.flatMap((c, i) => (c === k ? [i + 2] : []));
  const each = (k: number) => (at(k).length > 1 ? " each" : "");
  const least = lo ? `${list(at(lo))} came up least, ${n(lo, "time")}${each(lo)}.` : `${list(at(0))} never came up.`;
  return { total, sum: null, line: `${list(at(hi))} came up most, ${n(hi, "time")}${each(hi)}. ${least}` };
}
