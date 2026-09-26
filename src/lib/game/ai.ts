import { COST, RESOURCES, type Action, type GameState, type Resource } from "./types";
import { legalCities, legalRoads, legalSettle, stealTargets } from "./rules";

function cards(p: { resources: Record<Resource, number> }) {
  return RESOURCES.reduce((n, r) => n + p.resources[r], 0);
}

function hasCost(p: { resources: Record<Resource, number> }, cost: Partial<Record<Resource, number>>) {
  return RESOURCES.every((r) => p.resources[r] >= (cost[r] ?? 0));
}

function pipScore(state: GameState, vid: string) {
  const v = state.vertices.find((x) => x.id === vid);
  if (!v) return -1;
  let s = 0;
  for (const hid of v.hexes) {
    const h = state.hexes.find((x) => x.id === hid);
    if (!h || h.pip == null) continue;
    const w = 6 - Math.abs(h.pip - 7);
    s += w * w;
  }
  return s;
}

function discardHalf(p: { resources: Record<Resource, number> }, n: number): Partial<Record<Resource, number>> {
  const pool = { ...p.resources };
  const out: Partial<Record<Resource, number>> = {};
  for (let i = 0; i < n; i++) {
    const r = RESOURCES.slice().sort((a, b) => pool[b] - pool[a])[0]!;
    if (pool[r] <= 0) break;
    pool[r] -= 1;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

function bestRobberHex(state: GameState, pid: string): { hexId: string; stealFrom: string | null } {
  let best = { hexId: state.hexes[0]!.id, stealFrom: null as string | null, score: -1 };
  for (const h of state.hexes) {
    if (h.id === state.robberHex || h.terrain === "waste") continue;
    const targets = stealTargets(state, h.id, pid);
    let score = h.pip ? 6 - Math.abs(h.pip - 7) : 0;
    if (targets.length) score += 8;
    const oppCity = state.vertices.some(
      (v) => v.hexes.includes(h.id) && v.building && v.building.playerId !== pid,
    );
    if (oppCity) score += 4;
    const own = state.vertices.some(
      (v) => v.hexes.includes(h.id) && v.building?.playerId === pid,
    );
    if (own) score -= 6;
    if (score > best.score) {
      best = { hexId: h.id, stealFrom: targets[0] ?? null, score };
    }
  }
  return best;
}

export function chooseBotAction(state: GameState, pid: string): Action | null {
  const me = state.players.find((p) => p.id === pid);
  if (!me) return null;

  if (state.phase === "discard" && (state.discardNeeded[pid] ?? 0) > 0) {
    return { type: "discard", resources: discardHalf(me, state.discardNeeded[pid]!) };
  }
  if (state.phase === "setupSettle") {
    const opts = legalSettle(state, pid, true);
    opts.sort((a, b) => pipScore(state, b) - pipScore(state, a));
    if (opts[0]) return { type: "setupSettle", vertexId: opts[0] };
  }
  if (state.phase === "setupRoad") {
    const opts = legalRoads(state, pid, true);
    if (opts[0]) return { type: "setupRoad", edgeId: opts[0] };
  }
  if (state.current !== pid) return null;
  if (state.phase === "robber") {
    const m = bestRobberHex(state, pid);
    return { type: "moveRobber", hexId: m.hexId, stealFrom: m.stealFrom };
  }
  if (state.phase === "roll") return { type: "roll" };
  if (state.phase !== "main") return null;

  const cities = legalCities(state, pid);
  if (cities.length && hasCost(me, COST.stronghold) && me.strongholdsLeft > 0) {
    return { type: "buildStronghold", vertexId: cities[0]! };
  }
  const settles = legalSettle(state, pid, false);
  if (settles.length && hasCost(me, COST.outpost) && me.outpostsLeft > 0) {
    settles.sort((a, b) => pipScore(state, b) - pipScore(state, a));
    return { type: "buildOutpost", vertexId: settles[0]! };
  }
  const roads = legalRoads(state, pid, false);
  if (roads.length && hasCost(me, COST.path) && me.pathsLeft > 0 && me.outpostsLeft > 0) {
    return { type: "buildPath", edgeId: roads[Math.floor(roads.length / 2)]! };
  }
  if (hasCost(me, COST.card) && state.deck.length > 0) return { type: "buyCard" };

  const missing = RESOURCES.find((r) => me.resources[r] === 0);
  const extra = RESOURCES.find((r) => me.resources[r] >= 4);
  if (missing && extra && extra !== missing && state.bank[missing] > 0) {
    return { type: "bankTrade", give: extra, want: missing };
  }
  if (roads.length && hasCost(me, COST.path) && me.pathsLeft > 0) {
    return { type: "buildPath", edgeId: roads[0]! };
  }
  return { type: "endTurn" };
}
