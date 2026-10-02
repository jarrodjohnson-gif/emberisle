// The ask-the-table toast (docs/BUILD_BIBLE.md 4.4): "Ember offers 2 wool for 1 ore", Yes / No, and the 20 s left.
// The asker sees the same offer with who has declined, then the outcome for a moment.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { bagText } from "@/components/game/TradePanel";
import { useGame } from "@/lib/game/store";
import { RESOURCES } from "@/lib/game/types";
import type { Bag } from "@/lib/net/table";

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
  const answerTrade = useGame((s) => s.answerTrade);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!offer) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [offer]);

  const me = players?.find((p) => p.id === localId);
  if (!me || (!offer && !outcome)) return null;
  const name = (id: string) => players?.find((p) => p.id === id)?.name ?? "Someone";

  let body;
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
    const short = RESOURCES.filter((r) => (offer.want[r] ?? 0) > me.resources[r]);
    const why = short.length ? `Need ${short.map((r) => `${offer.want[r]! - me.resources[r]} more ${r}`).join(", ")}` : null;
    body = (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">{offerLine(asker ? null : offer.fromName, offer.give, offer.want)}</p>
          <span className="shrink-0 tabular-nums text-xs text-zinc-600" data-testid="trade-countdown">
            {left} s
          </span>
        </div>
        {asker ? (
          <p role="status" className="mt-1 text-xs text-zinc-600">
            {declined.length ? declinedLine(declined.map(name)) : "Waiting…"}
          </p>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-2">
              <Button className="h-11 min-w-[88px] flex-1" disabled={why !== null} onClick={() => answerTrade(true)}>
                Yes
              </Button>
              <Button variant="secondary" className="h-11 min-w-[88px] flex-1" onClick={() => answerTrade(false)}>
                No
              </Button>
            </div>
            {why ? <p className="mt-1 text-xs text-orange-700">{why}</p> : null}
          </>
        )}
      </>
    );
  }

  return (
    <div className="pointer-events-none absolute left-3 right-16 top-16 z-20 flex md:left-[15.5rem] lg:inset-x-3 lg:justify-center">
      <div data-testid="trade-toast" className="pointer-events-auto w-full max-w-sm rounded-[16px] border border-accent/40 bg-surface p-3">
        {body}
      </div>
    </div>
  );
}
