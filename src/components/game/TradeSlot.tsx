// #1101 (DECISIONS 2026-10-22): the offer in the phone dock's status line, one line plus Yes and No, in the line's fixed
// box, so an offer coming or going moves nothing. Its own chunk, off the first-load index; the table prefetches it on idle.
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { useGame } from "@/lib/game/store";

export type TradeSlotProps = {
  line: string;
  // The offering seat's dot; none for the asker's own offer.
  color?: string;
  left: number;
  why: string | null;
  // Who has declined, for the asker; none for anyone else.
  wait?: string;
  answering: boolean;
  lineId: string;
  whyId: string;
};

export function TradeSlot({ line, color, left, why, wait, answering, lineId, whyId }: TradeSlotProps) {
  const answerTrade = useGame((s) => s.answerTrade);
  return (
    <section
      data-testid="trade-toast"
      className="trade-slot flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control pl-3"
      role="region"
      aria-label="Trade offer"
      aria-labelledby={lineId}
      aria-describedby={why ? whyId : undefined}
      onKeyDown={(e) => {
        if (answering && e.key === "Escape") answerTrade(false);
      }}
    >
      <div className="min-w-0 flex-1">
        <p id={lineId} className="truncate text-sm font-medium leading-5" title={line}>
          {color ? <SeatDot color={color} className="mr-1.5 size-3 align-[-1px]" /> : null}
          {line}
        </p>
        <p className="flex min-w-0 gap-2 truncate text-xs leading-4">
          <span aria-hidden={wait === undefined || undefined} className="trade-clock shrink-0 tabular-nums" data-testid="trade-countdown" data-urgent={left <= 5 || undefined}>
            {left} s
          </span>
          {why ? <span id={whyId} className="trade-short truncate">{why}</span> : null}
          {wait !== undefined ? <span role="status" className="trade-wait truncate">{wait}</span> : null}
        </p>
      </div>
      {answering ? (
        <>
          <p aria-live="polite" className="sr-only" data-testid="trade-countdown-live">
            {left === 5 ? "5 seconds left" : ""}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              className="trade-yes h-11 min-w-14 aria-disabled:cursor-not-allowed aria-disabled:active:scale-100"
              aria-disabled={why !== null || undefined}
              aria-describedby={why ? whyId : undefined}
              onClick={() => {
                if (why === null) answerTrade(true);
              }}
            >
              Yes
            </Button>
            <Button variant="secondary" className="trade-no h-11 min-w-14" onClick={() => answerTrade(false)}>
              No
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
