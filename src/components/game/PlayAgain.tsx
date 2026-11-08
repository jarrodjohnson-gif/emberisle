// #1411 (docs/design/play-again-1411, option A): a guest's "I'll play again" and the screen-reader count. Its own chunk
// (chunks.ts), fetched with the online table, so the win screen's sheets chunk stays inside its allowance.
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

// Only the host starts the next game; this says "count me in", and never starts, blocks or delays it.
export function WantAgain() {
  const wanted = useGame((s) => Boolean(s.seats.find((x) => x.id === s.seatId)?.again));
  const wantAgain = useGame((s) => s.wantAgain);
  return (
    <Button variant={wanted ? "secondary" : "default"} aria-pressed={wanted} className="min-w-fit flex-1 whitespace-nowrap" data-testid="win-want" onClick={() => wantAgain(!wanted)}>
      {wanted ? <span aria-hidden="true">✓</span> : null}
      I'll play again
    </Button>
  );
}

// The win screen counts (its `yes`): the host, bots and every yes, of everyone not away.
export function WantCount({ n, of }: { n: number; of: number }) {
  return (
    <p role="status" className="sr-only">
      {n} of {of} want another game
    </p>
  );
}
