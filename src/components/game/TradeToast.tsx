// The ask-the-table offer in the tray (docs/design/one-tray, slice C): the top line says it in one sentence, "Tide: give 1
// wood, get 1 brick", and the action row is No and Yes. The asker reads "You offer 2 sheep for 1 ore", who has said no,
// and Cancel; then the outcome for a moment, where the newest event sits.
// #537: a seat that cannot pay reads "Ember is looking for 2 ore" with Dismiss only.
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, X } from "lucide-react";
import { useViewport } from "@/lib/viewport";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { bagText } from "@/lib/game/trade";
import { useGame } from "@/lib/game/store";
import { RESOURCES, RESOURCE_LABEL } from "@/lib/game/types";
import type { Bag } from "@/lib/net/table";
import "./trade-panel.css";
import { useCounter } from "./counter-proto";

const DISMISS_MS = 150;
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

import { offerLine } from "./offer-line";
export { offerLine } from "./offer-line";

// "Pine said no", "Pine and Tide said no".
// The ask closed the trade sheet and the Trade button gave way to Cancel: if focus fell to the page, Cancel takes it (#378).
const takeFocus = (el: HTMLButtonElement | null) => {
  // The trade sheet hands focus back a few frames after the offer is up; Cancel takes it once focus has left the sheet.
  let tries = 0;
  const settle = () => {
    if (!el?.isConnected || tries++ > 30) return;
    const at = document.activeElement;
    if (at?.closest("[role='dialog']")) return void requestAnimationFrame(settle);
    // The sheet hands focus to the Trade button, which this offer hides, so Cancel takes it unless the player is typing.
    if (!at?.closest("input, textarea, select")) el.focus();
  };
  if (el) requestAnimationFrame(settle);
};

