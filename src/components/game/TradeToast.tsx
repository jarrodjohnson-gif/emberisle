// The ask-the-table toast (docs/BUILD_BIBLE.md 4.4): "Ember offers 2 sheep for 1 ore", Yes / No, and the 20 s left.
// The asker sees the same offer with who has declined, then the outcome for a moment.
// #537: a seat that cannot pay sees a compact demand ("Ember is looking for 2 ore") with Dismiss only — no Accept.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Hourglass, X } from "lucide-react";
import { useViewport } from "@/lib/viewport";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { bagText } from "@/lib/game/trade";
import { useGame } from "@/lib/game/store";
import { RESOURCES } from "@/lib/game/types";
import type { Bag } from "@/lib/net/table";
import "./trade-panel.css";

const DISMISS_MS = 150;

// "Ember offers 2 sheep for 1 ore"; the asker reads "You offer 2 sheep for 1 ore".
export function offerLine(name: string | null, give: Bag, want: Bag) {
  const g = bagText(give);
  const w = bagText(want);
  const [who, offers, gives, asks] = name ? [name, "offers", "gives away", "asks for"] : ["You", "offer", "give away", "ask for"];
  if (g && w) return `${who} ${offers} ${g} for ${w}`;
  return g ? `${who} ${gives} ${g}` : `${who} ${asks} ${w}`;
}

// #537: compact demand for a seat that cannot pay the ask.
export function lookingLine(name: string, want: Bag) {
  return `${name} is looking for ${bagText(want)}`;
}

