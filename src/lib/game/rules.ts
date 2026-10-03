import { COST, RESOURCES, type Action, type DevKind, type GameState, type PlayerState, type Resource } from "./types";

function clone<T>(s: T): T {
  return structuredClone(s);
}

function rollDie(): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / 6) * 6;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return 1 + (buf[0]! % 6);
  }
}

function nextRand(state: GameState): number {
  let a = state.rng | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rng = a >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function player(state: GameState, id: string) {
  return state.players.find((p) => p.id === id);
}

// An opponent in the host's view carries only `goods`, the size of the hand (#186).
function cards(p: PlayerState) {
  return p.goods ?? RESOURCES.reduce((n, r) => n + p.resources[r], 0);
}

function hasCost(p: PlayerState, cost: Partial<Record<Resource, number>>) {
  return RESOURCES.every((r) => p.resources[r] >= (cost[r] ?? 0));
}

function pay(state: GameState, p: PlayerState, cost: Partial<Record<Resource, number>>) {
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0;
    if (!n) continue;
    p.resources[r] -= n;
    state.bank[r] += n;
  }
}

function give(state: GameState, p: PlayerState, res: Resource, n: number) {
  const take = Math.min(n, state.bank[res]);
  p.resources[res] += take;
  state.bank[res] -= take;
  return take;
}

function log(state: GameState, line: string) {
  state.log = [...state.log.slice(-40), line];
}

function vertex(state: GameState, id: string) {
  return state.vertices.find((v) => v.id === id);
}

function edge(state: GameState, id: string) {
  return state.edges.find((e) => e.id === id);
}

function hex(state: GameState, id: string) {
  return state.hexes.find((h) => h.id === id);
}

function neighborsOfVertex(state: GameState, vid: string): string[] {
  const out: string[] = [];
  for (const e of state.edges) {
    if (e.va === vid) out.push(e.vb);
    else if (e.vb === vid) out.push(e.va);
  }
  return out;
}

function distanceOk(state: GameState, vid: string) {
  const v = vertex(state, vid);
  if (!v || v.building) return false;
  return neighborsOfVertex(state, vid).every((n) => !vertex(state, n)?.building);
}

function playerVertices(state: GameState, pid: string) {
  return state.vertices.filter((v) => v.building?.playerId === pid);
}

function connectedToNetwork(state: GameState, pid: string, eid: string) {
  const e = edge(state, eid);
  if (!e) return false;
  const touch = (vid: string) => {
    const v = vertex(state, vid);
    if (v?.building?.playerId === pid) return true;
    // An opponent's building cuts your network at that corner (README Setup, #98).
    if (v?.building) return false;
    return state.edges.some((x) => x.path === pid && (x.va === vid || x.vb === vid));
  };
  return touch(e.va) || touch(e.vb);
}

export function harborRate(state: GameState, pid: string, res: Resource): number {
  let any = false;
  let specific = false;
  for (const v of playerVertices(state, pid)) {
    if (v.harbor === res) specific = true;
    if (v.harbor === "any") any = true;
  }
  if (specific) return 2;
  if (any) return 3;
  return 4;
}

export function legalSettle(state: GameState, pid: string, setup: boolean): string[] {
  return state.vertices
    .filter((v) => {
      if (!distanceOk(state, v.id)) return false;
      if (setup) return true;
      return state.edges.some(
        (e) => e.path === pid && (e.va === v.id || e.vb === v.id),
      );
    })
    .map((v) => v.id);
}

export function legalRoads(state: GameState, pid: string, setup: boolean): string[] {
  return state.edges
    .filter((e) => {
      if (e.path) return false;
      if (setup) {
        const last = state.lastSetupVertex;
        if (!last) return false;
        return e.va === last || e.vb === last;
      }
      return connectedToNetwork(state, pid, e.id);
    })
    .map((e) => e.id);
}

export function legalCities(state: GameState, pid: string): string[] {
  return state.vertices.filter((v) => v.building?.playerId === pid && v.building.kind === "outpost").map((v) => v.id);
}

