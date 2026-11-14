// The ask-the-table offer in the tray (docs/design/one-tray, slice C): the top line says it in one sentence, "Tide: give 1
// wood, get 1 brick", and the action row is No and Yes. The asker reads "You offer 2 sheep for 1 ore", who has said no,
// and Cancel; then the outcome for a moment, where the newest event sits.
// #537: a seat that cannot pay reads "Ember is looking for 2 ore" with Dismiss only.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { useViewport } from "@/lib/viewport";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { bagText } from "@/lib/game/trade";
import { useGame } from "@/lib/game/store";
import { RESOURCES, RESOURCE_LABEL } from "@/lib/game/types";
import type { Bag } from "@/lib/net/table";
import "./trade-panel.css";

// Return focus to Trade if present, else End turn, when an offer ends (#1592).
function returnTrayFocus() {
  let tries = 0;
  const settle = () => {
    if (tries++ > 30) return;
    const at = document.activeElement;
    if (at && at !== document.body && at !== document.documentElement) {
      if (at.closest("input, textarea, select, [role='dialog'], [data-testid='chat-dock'], [data-testid='chat-input']")) return;
    }
    const stack = document.querySelector("[data-hud-stack]");
    if (!stack) return void requestAnimationFrame(settle);
    const buttons = [...stack.querySelectorAll<HTMLButtonElement>("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !b.closest(".sr-only,[hidden]");
    });
    const trade = buttons.find((b) => b.textContent?.trim().includes("Trade"));
    if (trade) {
      trade.focus();
      return;
    }
    const endTurn = buttons.find((b) => b.textContent?.trim() === "End turn");
    if (endTurn) {
      endTurn.focus();
      return;
    }
    if (tries < 15) requestAnimationFrame(settle);
  };
  requestAnimationFrame(settle);
}

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
  const [leaving, setLeaving] = useState(false);
  const fadeMs = calm() ? 0 : DISMISS_MS;
  const lineId = useId();
  const whyId = useId();
  const dock = useRef<HTMLElement>(null);
  const hadOffer = useRef(false);
  const hadFocus = useRef(false);
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
      if (hadFocus.current) {
        hadFocus.current = false;
        returnTrayFocus();
      }
      hadOffer.current = false;
      setLeaving(false);
      return;
    }
    if (!hadOffer.current) return;
    // #537: 150 ms dismiss fade; reduced motion clears at once.
    setLeaving(true);
    const t = window.setTimeout(() => {
      setLeaving(false);
      hadOffer.current = false;
      if (hadFocus.current) {
        hadFocus.current = false;
        returnTrayFocus();
      }
    }, fadeMs);
    return () => window.clearTimeout(t);
  }, [shown, outcome, fadeMs]);

  useEffect(() => {
    return () => {
      if (hadFocus.current) {
        hadFocus.current = false;
        returnTrayFocus();
      }
    };
  }, []);

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
    const gives = bagText(offer.want);
    const gets = bagText(offer.give);
    // What this seat would give is red and what it would get is green, as on the trade sheet.
    const line = compact
      ? `${offer.fromName} is looking for ${gives}`
      : answering
        ? `${offer.fromName}: ${gives ? `give ${gives}` : ""}${gives && gets ? ", " : ""}${gets ? `get ${gets}` : ""}`
        : offerLine(asker ? null : offer.fromName, offer.give, offer.want);
    body = (
      <>
        <div className="trade-summary">
          <p id={lineId} className="trade-line" title={line} data-testid={compact ? "trade-demand" : undefined}>
            {asker ? null : <SeatDot color={fromColor} className="mr-1.5 size-3 align-[-1px]" />}
            {answering && !compact ? (
              <>
                {offer.fromName}: {gives ? <b className="trade-give-text">give {gives}</b> : null}
                {gives && gets ? ", " : null}
                {gets ? <b className="trade-get-text">get {gets}</b> : null}
              </>
            ) : line}
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
              <Button variant="secondary" data-testid="trade-dismiss" aria-describedby={whyId} onClick={() => answerTrade(false)}>Dismiss</Button>
            ) : asker ? (
              // #1245: a person's offer holds until answered, so the asker can always take it back.
              <Button ref={takeFocus} variant="secondary" data-testid="trade-cancel" onClick={cancelTrade}>Cancel</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => answerTrade(false)}>No</Button>
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
      onFocusCapture={() => { hadFocus.current = true; }}
      onPointerDownCapture={() => { hadFocus.current = true; }}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Element | null;
        if (next?.closest?.("input, textarea, select, [role='dialog'], [data-testid='chat-dock'], [data-testid='chat-input']")) {
          hadFocus.current = false;
        }
      }}
      onKeyDown={(e) => { if (answering && e.key === "Escape") answerTrade(false); }}
    >
      {body ?? lastBody.current}
    </section>
  );
  const shell = document.querySelector("[data-game-shell]");
  return aboveChat && shell ? createPortal(card, shell) : card;
}
