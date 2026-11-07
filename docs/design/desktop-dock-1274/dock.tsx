// Design mock for #1300: the 672 x 176 desktop dock, drawn into the running game. Not game code and not a proof.
// capture.mjs imports this file through the Vite dev server and calls mount(). It renders the game's own hand, cost chips,
// buttons, dice and number chips from the live store, laid out in fixed slots by dock.css. No src/ file changes.
import { createRoot, type Root } from "react-dom/client";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandDock } from "@/components/game/Hand";
import { CostChips, needLine, shortfall, type Price } from "@/components/game/BuildCost";
import { Dice } from "@/components/game/Dice";
import { MyNumbers } from "@/components/game/MyNumbers";
import { SeatDot } from "@/components/game/SeatDot";
import { offerLine } from "@/components/game/offer-line";
import { legalCities, legalRoads, legalSettle, playable } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import type { GameState, PlayerState } from "@/lib/game/types";

// Where Yes and No go when an offer comes in: "slot" keeps the seven controls and puts them under the turn line (option A);
// "row" swaps Trade, Fortunes and End turn for Yes, No and Details (option B, the #1274 study's state table).
export type OfferPlace = "slot" | "row";

// The same test as Hud.tsx's buildStatus, copied because that one is not exported.
function buildStatus(state: GameState, me: PlayerState, kind: Price) {
  const short = shortfall(me.resources, kind);
  const missing = Object.values(short).reduce((a, b) => a + b, 0);
  const left = { path: me.pathsLeft, outpost: me.outpostsLeft, stronghold: me.strongholdsLeft, card: state.deckLeft ?? state.deck.length }[kind];
  const spot = () =>
    kind === "path" ? legalRoads(state, me.id, false).length > 0 : kind === "outpost" ? legalSettle(state, me.id, false).length > 0 : kind === "stronghold" ? legalCities(state, me.id).length > 0 : true;
  const why = left <= 0 ? "None left" : spot() ? null : "No spot";
  return { short, missing, why, ready: !why && !missing };
}

const BUILDS: [Price, string][] = [["path", "Path"], ["outpost", "Outpost"], ["stronghold", "Stronghold"], ["card", "Buy fortune"]];

