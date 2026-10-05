// The ask-the-table toast (docs/BUILD_BIBLE.md 4.4): "Ember offers 2 wool for 1 ore", Yes / No, and the 20 s left.
// The asker sees the same offer with who has declined, then the outcome for a moment.
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { bagText } from "@/lib/game/trade";
import { useGame } from "@/lib/game/store";
import { RESOURCES } from "@/lib/game/types";
import type { Bag } from "@/lib/net/table";
import { useViewport } from "@/lib/viewport";
import { cn } from "@/lib/utils";

// "Ember offers 2 wool for 1 ore"; the asker reads "You offer 2 wool for 1 ore".
function offerLine(name: string | null, give: Bag, want: Bag) {
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
  const offer = useGame((s) => s.offer);
  const declined = useGame((s) => s.declined);
  const outcome = useGame((s) => s.tradeOutcome);
  const players = useGame((s) => s.state?.players);
  const localId = useGame((s) => s.localId);
  // A watcher (docs/design/spectator.md) reads the offer and the clock, with no Yes or No.
  const spectator = useGame((s) => s.spectator);
  const answerTrade = useGame((s) => s.answerTrade);
  const [now, setNow] = useState(() => Date.now());
  const { phone, portrait } = useViewport();
  const lineId = useId();
  const whyId = useId();

  useEffect(() => {
    if (!offer) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [offer]);

  const me = players?.find((p) => p.id === localId);
  if ((!me && !spectator) || (!offer && !outcome)) return null;
  const name = (id: string) => players?.find((p) => p.id === id)?.name ?? "Someone";

  let body;
  let answering = false;
  let why: string | null = null;
  if (!offer) {
    body = (
      <p role="status" className="text-sm font-medium" data-testid="trade-outcome">
        {outcome}
      </p>
    );
  } else {
    if (declined.includes(localId)) return null;
    const left = Math.max(0, Math.ceil((offer.until - now) / 1000));
    const asker = offer.from === localId;
    const short = me ? RESOURCES.filter((r) => (offer.want[r] ?? 0) > me.resources[r]) : [];
    answering = !asker && !spectator;
    why = me && short.length ? `Need ${short.map((r) => `${offer.want[r]! - me.resources[r]} more ${r}`).join(", ")}` : null;
    body = (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <p id={lineId} className="text-sm font-medium">
            {/* #312: another seat's offer leads with that seat's dot and mark. */}
            {!asker ? <SeatDot color={players?.find((p) => p.id === offer.from)?.color ?? "transparent"} className="mr-1.5 size-3 align-[-1px]" /> : null}
            {offerLine(asker ? null : offer.fromName, offer.give, offer.want)}
          </p>
          {/* For answerers the 250 ms tick would chatter, so it is hidden; the polite line below speaks once, at 5 s. */}
          <span aria-hidden={!asker || undefined} className="shrink-0 tabular-nums text-xs text-zinc-600" data-testid="trade-countdown">
            {left} s
          </span>
        </div>
        {answering ? (
          <p aria-live="polite" className="sr-only" data-testid="trade-countdown-live">
            {left === 5 ? "5 seconds left" : ""}
          </p>
        ) : null}
        {asker ? (
          <p role="status" className="mt-1 text-xs text-zinc-600">
            {declined.length ? declinedLine(declined.map(name)) : "Waiting…"}
          </p>
        ) : !answering ? null : (
          <>
            <div className="mt-2 flex items-center gap-2">
              {/* aria-disabled, not disabled, so Tab still reaches Yes and reads the reason (#285); the click refuses instead. */}
              <Button
                className="h-11 min-w-[88px] flex-1 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:scale-100"
                aria-disabled={why !== null || undefined}
                aria-describedby={why ? whyId : undefined}
                onClick={() => {
                  if (why === null) answerTrade(true);
                }}
              >
                Yes
              </Button>
              <Button variant="secondary" className="h-11 min-w-[88px] flex-1" onClick={() => answerTrade(false)}>
                No
              </Button>
            </div>
            {why ? (
              <p id={whyId} className="mt-1 text-xs text-orange-700">
                {why}
              </p>
            ) : null}
          </>
        )}
      </>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 flex",
        // Under the portrait seat strip (#177); beside the chat button in landscape; clear of the rail on desktop.
        phone && portrait
          ? "inset-x-3 top-[calc(env(safe-area-inset-top)+7.5rem)]"
          : phone
            ? "left-safe right-safe mr-13 top-16"
            : "left-3 right-16 top-16 md:left-[15.5rem] lg:inset-x-3 lg:justify-center",
      )}
    >
      {/* An answerable offer is an alertdialog so it is announced on arrival, but focus stays put (it would yank focus
          mid-build); Escape from inside answers No. */}
      <div
        data-testid="trade-toast"
        className="pointer-events-auto w-full max-w-sm rounded-[16px] border border-accent/40 bg-surface p-3"
        role={answering ? "alertdialog" : undefined}
        aria-labelledby={answering ? lineId : undefined}
        aria-describedby={answering && why ? whyId : undefined}
        onKeyDown={(e) => {
          if (answering && e.key === "Escape") answerTrade(false);
        }}
      >
        {body}
      </div>
    </div>
  );
}