export function stealTargets(state: GameState, hexId: string, pid: string): string[] {
  const h = hex(state, hexId);
  if (!h) return [];
  const ids = new Set<string>();
  for (const v of state.vertices) {
    if (!v.hexes.includes(hexId) || !v.building) continue;
    if (v.building.playerId !== pid) {
      const pl = player(state, v.building.playerId);
      if (pl && cards(pl) > 0) ids.add(pl.id);
    }
  }
  return [...ids];
}

// Longest real trail: walk corner to corner, entering each segment at one end and leaving at the other.
// An opponent's building ends a trail at that corner (it may still start there).
export function roadLength(state: GameState, pid: string): number {
  const mine = state.edges.filter((e) => e.path === pid);
  if (!mine.length) return 0;
  const byCorner = new Map<string, typeof mine>();
  for (const e of mine) {
    for (const v of [e.va, e.vb]) {
      if (!byCorner.has(v)) byCorner.set(v, []);
      byCorner.get(v)!.push(e);
    }
  }
  const blocked = (vid: string) => {
    const b = vertex(state, vid)?.building;
    return Boolean(b && b.playerId !== pid);
  };
  const used = new Set<string>();
  const walk = (corner: string): number => {
    if (used.size > 0 && blocked(corner)) return 0;
    let best = 0;
    for (const e of byCorner.get(corner) ?? []) {
      if (used.has(e.id)) continue;
      used.add(e.id);
      best = Math.max(best, 1 + walk(e.va === corner ? e.vb : e.va));
      used.delete(e.id);
    }
    return best;
  };
  let best = 0;
  for (const corner of byCorner.keys()) best = Math.max(best, walk(corner));
  return best;
}

// Official rules: 5+ to hold it; ties keep the holder; a tie with no holder gives it to nobody.
function updateLongest(state: GameState) {
  const lengths = new Map(state.players.map((p) => [p.id, roadLength(state, p.id)]));
  const top = Math.max(...lengths.values());
  const leaders = [...lengths].filter(([, n]) => n === top).map(([id]) => id);
  const holder = state.longestRoad;
  if (top < 5) state.longestRoad = null;
  else if (holder && leaders.includes(holder)) state.longestRoad = holder;
  else state.longestRoad = leaders.length === 1 ? leaders[0]! : null;
  if (state.longestRoad !== holder) {
    // A swing is worth 2 points either way, so the table hears it (#188).
    if (state.longestRoad) log(state, `${player(state, state.longestRoad)?.name} holds the longest path.`);
    else log(state, `${player(state, holder!)?.name} loses the longest path.`);
  }
}

function updateArmy(state: GameState, pid: string) {
  const p = player(state, pid);
  if (!p || p.knightsPlayed < 3) return;
  const cur = state.largestArmy ? player(state, state.largestArmy) : null;
  if (!cur || p.knightsPlayed > cur.knightsPlayed) {
    if (state.largestArmy !== pid) log(state, `${p.name} holds the largest army.`);
    state.largestArmy = pid;
  }
}

export function publicVP(state: GameState, pid: string) {
  let n = 0;
  for (const v of state.vertices) {
    if (v.building?.playerId !== pid) continue;
    n += v.building.kind === "stronghold" ? 2 : 1;
  }
  if (state.longestRoad === pid) n += 2;
  if (state.largestArmy === pid) n += 2;
  return n;
}

export function totalVP(state: GameState, pid: string) {
  const p = player(state, pid);
  return publicVP(state, pid) + (p?.hidden.vp ?? 0);
}

function checkWin(state: GameState, pid: string) {
  if (state.current !== pid) return;
  if (totalVP(state, pid) >= 10) {
    state.phase = "over";
    state.winner = pid;
    log(state, `${player(state, pid)?.name} claims the isle with ${totalVP(state, pid)} points.`);
  }
}