// One short line that never wraps the tray's top line: the name alone (no "(bot)"), or a count once two have answered.
function declinedLine(names: string[]) {
  return names.length > 1 ? `${names.length} said no` : `${names[0]!.replace(/ \(bot\)$/, "")} said no`;
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
  const cancelTrade = useGame((s) => s.cancelTrade);
  const proto = useCounter();
  const [leaving, setLeaving] = useState(false);
  const fadeMs = calm() ? 0 : DISMISS_MS;
  const lineId = useId();
  const whyId = useId();
  const dock = useRef<HTMLElement>(null);
  const hadOffer = useRef(false);
  // The last offer body, so the dismiss fade shows the card going away instead of an empty one.
  const lastBody = useRef<ReactNode>(null);
  const shown = !!offer && !declined.includes(localId);

  useEffect(() => {
    if (shown) {
      hadOffer.current = true;
      setLeaving(false);
      return;
    }
    // The offer is over and its outcome line shows: nothing is left to fade, and the old card must not come back when the line clears.
    if (outcome) {
      hadOffer.current = false;
      setLeaving(false);
      return;
    }
    if (!hadOffer.current) return;
    // #537: 150 ms dismiss fade; reduced motion clears at once.
    setLeaving(true);
    const t = window.setTimeout(() => { setLeaving(false); hadOffer.current = false; }, fadeMs);
    return () => window.clearTimeout(t);
  }, [shown, outcome, fadeMs]);

  useLayoutEffect(() => {
    const el = dock.current;
    if (!el) return;
    const root = document.documentElement;
    let lastHeight = -1;
    let frame = 0;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      // Only the card that rides above the phone's open chat takes room from the chat sheet; in the tray it takes none.
      if (aboveChat) root.style.setProperty("--active-offer-height", `${h + 8}px`);
      if (h !== lastHeight) { lastHeight = h; useGame.getState().chromeLanded(); }
    };
    measure();
    // Size writes can resize chat in turn. Leave the observer's delivery before writing them.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); root.style.removeProperty("--active-offer-height"); };
  }, [shown, aboveChat, leaving]);

  // True from the very render after this seat answers, so the card stays mounted and its opacity transition runs (#537).
  const fading = leaving || (hadOffer.current && !shown && !outcome);
  const me = players?.find((p) => p.id === localId);
  if ((!me && !spectator) || (!offer && !outcome && !fading)) return null;
  const name = (id: string) => players?.find((p) => p.id === id)?.name ?? "Someone";

  let body;
  let answering = false;
  let compact = false;
  let why: string | null = null;
  if (offer && proto.counterNo && offer.from !== localId) {
    // Prototype: the sender's counter was refused; the outcome line shows for 2.5 s, then the first offer comes back.
    return (
      <p className="trade-result" role="status" data-testid="trade-outcome">
        <X aria-hidden="true" className="size-3.5" />{proto.counterNo}
      </p>
    );
  }
  if (!offer) {
    if (!fading || outcome) {
      const taker = players?.find((p) => p.id === takerId);
      const ResultIcon = takerId ? Check : X;
      return (
        <p className="trade-result" role="status" data-testid="trade-outcome" data-taker={takerId ?? undefined} data-fade-ms={fadeMs}>
          {taker ? <SeatDot color={taker.color} className="size-2.5" /> : null}
          <ResultIcon aria-hidden="true" className="size-3.5" />{outcome}
        </p>
      );
    }
  } else if (!declined.includes(localId)) {
    // #1507 (owner q1504-offer-hold A): all offers hold until answered; no countdown.
    const asker = offer.from === localId;
    const short = me ? RESOURCES.filter((r) => (offer.want[r] ?? 0) > me.resources[r]) : [];
    answering = !asker && !spectator;
    compact = answering && short.length > 0;
    // #537: the compact signal drops the visible "Need" line, so keyboard and screen-reader users still get the reason.
    why = compact && me ? `You need ${short.map((r) => `${offer.want[r]! - me.resources[r]} more ${RESOURCE_LABEL[r].toLowerCase()}`).join(", ")} to accept` : null;
    const fromColor = players?.find((p) => p.id === offer.from)?.color ?? "transparent";
    // Prototype: Counter shows when the offer allows counters and this seat has not used its one.
    const counterable = answering && proto.counterAllowed && !proto.counterUsed && !proto.myCounter;
    const counterButton = counterable && !proto.optionB
      ? <Button variant="secondary" data-testid="trade-counter" onClick={() => useCounter.setState({ counterSheet: true })}>Counter</Button>
      : null;
    const tapLine = counterable && proto.optionB && !compact;
    const Wrap = tapLine ? "span" : Fragment;
    const waiting = asker ? proto.counters[0] : undefined;
    const mine = answering ? proto.myCounter : null;
    const gives = bagText(offer.want);
    const gets = bagText(offer.give);
    // What this seat would give is red and what it would get is green, as on the trade sheet.
    const line = compact
      ? `${offer.fromName} is looking for ${gives}`
      : answering
        ? `${offer.fromName}: ${gives ? `give ${gives}` : ""}${gives && gets ? ", " : ""}${gets ? `get ${gets}` : ""}`
        : offerLine(asker ? null : offer.fromName, offer.give, offer.want);
    if (waiting) {
      const by = players?.find((p) => p.id === waiting.by);
      body = (
        <>
          <div className="trade-summary">
            <p id={lineId} className="trade-line" data-testid="trade-counter-line">
              <SeatDot color={by?.color ?? "transparent"} className="mr-1.5 size-3 align-[-1px]" />
              {waiting.name} counters: <b className="trade-give-text">give {bagText(waiting.give)}</b>, <b className="trade-get-text">get {bagText(waiting.want)}</b>
            </p>
            {proto.counters.length > 1 ? <p role="status" className="trade-wait">1 of {proto.counters.length}</p> : null}
          </div>
          <div className="trade-answers">
            <Button variant="secondary" onClick={() => useCounter.setState({ counters: proto.counters.slice(1) })}>No</Button>
            <Button className="trade-yes" onClick={() => useCounter.setState({ counters: [] })}>Yes</Button>
          </div>
        </>
      );
    } else if (mine) {
      body = (
        <>
          <div className="trade-summary">
            <p id={lineId} className="trade-line" data-testid="trade-my-counter">
              You counter: <b className="trade-give-text">give {bagText(mine.want)}</b>, <b className="trade-get-text">get {bagText(mine.give)}</b>
            </p>
            <p role="status" className="trade-wait">Waiting for {offer.fromName}</p>
          </div>
          <div className="trade-answers">
            <Button variant="secondary" data-testid="trade-take-back" onClick={() => useCounter.setState({ myCounter: null })}>Take back</Button>
          </div>
        </>
      );
    } else body = (
      <>
        <div className="trade-summary">
          <p id={lineId} className="trade-line" title={line} data-testid={compact ? "trade-demand" : undefined}
            {...(tapLine ? { role: "button", tabIndex: 0, "data-tap": "", onClick: () => useCounter.setState({ counterSheet: true }) } : {})}>
            {asker ? null : <SeatDot color={fromColor} className="mr-1.5 size-3 align-[-1px]" />}
            {answering && !compact ? (
              <Wrap>
                {offer.fromName}: {gives ? <b className="trade-give-text">give {gives}</b> : null}
                {gives && gets ? ", " : null}
                {gets ? <b className="trade-get-text">get {gets}</b> : null}
              </Wrap>
            ) : line}
            {tapLine ? <ChevronRight aria-hidden="true" className="trade-chevron" /> : null}
          </p>
          {asker ? (
            <p role="status" className={declined.length ? "trade-wait" : "sr-only"}>
              {declined.length ? declinedLine(declined.map(name)) : "Waiting…"}
            </p>
          ) : null}
        </div>
        {compact ? <p id={whyId} className="sr-only" data-testid="trade-why">{why}</p> : null}
        {spectator ? null : (
          <div className="trade-answers">
            {compact ? (
              <>
                <Button variant="secondary" data-testid="trade-dismiss" aria-describedby={whyId} onClick={() => answerTrade(false)}>Dismiss</Button>
                {counterButton}
              </>
            ) : asker ? (
              // #1245: a person's offer holds until answered, so the asker can always take it back.
              <Button ref={takeFocus} variant="secondary" data-testid="trade-cancel" onClick={cancelTrade}>Cancel</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => answerTrade(false)}>No</Button>
                {counterButton}
                <Button className="trade-yes" onClick={() => answerTrade(true)}>Yes</Button>
              </>
            )}
          </div>
        )}
      </>
    );
  } else if (!fading) {
    // This seat answered; the offer stays open for the others. While `fading`, the last body fades out below (#537).
    return null;
  }

  if (body) lastBody.current = body;
  if (!body && !fading) return null;

  const card = (
    <section
      ref={dock}
      data-testid="trade-toast"
      data-compact={compact || undefined}
      data-leaving={fading || undefined}
      aria-hidden={fading || undefined}
      inert={fading || undefined}
      data-fade-ms={fadeMs}
      className={`trade-dock${aboveChat ? " trade-above-chat" : ""}${fading ? " opacity-0" : " opacity-100"}`}
      style={{ transition: fading ? `opacity ${fadeMs}ms linear` : undefined }}
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
