// #720 (#608): bot moments, the presentation-only events behind a CPU seat's centre line. docs/design/bot-action-moments.md,
// "Capture and public projection". This module only describes what a bot did. It keeps no raw action or full state, never
// dispatches, and never touches GameState, saves or messages. Showing and sounding the events is #721 to #723.
//
// Two sources:
// - practice-action: practice's own commit, with the action, the actor and the `automated` flag from store.ts. Exact.
// - online-observation: two host pushes compared. The host sends settled views, not an ordered action stream, so a
//   batch of changes is never given an order (npm run bot-action-order-prove). Only changes with one clear bot owner count.
import type { CommitNote } from "./store";
import { RESOURCES, RESOURCE_LABEL, type Action, type GameState, type PlayerState, type Resource } from "./types";

export type BotMomentKind =
  | "path"
  | "outpost"
  | "stronghold"
  | "wayfarer"
  | "fortune"
  | "pathFortune"
  | "wayfarerFortune"
  | "plenty"
  | "monopoly"
  | "discard"
  | "bankTrade"
  | "ask"
  | "changes";

export interface BotMoment {
  // `${epoch}-${n}`: unique in this tab, never sent anywhere.
  id: string;
  epoch: number;
  actor: string;
  // When it was captured, on the monotonic clock.
  at: number;
  source: "practice-action" | "online-observation";
  kind: BotMomentKind;
  // The public line, in the game's own words.
  text: string;
  // Stable edge, vertex or hex ids for a decorative cue (#722); empty when there is nothing to point at.
  targets: string[];
  // False for an online summary: the changes in it happened in some order the client cannot know.
  ordered: boolean;
  // Public counts only: paths placed, goods discarded, goods taken, changes summed. Never what kind.
  count?: number;
  // A table ask's real trade id.
  tradeId?: string;
}

type Draft = Omit<BotMoment, "id" | "epoch" | "at">;
type Bag = Partial<Record<Resource, number>>;

const seatName = (p: PlayerState | undefined, id: string) => p?.name.replace(/ \(bot\)$/i, "") ?? id;
const total = (p: PlayerState | undefined) => (p ? RESOURCES.reduce((n, r) => n + p.resources[r], 0) : 0);
const goods = (bag: Bag) =>
  RESOURCES.filter((r) => (bag[r] ?? 0) > 0)
    .map((r) => `${bag[r]} ${RESOURCE_LABEL[r]}`)
    .join(" and ");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function hexPlace(state: GameState, hexId: string) {
  const pip = state.hexes.find((h) => h.id === hexId)?.pip;
  return pip ? `the ${pip}` : "the wastes";
}
const newPaths = (before: GameState, after: GameState, owner: string) =>
  after.edges.filter((e) => e.path === owner && before.edges.find((b) => b.id === e.id)?.path !== owner).map((e) => e.id);