function setupAdvance(state: GameState) {
  const n = state.players.length;
  const totalSteps = n * 2;
  if (state.phase === "setupSettle") {
    state.phase = "setupRoad";
    return;
  }
  state.setupIndex += 1;
  state.lastSetupVertex = null;
  if (state.setupIndex >= totalSteps) {
    state.phase = "roll";
    state.current = state.players[0]!.id;
    state.turn = 1;
    log(state, "The isle is settled. Roll to begin.");
    return;
  }
  const goingBack = state.setupIndex >= n;
  const idx = goingBack ? totalSteps - 1 - state.setupIndex : state.setupIndex;
  state.current = state.players[idx]!.id;
  state.phase = "setupSettle";
}

// "A and B", "A, B, and C".
function names(list: PlayerState[]) {
  const n = list.map((p) => p.name);
  return n.length < 3 ? n.join(" and ") : `${n.slice(0, -1).join(", ")}, and ${n.at(-1)}`;
}

// The pre-setup roll-off (docs/design/first-player.md). Never touches state.rng.
function rollOffRoll(state: GameState, me: PlayerState) {
  const ro = state.rollOff!;
  const die = rollDie();
  ro.rolls[me.id] = die;
  ro.pending.shift();
  log(state, `${me.name} rolls a ${die}.`);
  if (ro.pending.length) {
    state.current = ro.pending[0]!;
    return;
  }
  const top = Math.max(...Object.values(ro.rolls));
  const leaders = state.players.filter((p) => ro.rolls[p.id] === top);
  if (leaders.length > 1) {
    for (const p of leaders) delete ro.rolls[p.id];
    ro.pending = leaders.map((p) => p.id);
    state.current = leaders[0]!.id;
    log(state, `${names(leaders)} tie at ${top} and roll again.`);
    return;
  }
  const first = leaders[0]!;
  const rest = state.players.filter((p) => p !== first).sort((a, b) => ro.rolls[b.id]! - ro.rolls[a.id]!);
  state.players = [first, ...rest];
  state.current = first.id;
  state.phase = "setupSettle";
  state.setupIndex = 0;
  log(state, `${first.name} places first, then ${names(rest)}.`);
}

function produce(state: GameState, total: number) {
  const demand: Partial<Record<Resource, number>> = {};
  const owed: Partial<Record<Resource, Set<string>>> = {};
  const grants: { p: PlayerState; res: Resource; n: number; pip: number }[] = [];
  for (const h of state.hexes) {
    if (h.pip !== total || h.blocked || h.terrain === "waste") continue;
    const res = h.terrain as Resource;
    for (const v of state.vertices) {
      if (!v.hexes.includes(h.id) || !v.building) continue;
      const p = player(state, v.building.playerId);
      if (!p) continue;
      const n = v.building.kind === "stronghold" ? 2 : 1;
      demand[res] = (demand[res] ?? 0) + n;
      (owed[res] ??= new Set()).add(p.id);
      grants.push({ p, res, n, pip: h.pip! });
    }
  }
  // A short bank pays nobody, unless only one player is owed: they take what is left (README "A turn").
  const short = new Set();
  for (const res of Object.keys(demand) as Resource[]) {
    if ((demand[res] ?? 0) > state.bank[res] && (owed[res]?.size ?? 0) > 1) short.add(res);
  }
  if (short.size) log(state, `The bank is short of ${[...short].join(" and ")}; nobody gathers it.`);
  for (const grant of grants) {
    if (short.has(grant.res)) continue;
    const got = give(state, grant.p, grant.res, grant.n);
    if (got) log(state, `${grant.p.name} gathers ${got} ${grant.res} from the ${grant.pip}.`);
  }
}

// The resources the latest roll could not pay, read from the line produce() logs right after the roll line.
export function bankShort(state: GameState): Resource[] {
  const i = state.log.findLastIndex((l) => / rolls \d\+\d = \d+\.$/.test(l));
  const m = /^The bank is short of (.+); nobody gathers it\.$/.exec(state.log[i + 1] ?? "");
  return m ? (m[1]!.split(" and ") as Resource[]) : [];
}