// "Pine declined", "Pine and Tide declined".
function declinedLine(names: string[]) {
  if (names.length === 1) return `${names[0]} declined`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} declined`;
}

function reducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TradeToast() {
  const { phone } = useViewport();
  const chatOpen = useGame((s) => s.chatOpen);
  const aboveChat = phone && chatOpen;
  const offer = useGame((s) => s.offer);
  const declined = useGame((s) => s.declined);
  const outcome = useGame((s) => s.tradeOutcome);
  const takerId = useGame((s) => s.tradeTaker);
  const players = useGame((s) => s.state?.players);
  const localId = useGame((s) => s.localId);
  // A watcher (docs/design/spectator.md) reads the offer and the clock, with no Yes or No.
  const spectator = useGame((s) => s.spectator);
  const answerTrade = useGame((s) => s.answerTrade);
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const fadeMs = reducedMotion() ? 0 : DISMISS_MS;
  const lineId = useId();
  const dock = useRef<HTMLElement>(null);
  const hadOffer = useRef(false);
  const shown = !!offer && !declined.includes(localId);

  useEffect(() => {
    if (shown) {
      hadOffer.current = true;
      setLeaving(false);
      return;
    }
    if (!hadOffer.current || outcome) return;
    // #537: 150 ms dismiss fade; reduced motion clears at once.
    setLeaving(true);
    const t = window.setTimeout(() => {
      setLeaving(false);
      hadOffer.current = false;
    }, fadeMs);
    return () => window.clearTimeout(t);
  }, [shown, outcome, fadeMs]);

  useLayoutEffect(() => {
    const el = dock.current;
    if (!el) return;
    const stack = el.closest<HTMLElement>("[data-hud-stack]");
    const root = document.documentElement;
    let lastHeight = -1;
    let frame = 0;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      stack?.style.setProperty("--trade-height", `${h + 4}px`);
      root.style.setProperty("--active-offer-height", `${h + 8}px`);
      if (h !== lastHeight) { lastHeight = h; useGame.getState().chromeLanded(); }
    };
    measure();
    // Size writes can resize chat in turn. Leave the observer's delivery before writing them.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); stack?.style.removeProperty("--trade-height"); root.style.removeProperty("--active-offer-height"); };
  }, [shown, aboveChat, leaving]);

  useEffect(() => {
    if (!offer) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [offer]);

  const me = players?.find((p) => p.id === localId);
  if ((!me && !spectator) || (!offer && !outcome && !leaving)) return null;
  const name = (id: string) => players?.find((p) => p.id === id)?.name ?? "Someone";

  let body;
  let answering = false;
  let compact = false;
  if (!offer) {
    if (leaving && !outcome) {
      body = null;
    } else {
      const taker = players?.find((p) => p.id === takerId);
      const ResultIcon = takerId ? Check : X;
      return (
        <p
          className="trade-result table-log flex items-center gap-1 rounded-control px-3 py-1 text-caption"
          role="status"
          data-testid="trade-outcome"
          data-taker={takerId ?? undefined}
          data-fade-ms={fadeMs}
        >
          {taker ? <SeatDot color={taker.color} className="size-2.5" /> : null}
          <ResultIcon aria-hidden="true" className="size-3.5" />{outcome}
        </p>
      );
    }
  } else {
    if (declined.includes(localId)) return null;
    const left = Math.max(0, Math.ceil((offer.until - now) / 1000));
    const asker = offer.from === localId;
    const short = me ? RESOURCES.filter((r) => (offer.want[r] ?? 0) > me.resources[r]) : [];
    answering = !asker && !spectator;
    compact = answering && short.length > 0;

    if (compact) {
      const demand = lookingLine(offer.fromName, offer.want);
      body = (
        <>
          <div className="trade-summary flex min-w-0 items-center justify-between gap-2">
            <p id={lineId} className="text-sm font-medium leading-5" title={demand} data-testid="trade-demand">
              <SeatDot color={players?.find((p) => p.id === offer.from)?.color ?? "transparent"} className="mr-1.5 size-3 align-[-1px]" />
              {demand}
            </p>
            <span aria-hidden="true" className="trade-clock shrink-0 tabular-nums text-xs" data-testid="trade-countdown" data-urgent={left <= 5 || undefined}>
              {left} s
            </span>
          </div>
          <p aria-live="polite" className="sr-only" data-testid="trade-countdown-live">
            {left === 5 ? "5 seconds left" : ""}
          </p>
          <div className="trade-answers flex items-center gap-1">
            <Button
              variant="secondary"
              className="trade-no h-11 min-w-16 flex-1"
              data-testid="trade-dismiss"
              onClick={() => answerTrade(false)}
            >
              Dismiss
            </Button>
          </div>
        </>
      );
    } else {
      body = (
        <>
          <div className="trade-summary flex min-w-0 items-center justify-between gap-2">
            <p id={lineId} className="text-sm font-medium leading-5" title={offerLine(asker ? null : offer.fromName, offer.give, offer.want)}>
              {/* #312: another seat's offer leads with that seat's dot. */}
              {!asker ? <SeatDot color={players?.find((p) => p.id === offer.from)?.color ?? "transparent"} className="mr-1.5 size-3 align-[-1px]" /> : null}
              {offerLine(asker ? null : offer.fromName, offer.give, offer.want)}
            </p>
            {/* For answerers the 250 ms tick would chatter, so it is hidden; the polite line below speaks once, at 5 s. */}
            <span aria-hidden={!asker || undefined} className="trade-clock shrink-0 tabular-nums text-xs" data-testid="trade-countdown" data-urgent={left <= 5 || undefined}>
              {left} s
            </span>
          </div>
          {answering ? (
            <p aria-live="polite" className="sr-only" data-testid="trade-countdown-live">
              {left === 5 ? "5 seconds left" : ""}
            </p>
          ) : null}
          {asker ? (
            <p role="status" className="trade-wait sr-only">
              {declined.length ? declinedLine(declined.map(name)) : "Waiting…"}
            </p>
          ) : null}
          <div className="trade-details" tabIndex={0} role="group" aria-label="Trade amounts and player responses">
            {answering ? (
              <p className="trade-receipt" data-testid="trade-receipt">
                <span><strong>You give:</strong> {bagText(offer.want) || "nothing"}</span>
                <span><strong>You get:</strong> {bagText(offer.give) || "nothing"}</span>
              </p>
            ) : null}
            <ul className="trade-responses" aria-label="Player responses">
              {players?.filter((p) => p.id !== offer.from).map((p) => {
                const refused = declined.includes(p.id);
                const Icon = refused ? X : Hourglass;
                const response = refused ? "declined" : "waiting";
                return (
                  <li key={p.id} className="trade-response" data-testid={`trade-response-${p.id}`} data-response={response} aria-label={`${p.name}: ${response}`}>
                    <SeatDot color={p.color} className="size-2.5" />
                    <span className="trade-response-name">{p.name}</span>
                    <Icon aria-hidden="true" className="size-3.5" />
                  </li>
                );
              })}
            </ul>
          </div>
          {answering ? (
            <div className="trade-answers flex items-center gap-1">
              <Button
                className="trade-yes h-11 min-w-16 flex-1"
                onClick={() => answerTrade(true)}
              >
                Yes
              </Button>
              <Button variant="secondary" className="trade-no h-11 min-w-16 flex-1" onClick={() => answerTrade(false)}>
                No
              </Button>
            </div>
          ) : null}
        </>
      );
    }
  }

  if (!body && !leaving) return null;

  const card = (
    <section
      ref={dock}
      data-testid="trade-toast"
      data-compact={compact || undefined}
      data-leaving={leaving || undefined}
      data-fade-ms={fadeMs}
      className={`trade-dock pointer-events-auto shrink-0 rounded-chip p-2${aboveChat ? " trade-above-chat" : ""}${leaving ? " opacity-0" : " opacity-100"}`}
      style={{ transition: leaving ? `opacity ${fadeMs}ms linear` : undefined }}
      role="region"
      aria-label="Trade offer"
      aria-labelledby={offer ? lineId : undefined}
      onKeyDown={(e) => {
        if (answering && e.key === "Escape") answerTrade(false);
      }}
    >
      {body}
    </section>
  );
  const shell = document.querySelector("[data-game-shell]");
  return aboveChat && shell ? createPortal(card, shell) : card;
}
