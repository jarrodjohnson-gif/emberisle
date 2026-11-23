// #1761: loads for an explicit counter action; ordinary offers stay in store.
import { shouldAcceptTrade } from "./ai";
import { applyAction, validBag } from "./rules";
import { RESOURCES, RESOURCE_LABEL, type GameState } from "./types";
import type { Bag } from "../net/table";
import type { Set, Get, TradeCounter } from "./store";
import { useGame, endOffer, peopleWaiting, releaseHeld, botDeclined, newLog, appendLog, offerTimers } from "./store";
import { play } from "../sound";
type CounterClose = { why: "no" | "back" | "gone" };
export type CounterCommand = ["make", string, Bag, Bag] | ["answer", string, string, boolean] | ["cancel", string, string];
const BOT_ANSWER_MS = 1000;
const counterTimers = new WeakMap<TradeCounter, ReturnType<typeof setTimeout>>();
const get: Get = useGame.getState, set: Set = useGame.setState;
const end = () => endOffer(set, get, null);
const waiting = () => peopleWaiting(get);
const release = () => releaseHeld(set, get);
const remember = (from: string, terms: { give: Bag; want: Bag }) => botDeclined.set(from, terms);
const addTimer = (timer: ReturnType<typeof setTimeout>) => offerTimers.push(timer);
const log = (line: string) => set({ gameLog: appendLog(get().gameLog, [line]) });
const chime = () => play("trade_offer");
export function action(...[kind, tradeId, a, b]: CounterCommand) {
  const { mode, net, spectator, localId, offer, state } = get();
  if (spectator) return;
  if (mode === "online") {
    if (kind === "make") net?.tradeCounter(tradeId, a, b);
    else if (kind === "answer") net?.tradeCounterAnswer(tradeId, a, b);
    else net?.tradeCounterCancel(tradeId, a);
    return;
  }
  let error: string | null | undefined;
  if (kind === "make") error = makeCounter(tradeId, localId, a, b);
  else {
    const counter = get().counters.find((c) => c.tradeId === tradeId && c.counterId === a);
    if (!counter || (kind === "answer" ? offer?.from !== localId : counter.by !== localId)) error = "Offer is gone.";
    else if (kind === "cancel") closeCounter(counter, "back");
    else if (mode !== "ai" || state?.phase !== "main" || state.role === "partner") error = "Cannot trade now.";
    else error = settleCounter(counter, b);
  }
  if (error) get().refuse(error);
}
const pays = (state: GameState, id: string, bag: Bag) => {
  const p = state.players.find((p) => p.id === id);
  return p && RESOURCES.every((r) => (bag[r] ?? 0) <= p.resources[r]);
};
function closeCounter(counter: TradeCounter, why: CounterClose["why"]) {
  const { offer, state, counters, declined } = get();
  if (!offer || offer.tradeId !== counter.tradeId || !counters.includes(counter)) return;
  clearTimeout(counterTimers.get(counter));
  counterTimers.delete(counter);
  const left = counters.filter((c) => c !== counter);
  set({ counters: left, counterClosed: { tradeId: counter.tradeId, counterId: counter.counterId, by: counter.by, why } });
  if (!left.length && state!.players.every((p) => p.id === offer.from || declined.includes(p.id))) {
    if (state!.players.find((p) => p.id === offer.from)?.kind === "bot") remember(offer.from, { give: offer.give, want: offer.want });
    end();
  } else if (!waiting()) release();
}
function settleCounter(counter: TradeCounter, yes: boolean): string | undefined | null {
  const { offer, state } = get();
  if (!offer || offer.tradeId !== counter.tradeId || !get().counters.includes(counter)) return "Offer is gone.";
  if (!yes) { closeCounter(counter, "no"); return; }
  if (!pays(state!, offer.from, counter.give)) return "You lack those goods.";
  if (!pays(state!, counter.by, counter.want)) { closeCounter(counter, "gone"); return; }
  const offered = applyAction(state!, offer.from, { type: "offerTrade", to: counter.by, give: counter.give, want: counter.want });
  if (offered.error) return "Cannot trade now.";
  const accepted = applyAction(offered.state, counter.by, { type: "respondTrade", accept: true });
  if (accepted.error) return accepted.error;
  const lines = newLog(state!.log, accepted.state.log).filter((line) => !line.includes(" offers a trade to "));
  set({ state: { ...accepted.state, log: [...state!.log, ...lines].slice(-200) }, localTrade: get().localTrade + 1, gameLog: appendLog(get().gameLog, lines) });
  endOffer(set, get, counter.by);
  return null;
}
export function bot(counter: TradeCounter) {
  const { offer, state } = get();
  if (!offer || offer.tradeId !== counter.tradeId || !get().counters.includes(counter) || state!.players.find((p) => p.id === offer.from)?.kind !== "bot") return;
  const yes = state!.role !== "partner" && shouldAcceptTrade(state!, offer.from, { from: counter.by, give: counter.want, want: counter.give });
  if (settleCounter(counter, yes)) closeCounter(counter, "no");
}
function makeCounter(tradeId: string, by: string, give: Bag, want: Bag): string | undefined {
  const { offer, state, mode, counterUsed } = get();
  if (!offer || offer.tradeId !== tradeId) return "Offer is gone.";
  if (mode !== "ai" || state?.phase !== "main" || state.role === "partner") return "Cannot trade now.";
  if (!offer.counter || by === offer.from || counterUsed.includes(by)) return "Bad trade.";
  if (!validBag(give) || !validBag(want) || !RESOURCES.some((r) => give[r]) || !RESOURCES.some((r) => want[r]) || RESOURCES.some((r) => give[r] && want[r]) || RESOURCES.every((r) => (give[r] ?? 0) === (offer.give[r] ?? 0) && (want[r] ?? 0) === (offer.want[r] ?? 0))) return "Bad trade.";
  if (!pays(state, by, want)) return "You lack those goods.";
  const counter: TradeCounter = { tradeId, counterId: `${tradeId}-c${counterUsed.length + 1}`, by, name: state.players.find((p) => p.id === by)!.name.replace(/ \(bot\)$/i, ""), give: { ...give }, want: { ...want } };
  const words = (bag: Bag) => RESOURCES.filter((r) => bag[r]).map((r) => `${bag[r]} ${RESOURCE_LABEL[r].toLowerCase()}`).join(", ");
  const name = state.players.find((p) => p.id === offer.from)!.name.replace(/ \(bot\)$/i, "");
  set({ counters: [...get().counters, counter], counterUsed: [...counterUsed, by], counterClosed: null });
  log(`${counter.name} counters ${name}: ${words(want)} for ${words(give)}.`);
  if (offer.from === get().localId) chime();
  if (state.players.find((p) => p.id === offer.from)?.kind === "bot") {
    const timer = setTimeout(() => bot(counter), BOT_ANSWER_MS + Math.floor(Math.random() * (BOT_ANSWER_MS + 1)));
    counterTimers.set(counter, timer);
    addTimer(timer);
  }
}

