// The ask-the-table toast (docs/BUILD_BIBLE.md 4.4): "Ember offers 2 sheep for 1 ore", Yes / No, and the 20 s left.
// The asker sees the same offer with who has declined, then the outcome for a moment.
// #537: a seat that cannot pay sees a compact demand ("Ember is looking for 2 ore") with Dismiss only — no Accept.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Hourglass, X } from "lucide-react";
import { useViewport } from "@/lib/viewport";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { bagText } from "@/lib/game/trade";
import { useGame } from "@/lib/game/store";
import { RESOURCES, RESOURCE_LABEL } from "@/lib/game/types";
import type { Bag } from "@/lib/net/table";
import "./trade-panel.css";

const DISMISS_MS = 150;
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// "Ember offers 2 sheep for 1 ore"; the asker reads "You offer 2 sheep for 1 ore".
export function offerLine(name: string | null, give: Bag, want: Bag) {
  const g = bagText(give);
  const w = bagText(want);
  const [who, offers, gives, asks] = name ? [name, "offers", "gives away", "asks for"] : ["You", "offer", "give away", "ask for"];
  if (g && w) return `${who} ${offers} ${g} for ${w}`;
  return g ? `${who} ${gives} ${g}` : `${who} ${asks} ${w}`;
}

// "Pine declined", "Pine and Tide declined".
function declinedLine(names: string[]) {
  if (names.length === 1) return `${names[0]} declined`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} declined`;
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
  const fadeMs = calm() ? 0 : DISMISS_MS;
  const lineId = useId();
  const whyId = useId();
  const dock = useRef<HTMLElement>(null);
  const hadOffer = useRef(false);
  // The last offer body, so the dismiss fade shows the card going away instead of an empty one.
  const lastBody = useRef<ReactNode>(null);
  const shown =!!offer && !declined.includes(localId);

  useEffect(() => {
    if (shown) {
      hadOffer.current = true;
      setLeaving(false);
      return;
    }
    if (!hadOffer.current || outcome) return;
    // #537: 150 ms dismiss fade; reduced motion clears at once.
    setLeaving(true);
    const t = window.setTimeout(() => { setLeaving(false); hadOffer.current = false; }, fadeMs);
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
  let why: string | null = null;
  if (!offer) {
    if (!leaving || outcome) {
      const taker = players?.find((p) => p.id === takerId);
      const ResultIcon = takerId ? Check : X;
      return (
        <p className="trade-result table-log flex items-center gap-1 rounded-control px-3 py-1 text-caption" role="status" data-testid="trade-outcome" data-taker={takerId ?? undefined} data-fade-ms={fadeMs}>
          {taker ? <SeatDot color={taker.color} className="size-2.5" /> : null}
          <ResultIcon aria-hidden="true" className="size-3.5" />{outcome}
        </p>
      );
    }
  } else if (!declined.includes(localId)) {
    const left = Math.max(0, Math.ceil((offer.until - now) / 1000));
    const asker = offer.from === localId;
    const short = me ? RESOURCES.filter((r) => (offer.want[r] ?? 0) > me.resources[r]) : [];
    answering = !asker && !spectator;
    compact = answering && short.length > 0;
    // #537: the compact signal drops the visible "Need" line, so keyboard and screen-reader users still get the reason.
    why = compact && me ? `You need ${short.map((r) => `${offer.want[r]! - me.resources[r]} more ${RESOURCE_LABEL[r].toLowerCase()}`).join(", ")} to accept` : null;
    const fromColor = players?.find((p) => p.id === offer.from)?.color ?? "transparent";
    const line = compact
      ? `${offer.fromName} is looking for ${bagText(offer.want)}`
      : offerLine(asker ? null : offer.fromName, offer.give, offer.want);
    const tick = (
      <>
        <div className="trade-summary flex min-w-0 items-center justify-between gap-2">
          <p id={lineId} className="text-sm font-medium leading-5" title={line} data-testid={compact ? "trade-demand" : undefined}>
            {!asker || compact ? <SeatDot color={fromColor} className="mr-1.5 size-3 align-[-1px]" /> : null}
            {line}
          </p>
          <span aria-hidden={(!asker && !compact) || undefined} className="trade-clock shrink-0 tabular-nums text-xs" data-testid="trade-countdown" data-urgent={left <= 5 || undefined}>
            {left} s
          </span>
        </div>
        {answering ? (
          <p aria-live="polite" className="sr-only" data-testid="trade-countdown-live">
            {left === 5 ? "5 seconds left" : ""}
          </p>
        ) : null}
      </>
    );
    if (compact) {
      body = (
        <>
          {tick}
          <p id={whyId} className="sr-only" data-testid="trade-why">{why}</p>
          <div className="trade-answers flex items-center gap-1">
            <Button variant="secondary" className="trade-no h-11 min-w-16 flex-1" data-testid="trade-dismiss" aria-describedby={whyId} onClick={() => answerTrade(false)}>
              Dismiss
            </Button>
          </div>
        </>
      );
    } else {
      body = (
        <>
          {tick}
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
              <Button className="trade-yes h-11 min-w-16 flex-1" onClick={() => answerTrade(true)}>Yes</Button>
              <Button variant="secondary" className="trade-no h-11 min-w-16 flex-1" onClick={() => answerTrade(false)}>No</Button>
            </div>
          ) : null}
        </>
      );
    }
  } else {
    return null;
  }

  if (body) lastBody.current = body;
  if (!body && !leaving) return null;

  const card = (
    <section
      ref={dock}
      data-testid="trade-toast"
      data-compact={compact || undefined}
      data-leaving={leaving || undefined}
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
      data-fade-ms={fadeMs}
      className={`trade-dock pointer-events-auto shrink-0 rounded-chip p-2${aboveChat ? " trade-above-chat" : ""}${leaving ? " opacity-0" : " opacity-100"}`}
      style={{ transition: leaving ? `opacity ${fadeMs}ms linear` : undefined }}
      role="region"
      aria-label="Trade offer"
      aria-labelledby={offer ? lineId : undefined}
      aria-describedby={why ? whyId : undefined}
      onKeyDown={(e) => { if (answering && e.key === "Escape") answerTrade(false); }}
    >
      {body ?? lastBody.current}
    </section>
  );
  const shell = document.querySelector("[data-game-shell]");
  return aboveChat && shell ? createPortal(card, shell) : card;
}