function MockDock({ place }: { place: OfferPlace }) {
  const state = useGame((s) => s.state);
  const localId = useGame((s) => s.localId);
  const offer = useGame((s) => s.offer);
  const declined = useGame((s) => s.declined);
  const log = useGame((s) => s.gameLog);
  if (!state) return null;
  const me = state.players.find((p) => p.id === localId);
  if (!me) return null;
  const mine = state.current === me.id;
  const current = state.players.find((p) => p.id === state.current)!;
  const incoming = offer && offer.from !== me.id && !declined.includes(me.id) ? offer : null;
  const from = incoming ? state.players.find((p) => p.id === incoming.from) : null;
  const main = mine && state.phase === "main";
  const roll = mine && (state.phase === "roll" || state.phase === "rollOff");
  const held = Object.values(me.hidden).reduce((n, c) => n + c, 0);
  const playNow = mine && !state.playedCard ? (["knight", "road", "plenty", "monopoly"] as const).reduce((n, k) => n + Math.max(0, playable(me, k)), 0) : 0;
  const canBuy = main && BUILDS.some(([k]) => buildStatus(state, me, k).ready);
  const deck = state.deckLeft ?? state.deck.length;
  // The column is 176 px, so the line is short; the hand's raised cards show an offer's terms, and Yes and No name them.
  const line = incoming ? `${incoming.fromName} offers` : mine ? (roll ? "Roll the dice" : "Your turn") : `${current.name}'s turn`;
  const terms = incoming ? offerLine(incoming.fromName, incoming.give, incoming.want) : null;
  const notYours = "Not your turn";

  const answer = (slot: "row" | "slot") =>
    incoming && place === slot
      ? [
          <Button key="yes" data-control="Yes" className="dd-ctl" aria-describedby="dd-terms">Yes</Button>,
          <Button key="no" data-control="No" variant="secondary" className="dd-ctl" aria-describedby="dd-terms">No</Button>,
        ]
      : null;

  return (
    <section className="dd-dock" data-testid="mock-dock" aria-label="Your dock">
      <div className="dd-hand" data-slot="hand">
        <HandDock me={me} phase={state.phase} />
      </div>
      <div className="dd-side">
        <p data-slot="turn" className={mine && !incoming ? "turn-instruction turn-instruction-own dd-turn" : "turn-instruction dd-turn dd-turn-other"}
          title={terms ?? undefined} style={{ borderLeftColor: incoming ? from?.color : mine ? undefined : current.color }}>
          {incoming && from ? <SeatDot color={from.color} className="dd-dot" /> : null}
          {line}
        </p>
        <span id="dd-terms" className="sr-only">{terms}</span>
        <div className="dd-aside" data-slot="aside">
          {answer("slot") ?? (state.dice ? <Dice values={state.dice} /> : null)}
        </div>
      </div>
      <div className="dd-row action-utilities" data-slot="controls">
        {BUILDS.map(([kind, label]) => {
          const { short, missing, why, ready } = buildStatus(state, me, kind);
          const blocked = !main || !ready;
          return (
            <Button key={kind} size="sm" variant="secondary" data-control={label} data-testid={`mock-build-${kind}`}
              data-build-state={!main ? undefined : why ? "nospot" : ready ? "ready" : "missing"}
              aria-disabled={blocked || undefined} aria-description={!main ? notYours : why ?? (ready ? "Ready" : needLine(short))}
              className="build-tile dd-ctl dd-tile">
              <span className="dd-name">{label}</span>
              {why && main ? <span className="dd-why">{why}</span> : <CostChips kind={kind} hand={main && missing ? me.resources : undefined} />}
            </Button>
          );
        })}
        {answer("row") ?? [
          <Button key="trade" size="sm" variant="secondary" data-control="Trade" className="dd-ctl" aria-disabled={!main || undefined} aria-description={main ? undefined : notYours}>
            <ArrowLeftRight className="size-4" /> Trade
          </Button>,
          <Button key="fortunes" size="sm" variant="secondary" data-control="Fortunes" className="dd-ctl dd-tile" aria-disabled={held === 0 || undefined}
            aria-label={`${playNow > 0 ? "Play fortune" : "Fortunes"}, ${held} held`} aria-description={held === 0 ? "No fortunes held" : playNow > 0 ? undefined : "Look at your fortunes"}>
            <span className="dd-name">{playNow > 0 ? "Play fortune" : "Fortunes"}</span>
            <span className="dd-why">{held} held</span>
          </Button>,
          roll ? (
            <Button key="end" size="sm" data-control="End turn" className="dd-ctl">Roll</Button>
          ) : (
            <Button key="end" size="sm" variant={main && !canBuy ? "primary" : "secondary"} data-control="End turn" className="dd-ctl" aria-disabled={!main || undefined} aria-description={main ? undefined : notYours}>
              End turn
            </Button>
          ),
        ]}
        {incoming && place === "row" ? (
          <Button key="details" size="sm" variant="secondary" data-control="Details" className="dd-ctl">Details</Button>
        ) : null}
      </div>
      <div className="dd-meta" data-slot="meta">
        <MyNumbers state={state} playerId={me.id} />
        <p className="table-log dd-log" data-testid="log-line">{log.at(-1)?.text}</p>
        <span className="dd-deck">Deck {deck}</span>
      </div>
    </section>
  );
}

let root: Root | null = null;

// The dock is for the wide layout only: 768 px and up with a fine pointer (src/lib/viewport.ts), and taller than 480 px,
// where the 88 x 80 hand card applies (hand-motion.css). Anywhere else mount() does nothing.
export function mount(place: OfferPlace) {
  if (!matchMedia("(min-width: 768px) and (pointer: fine) and (min-height: 481px)").matches) return false;
  document.documentElement.dataset.mockDock = "";
  if (!root) {
    const host = document.createElement("div");
    host.id = "mock-dock-root";
    document.body.append(host);
    root = createRoot(host);
  }
  root.render(<MockDock place={place} />);
  return true;
}