function grantSecondSettlement(state: GameState, vid: string, pid: string) {
  const v = vertex(state, vid);
  const p = player(state, pid);
  if (!v || !p) return;
  for (const hid of v.hexes) {
    const h = hex(state, hid);
    if (!h || h.terrain === "waste") continue;
    give(state, p, h.terrain as Resource, 1);
  }
}

function stealOne(state: GameState, fromId: string, toId: string) {
  const from = player(state, fromId);
  const to = player(state, toId);
  if (!from || !to || cards(from) === 0) return;
  const pool: Resource[] = [];
  for (const r of RESOURCES) for (let i = 0; i < from.resources[r]; i++) pool.push(r);
  const pick = pool[Math.floor(nextRand(state) * pool.length)]!;
  from.resources[pick] -= 1;
  to.resources[pick] += 1;
  // The table hears that a card moved, not which one: only the two hands change (#187).
  log(state, `${to.name} steals a card from ${from.name}.`);
}

function afterRobber(state: GameState) {
  state.phase = "main";
}

function applyRobber(state: GameState, pid: string, hexId: string, stealFrom: string | null) {
  if (hexId === state.robberHex) return "The wayfarer must move.";
  const h = hex(state, hexId);
  if (!h) return "Unknown land.";
  for (const x of state.hexes) x.blocked = x.id === hexId;
  state.robberHex = hexId;
  const targets = stealTargets(state, hexId, pid);
  if (stealFrom) {
    if (!targets.includes(stealFrom)) return "Cannot steal from them.";
    stealOne(state, stealFrom, pid);
  } else if (targets.length === 1) {
    stealOne(state, targets[0]!, pid);
  }
  log(state, `${player(state, pid)?.name} sends the wayfarer into new land.`);
  afterRobber(state);
  return null;
}

function setupOrderNote(state: GameState) {
  // second settlement of each player is the reverse-round one
  const n = state.players.length;
  return state.setupIndex >= n;
}

// Client input is untrusted: a card bag is only known resources with whole, non-negative counts.
export function validBag(bag: unknown): bag is Partial<Record<Resource, number>> {
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return false;
  return Object.entries(bag).every(
    ([k, n]) => (RESOURCES as readonly string[]).includes(k) && Number.isInteger(n) && (n as number) >= 0,
  );
}

function validRes(r: unknown): r is Resource {
  return (RESOURCES as readonly string[]).includes(r as string);
}