// The public line for one successful practice commit by `actor`, or null for an action with no bot line of its own: a roll
// and an end of turn keep their own moments, and a reply to a table offer belongs to that offer. A rejected or no-op action
// never commits (store.ts sends no note), and a commit that changed nothing is dropped here too.
export function projectAction(before: GameState, after: GameState, action: Action, actor: string): Draft | null {
  if (after === before || after.seq <= before.seq) return null;
  const was = before.players.find((p) => p.id === actor);
  const me = after.players.find((p) => p.id === actor);
  const name = seatName(me ?? was, actor);
  const line = (kind: BotMomentKind, text: string, targets: string[] = [], count?: number): Draft => ({
    actor,
    source: "practice-action",
    kind,
    text,
    targets,
    ordered: true,
    ...(count === undefined ? {} : { count }),
  });
  switch (action.type) {
    case "setupRoad":
    case "buildPath":
      return line("path", `${name} lays a path`, [action.edgeId]);
    case "setupSettle":
    case "buildOutpost":
      return line("outpost", `${name} builds an outpost`, [action.vertexId]);
    case "buildStronghold":
      return line("stronghold", `${name} raises a stronghold`, [action.vertexId]);
    case "buyCard":
      // Which fortune came off the deck stays private.
      return line("fortune", `${name} buys a fortune`);
    case "playRoad": {
      // What committed, not what was asked: the fortune can place one path or two.
      const edges = newPaths(before, after, actor);
      return line("pathFortune", `${name} places ${plural(edges.length, "path", "paths")}`, edges, edges.length);
    }
    case "moveRobber":
    case "playKnight": {
      const played = action.type === "playKnight";
      // Wayfarer off: the fortune only musters, nothing moves.
      if (played && !action.hexId) return line("wayfarerFortune", `${name} plays Wayfarer`);
      // The actual victim is whoever lost a good, which can differ from the request. Which good stays private.
      const victim = after.players.find((p) => p.id !== actor && total(p) < total(before.players.find((b) => b.id === p.id)));
      const take = victim ? ` and takes from ${seatName(victim, victim.id)}` : "";
      const to = `to ${hexPlace(after, after.robberHex)}${take}`;
      const text = played ? `${name} plays Wayfarer and moves it ${to}` : `${name} moves the wayfarer ${to}`;
      return line(played ? "wayfarerFortune" : "wayfarer", text, [after.robberHex]);
    }
    case "playPlenty":
    case "playMonopoly": {
      const gain: Bag = {};
      for (const r of RESOURCES) {
        const d = (me?.resources[r] ?? 0) - (was?.resources[r] ?? 0);
        if (d > 0) gain[r] = d;
      }
      const n = RESOURCES.reduce((sum, r) => sum + (gain[r] ?? 0), 0);
      if (action.type === "playPlenty") return line("plenty", `${name} plays Plenty and takes ${goods(gain)}`, [], n);
      return line("monopoly", `${name} plays Monopoly and takes ${n} ${RESOURCE_LABEL[action.resource]}`, [], n);
    }
    case "discard": {
      // How many is public; which goods is not.
      const n = total(was) - total(me);
      return n > 0 ? line("discard", `${name} discards ${plural(n, "good", "goods")}`, [], n) : null;
    }
    case "bankTrade": {
      const rate = (was?.resources[action.give] ?? 0) - (me?.resources[action.give] ?? 0);
      if (rate <= 0) return null;
      const where = rate < 4 ? "at a dock" : "with the bank";
      return line("bankTrade", `${name} trades ${rate} ${RESOURCE_LABEL[action.give]} for 1 ${RESOURCE_LABEL[action.want]} ${where}`);
    }
    default:
      return null;
  }
}

// What one bot seat visibly did between two online pushes of the same game. Each seat is judged alone: one change is told
// with its target, several are one unordered summary with no targets, and anything not plainly that seat's is left out.
// Only `kind: "bot"` seats count. A person's seat the host is playing for has no public sign, so it gets no line.
export function observeSnapshot(before: GameState, after: GameState): Draft[] {
  const out: Draft[] = [];
  for (const p of after.players) {
    if (p.kind !== "bot") continue;
    const was = before.players.find((b) => b.id === p.id);
    if (!was) continue;
    const name = seatName(p, p.id);
    const changes: { kind: BotMomentKind; text: string; target?: string }[] = [];
    for (const id of newPaths(before, after, p.id)) changes.push({ kind: "path", text: `${name} lays a path`, target: id });
    for (const v of after.vertices) {
      if (v.building?.playerId !== p.id) continue;
      const old = before.vertices.find((b) => b.id === v.id)?.building;
      if (old?.playerId === p.id && old.kind === v.building.kind) continue;
      if (v.building.kind === "outpost" && !old) changes.push({ kind: "outpost", text: `${name} builds an outpost`, target: v.id });
      else if (v.building.kind === "stronghold" && (!old || (old.playerId === p.id && old.kind === "outpost"))) {
        changes.push({ kind: "stronghold", text: `${name} raises a stronghold`, target: v.id });
      }
    }
    // A rise in the public fortune count is that many buys. A fall (a fortune played) is not counted: it can hide a buy.
    const bought = (p.fortunes ?? 0) - (was.fortunes ?? 0);
    for (let i = 0; i < bought; i++) changes.push({ kind: "fortune", text: `${name} buys a fortune` });
    // The wayfarer is the mover's only when that seat held the turn on both pushes.
    if (after.robberHex !== before.robberHex && before.current === p.id && after.current === p.id) {
      changes.push({ kind: "wayfarer", text: `${name} moves the wayfarer to ${hexPlace(after, after.robberHex)}`, target: after.robberHex });
    }
    if (changes.length === 1) {
      const [c] = changes;
      out.push({ actor: p.id, source: "online-observation", kind: c.kind, text: c.text, targets: c.target ? [c.target] : [], ordered: true });
    } else if (changes.length > 1) {
      out.push({
        actor: p.id,
        source: "online-observation",
        kind: "changes",
        text: `${name} makes ${changes.length} moves`,
        targets: [],
        ordered: false,
        count: changes.length,
      });
    }
  }
  return out;
}