export function applyAction(prev: GameState, actor: string, action: Action): { state: GameState; error?: string } {
  const state = clone(prev);
  state.seq += 1;
  const me = player(state, actor);
  if (!me) return { state: prev, error: "Unknown player." };

  const mustBeCurrent = !["discard", "respondTrade"].includes(action.type);
  if (mustBeCurrent && state.current !== actor && state.phase !== "discard") {
    return { state: prev, error: "Not your turn." };
  }
  if (state.phase === "over") return { state: prev, error: "The game is over." };

  switch (action.type) {
    case "setupSettle": {
      if (state.phase !== "setupSettle") return { state: prev, error: "Not placing outposts." };
      if (!legalSettle(state, actor, true).includes(action.vertexId)) {
        return { state: prev, error: "Illegal outpost." };
      }
      const v = vertex(state, action.vertexId)!;
      v.building = { playerId: actor, kind: "outpost" };
      me.outpostsLeft -= 1;
      state.lastSetupVertex = action.vertexId;
      updateLongest(state);
      if (setupOrderNote(state)) grantSecondSettlement(state, action.vertexId, actor);
      log(state, `${me.name} raises an outpost.`);
      setupAdvance(state);
      return { state };
    }
    case "setupRoad": {
      if (state.phase !== "setupRoad") return { state: prev, error: "Not placing paths." };
      if (!legalRoads(state, actor, true).includes(action.edgeId)) {
        return { state: prev, error: "Illegal path." };
      }
      const e = edge(state, action.edgeId)!;
      e.path = actor;
      me.pathsLeft -= 1;
      log(state, `${me.name} lays a path.`);
      setupAdvance(state);
      return { state };
    }
    case "roll": {
      if (state.phase === "rollOff") {
        rollOffRoll(state, me);
        return { state };
      }
      if (state.phase !== "roll") return { state: prev, error: "Cannot roll now." };
      const a = rollDie();
      const b = rollDie();
      state.dice = [a, b];
      const total = a + b;
      log(state, `${me.name} rolls ${a}+${b} = ${total}.`);
      if (total === 7) {
        const need: Record<string, number> = {};
        for (const p of state.players) {
          const c = cards(p);
          if (c > 7) need[p.id] = Math.floor(c / 2);
        }
        state.discardNeeded = need;
        state.phase = Object.keys(need).length ? "discard" : "robber";
      } else {
        produce(state, total);
        state.phase = "main";
      }
      return { state };
    }
    case "discard": {
      const need = state.discardNeeded[actor] ?? 0;
      if (state.phase !== "discard" || need <= 0) return { state: prev, error: "No discard needed." };
      if (!validBag(action.resources)) return { state: prev, error: "Bad cards." };
      let n = 0;
      for (const r of RESOURCES) n += action.resources[r] ?? 0;
      if (n !== need) return { state: prev, error: `Discard exactly ${need}.` };
      for (const r of RESOURCES) {
        const k = action.resources[r] ?? 0;
        if (me.resources[r] < k) return { state: prev, error: "Not enough cards." };
      }
      for (const r of RESOURCES) {
        const k = action.resources[r] ?? 0;
        me.resources[r] -= k;
        state.bank[r] += k;
      }
      delete state.discardNeeded[actor];
      log(state, `${me.name} discards ${need}.`);
      if (Object.keys(state.discardNeeded).length === 0) state.phase = "robber";
      return { state };
    }
    case "moveRobber": {
      if (state.phase !== "robber") return { state: prev, error: "Wayfarer is not moving." };
      const err = applyRobber(state, actor, action.hexId, action.stealFrom);
      if (err) return { state: prev, error: err };
      return { state };
    }
    case "buildPath": {
      if (state.phase !== "main") return { state: prev, error: "Cannot build now." };
      if (me.pathsLeft <= 0) return { state: prev, error: "No paths left." };
      if (!hasCost(me, COST.path)) return { state: prev, error: "Need timber and clay." };
      if (!legalRoads(state, actor, false).includes(action.edgeId)) {
        return { state: prev, error: "Path must connect to you." };
      }
      pay(state, me, COST.path);
      edge(state, action.edgeId)!.path = actor;
      me.pathsLeft -= 1;
      updateLongest(state);
      log(state, `${me.name} builds a path.`);
      checkWin(state, actor);
      return { state };
    }
    case "buildOutpost": {
      if (state.phase !== "main") return { state: prev, error: "Cannot build now." };
      if (me.outpostsLeft <= 0) return { state: prev, error: "No outposts left." };
      if (!hasCost(me, COST.outpost)) return { state: prev, error: "Need timber, clay, wool, grain." };
      if (!legalSettle(state, actor, false).includes(action.vertexId)) {
        return { state: prev, error: "Illegal outpost." };
      }
      pay(state, me, COST.outpost);
      vertex(state, action.vertexId)!.building = { playerId: actor, kind: "outpost" };
      me.outpostsLeft -= 1;
      updateLongest(state);
      log(state, `${me.name} founds an outpost.`);
      checkWin(state, actor);
      return { state };
    }
    case "buildStronghold": {
      if (state.phase !== "main") return { state: prev, error: "Cannot build now." };
      if (me.strongholdsLeft <= 0) return { state: prev, error: "No strongholds left." };
      if (!hasCost(me, COST.stronghold)) return { state: prev, error: "Need three grain and two ore." };
      if (!legalCities(state, actor).includes(action.vertexId)) {
        return { state: prev, error: "Upgrade an outpost." };
      }
      pay(state, me, COST.stronghold);
      vertex(state, action.vertexId)!.building = { playerId: actor, kind: "stronghold" };
      me.strongholdsLeft -= 1;
      me.outpostsLeft += 1;
      log(state, `${me.name} raises a stronghold.`);
      checkWin(state, actor);
      return { state };
    }
    case "buyCard": {
      if (state.phase !== "main") return { state: prev, error: "Cannot buy now." };
      if (!hasCost(me, COST.card)) return { state: prev, error: "Need wool, grain, ore." };
      const card = state.deck.shift();
      if (!card) return { state: prev, error: "The fortune deck is empty." };
      pay(state, me, COST.card);
      me.hidden[card] += 1;
      me.boughtThisTurn[card] += 1;
      log(state, `${me.name} draws a fortune.`);
      if (card === "vp") checkWin(state, actor);
      return { state };
    }
    case "playKnight": {
      if (state.playedCard) return { state: prev, error: "Already played a fortune." };
      if (playable(me, "knight") <= 0) return { state: prev, error: me.hidden.knight > 0 ? BOUGHT_THIS_TURN : "No wayfarer cards." };
      if (state.phase !== "roll" && state.phase !== "main") {
        return { state: prev, error: "Cannot play that now." };
      }
      me.hidden.knight -= 1;
      me.knightsPlayed += 1;
      state.playedCard = true;
      updateArmy(state, actor);
      const err = applyRobber(state, actor, action.hexId, action.stealFrom);
      if (err) return { state: prev, error: err };
      if (state.phase === "roll") {
        /* knight before roll stays in roll unless robber consumed phase */
      }
      if (prev.phase === "roll") state.phase = "roll";
      else state.phase = "main";
      checkWin(state, actor);
      return { state };
    }
    case "playRoad": {
      if (state.phase !== "main" || state.playedCard) return { state: prev, error: "Cannot play that." };
      if (playable(me, "road") <= 0) return { state: prev, error: me.hidden.road > 0 ? BOUGHT_THIS_TURN : "No path fortune." };
      if (me.pathsLeft <= 0) return { state: prev, error: "No paths left to place." };
      if (legalRoads(state, actor, false).length === 0) return { state: prev, error: "No place for a path." };
      if (!Array.isArray(action.edgeIds)) return { state: prev, error: "Place one or two paths." };
      if (action.edgeIds.length < 1 || action.edgeIds.length > 2) {
        return { state: prev, error: "Place one or two paths." };
      }
      me.hidden.road -= 1;
      state.playedCard = true;
      for (const eid of action.edgeIds) {
        if (me.pathsLeft <= 0) break;
        if (!legalRoads(state, actor, false).includes(eid) && edge(state, eid)?.path) {
          return { state: prev, error: "Illegal path." };
        }
        if (!legalRoads(state, actor, false).includes(eid)) {
          return { state: prev, error: "Illegal path." };
        }
        edge(state, eid)!.path = actor;
        me.pathsLeft -= 1;
      }
      updateLongest(state);
      log(state, `${me.name} uses a path fortune.`);
      checkWin(state, actor);
      return { state };
    }
    case "playPlenty": {
      if (state.phase !== "main" || state.playedCard) return { state: prev, error: "Cannot play that." };
      if (playable(me, "plenty") <= 0) return { state: prev, error: me.hidden.plenty > 0 ? BOUGHT_THIS_TURN : "No plenty fortune." };
      if (!Array.isArray(action.resources) || action.resources.length !== 2 || !action.resources.every(validRes)) {
        return { state: prev, error: "Choose two resources." };
      }
      me.hidden.plenty -= 1;
      state.playedCard = true;
      for (const r of action.resources) give(state, me, r, 1);
      log(state, `${me.name} calls a year of plenty.`);
      return { state };
    }
    case "playMonopoly": {
      if (state.phase !== "main" || state.playedCard) return { state: prev, error: "Cannot play that." };
      if (playable(me, "monopoly") <= 0) return { state: prev, error: me.hidden.monopoly > 0 ? BOUGHT_THIS_TURN : "No monopoly." };
      if (!validRes(action.resource)) return { state: prev, error: "Choose a resource." };
      me.hidden.monopoly -= 1;
      state.playedCard = true;
      let taken = 0;
      for (const p of state.players) {
        if (p.id === actor) continue;
        taken += p.resources[action.resource];
        p.resources[action.resource] = 0;
      }
      me.resources[action.resource] += taken;
      log(state, `${me.name} monopolizes ${action.resource} (${taken}).`);
      return { state };
    }
    case "bankTrade": {
      if (state.phase !== "main") return { state: prev, error: "Cannot trade now." };
      if (!validRes(action.give) || !validRes(action.want)) return { state: prev, error: "Choose resources." };
      if (action.give === action.want) return { state: prev, error: "Trade for a different resource." };
      const rate = harborRate(state, actor, action.give);
      if (me.resources[action.give] < rate) return { state: prev, error: `Need ${rate} ${action.give}.` };
      if (state.bank[action.want] <= 0) return { state: prev, error: "Bank is empty." };
      me.resources[action.give] -= rate;
      state.bank[action.give] += rate;
      give(state, me, action.want, 1);
      log(state, `${me.name} trades ${rate} ${action.give} for ${action.want}.`);
      return { state };
    }
    case "offerTrade": {
      if (state.phase !== "main") return { state: prev, error: "Cannot trade now." };
      if (action.to === actor) return { state: prev, error: "Cannot trade with yourself." };
      if (!validBag(action.give) || !validBag(action.want)) return { state: prev, error: "Bad trade." };
      const target = player(state, action.to);
      if (!target) return { state: prev, error: "Unknown player." };
      for (const r of RESOURCES) {
        if ((action.give[r] ?? 0) > me.resources[r]) return { state: prev, error: "You lack those goods." };
      }
      state.trade = { from: actor, to: action.to, give: action.give, want: action.want };
      log(state, `${me.name} offers a trade to ${target.name}.`);
      return { state };
    }
    case "respondTrade": {
      const t = state.trade;
      if (!t || t.to !== actor) return { state: prev, error: "No offer for you." };
      if (!action.accept) {
        log(state, `${me.name} declines.`);
        state.trade = null;
        return { state };
      }
      const from = player(state, t.from);
      if (!from) return { state: prev, error: "Gone." };
      for (const r of RESOURCES) {
        if ((t.give[r] ?? 0) > from.resources[r]) return { state: prev, error: "Offer stale." };
        if ((t.want[r] ?? 0) > me.resources[r]) return { state: prev, error: "You lack those goods." };
      }
      for (const r of RESOURCES) {
        const g = t.give[r] ?? 0;
        const w = t.want[r] ?? 0;
        from.resources[r] -= g;
        me.resources[r] += g;
        me.resources[r] -= w;
        from.resources[r] += w;
      }
      log(state, `${me.name} accepts ${from.name}'s trade.`);
      state.trade = null;
      return { state };
    }
    case "endTurn": {
      if (state.phase !== "main") return { state: prev, error: "Finish your turn first." };
      state.trade = null;
      state.playedCard = false;
      me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
      // The next player rolls fresh; stale dice would show on their roll phase (#188).
      state.dice = null;
      const idx = state.players.findIndex((p) => p.id === actor);
      const next = state.players[(idx + 1) % state.players.length]!;
      state.current = next.id;
      state.phase = "roll";
      if (idx === state.players.length - 1) state.turn += 1;
      log(state, `${next.name}'s turn.`);
      // Points can arrive on someone else's turn (an award handed over by a cut); they win as this turn starts.
      checkWin(state, next.id);
      return { state };
    }
    default:
      return { state: prev, error: "Unknown action." };
  }
}

const BOUGHT_THIS_TURN = "A fortune cannot be played the turn it is bought.";

// Fortunes of this kind held since before this turn (README: a fortune bought this turn cannot be played this turn).
export function playable(p: PlayerState, k: DevKind) {
  return p.hidden[k] - p.boughtThisTurn[k];
}

export function hiddenCount(p: PlayerState) {
  return (Object.keys(p.hidden) as DevKind[]).reduce((n, k) => n + p.hidden[k], 0);
}

export function pipColor(n: number) {
  return n === 6 || n === 8 ? "#c45c3e" : "#1a1a18";
}