const SEEN_MAX = 64;
const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export interface BotMomentFeed {
  note: (note: CommitNote) => void;
  // A leave, a hide or a test: drop everything and wait for a new baseline.
  reset: () => void;
  readonly epoch: number;
}

// Turns store.ts's commit notes into bot moments. Every new deal, every welcome (a join, a reconnect) and every rematch
// starts a new epoch: ids, the seen keys and the baseline start over, and nothing from before is replayed. Within an
// epoch a commit, a push and a trade id each make at most one moment, and a push that is not newer than the last is ignored.
export function createBotMomentFeed(emit: (moment: BotMoment) => void, now: () => number = clock): BotMomentFeed {
  let epoch = 0;
  let deal: number | null = null;
  let n = 0;
  let lastSeq = -Infinity;
  let base: GameState | null = null;
  const seen = new Set<string>();
  const fresh = () => {
    epoch++;
    n = 0;
    lastSeq = -Infinity;
    base = null;
    seen.clear();
  };
  const once = (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value as string);
    return true;
  };
  const push = (draft: Draft) => emit({ ...draft, id: `${epoch}-${++n}`, epoch, at: now() });
  return {
    get epoch() {
      return epoch;
    },
    reset: () => {
      fresh();
      deal = null;
    },
    note: (c) => {
      if (c.deal !== deal) {
        fresh();
        deal = c.deal;
      }
      if ("action" in c) {
        if (c.after.seq <= lastSeq) return;
        lastSeq = c.after.seq;
        base = c.after;
        if (!c.automated) return;
        const draft = projectAction(c.before, c.after, c.action, c.actor);
        if (draft && once(`a${c.after.seq}`)) push(draft);
        return;
      }
      if ("offer" in c) {
        const { tradeId, from, fromName, give, want } = c.offer;
        // Online the host does not say who is playing a seat: only a bot seat's ask is a bot's.
        const bot = c.automated ?? base?.players.find((p) => p.id === from)?.kind === "bot";
        if (!bot || !once(`t${tradeId}`)) return;
        const name = fromName.replace(/ \(bot\)$/i, "");
        push({
          actor: from,
          source: c.automated === null ? "online-observation" : "practice-action",
          kind: "ask",
          text: `${name} offers ${goods(give) || "nothing"} for ${goods(want) || "nothing"}`,
          targets: [],
          ordered: true,
          tradeId,
        });
        return;
      }
      const { before, after, first } = c;
      // A welcome, a first push, a rematch or an older game: a silent baseline in a new epoch.
      const rematch = before?.phase === "over" && after.phase !== "over";
      if (first || !before || !base || rematch || after.seq < lastSeq) {
        if (base || rematch || after.seq < lastSeq) fresh();
        base = after;
        lastSeq = after.seq;
        return;
      }
      if (after.seq <= lastSeq) return;
      const from = base;
      base = after;
      lastSeq = after.seq;
      if (!once(`s${after.seq}`)) return;
      for (const draft of observeSnapshot(from, after)) push(draft);
    },
  };
}

// Connects a feed to store.ts. Returns the undo, which leaves a newer listener in place.
export function listenBotMoments(emit: (moment: BotMoment) => void, tap: { on?: (note: CommitNote) => void }, now?: () => number) {
  const feed = createBotMomentFeed(emit, now);
  const on = feed.note;
  tap.on = on;
  return {
    feed,
    stop: () => {
      if (tap.on === on) tap.on = undefined;
    },
  };
}
