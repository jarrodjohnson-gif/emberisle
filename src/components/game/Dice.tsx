// #322: the two dice as faces with pips. The whole row is one image to a screen reader, so it hears
// "Rolled 3 and 4, 7" once instead of three bare numbers.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";
import { cn } from "@/lib/utils";
import { useGame } from "@/lib/game/store";

// Cells of a 3x3 grid, row by row from the top left, that hold a pip for each face.
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, big }: { value: number; big?: boolean }) {
  return (
    <span
      data-testid="die"
      data-value={value}
      className={cn(
        "grid grid-cols-3 grid-rows-3 place-items-center bg-fg text-bg motion-safe:animate-[die-settle_150ms_ease-out]",
        big ? "size-16 rounded-control p-2" : "size-9 rounded-[8px] p-1",
      )}
    >
      {PIPS[value].map((cell) => (
        <span
          key={cell}
          data-pip
          className={cn("rounded-full bg-current", big ? "size-2.5" : "size-1.5")}
          style={{ gridRow: Math.floor(cell / 3) + 1, gridColumn: (cell % 3) + 1 }}
        />
      ))}
    </span>
  );
}

// True while the roll moment holds the dice centre screen, so the resting row waits for them to land (#440).
const useMomentUp = create<{ up: boolean }>(() => ({ up: false }));

export function Dice({ values: [a, b] }: { values: [number, number] }) {
  const up = useMomentUp((s) => s.up);
  return (
    <div
      role="img"
      data-testid="dice-row"
      aria-label={`Rolled ${a} and ${b}, ${a + b}`}
      className={cn("flex items-center gap-2 self-start text-sm text-zinc-600", up && "invisible")}
    >
      {/* Keyed by the roll so a new roll remounts the faces and settles again. */}
      <Die key={`a${a}${b}`} value={a} />
      <Die key={`b${a}${b}`} value={b} />
      <span className="tabular-nums">{a + b}</span>
    </div>
  );
}

// docs/design/polish.md "Motion": --duration-moment, --duration-base and --ease-out.
const MOMENT_MS = 900;
const SETTLE_MS = 220;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Roll = { n: number; dice: [number, number]; said: string };

// #440: each roll is shown once, big and centred, then shrinks into the resting dice row. A roll is `state.rolls` going up
// by exactly one, as the island's glow reads it, so a first load, a reconnect or a jump of several rolls replays nothing;
// practice, bots, hotseat, online seats and watchers all arrive through the same state. Input is never blocked: the moment
// takes no pointer events, and any press or key ends it early. Reduced motion holds the number, then it simply goes.
// The roll is read out here, once; the banner carries only who gathered what.
export function RollMoment() {
  const state = useGame((s) => s.state);
  const mode = useGame((s) => s.mode);
  const localId = useGame((s) => s.localId);
  const spectator = useGame((s) => s.spectator);
  const rolls = state?.rolls ?? 0;
  const seen = useRef(rolls);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [said, setSaid] = useState<Roll | null>(null);
  const chip = useRef<HTMLDivElement>(null);

  // Before paint, so the moment shows in the same frame as the dice, not one frame later.
  useLayoutEffect(() => {
    const was = seen.current;
    seen.current = rolls;
    if (rolls !== was + 1 || !state?.dice) return;
    const [a, b] = state.dice;
    const you = mode !== "hotseat" && !spectator && state.current === localId;
    const who = you ? "You" : (state.players.find((p) => p.id === state.current)?.name ?? "Someone");
    const next = { n: rolls, dice: state.dice, said: `${who} rolled ${a} and ${b}: ${a + b}.` };
    setRoll(next);
    setSaid(next);
  }, [rolls, state, mode, localId, spectator]);

  useEffect(() => {
    if (!roll) return;
    useMomentUp.setState({ up: true });
    let flight: Animation | null = null;
    const end = () => setRoll(null);
    // The schedule is the clock's, not the animation's: a slow frame may cut the flight short, never keep the moment up.
    let done: ReturnType<typeof setTimeout> | undefined;
    const hold = setTimeout(() => {
      const el = chip.current;
      const row = document.querySelector('[data-testid="dice-row"]');
      if (!el || !row || matchMedia("(prefers-reduced-motion: reduce)").matches) return end();
      // Layout boxes, so an entry scale still running on a slow device does not skew the flight.
      const box = (el.offsetParent ?? document.body).getBoundingClientRect();
      const to = row.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (box.left + el.offsetLeft + el.offsetWidth / 2);
      const dy = to.top + to.height / 2 - (box.top + el.offsetTop + el.offsetHeight / 2);
      const scale = Math.min(to.width / el.offsetWidth, to.height / el.offsetHeight);
      flight = el.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], {
        duration: SETTLE_MS,
        easing: EASE_OUT,
        fill: "forwards",
      });
      done = setTimeout(end, SETTLE_MS);
    }, MOMENT_MS);
    window.addEventListener("pointerdown", end, true);
    window.addEventListener("keydown", end, true);
    return () => {
      clearTimeout(hold);
      clearTimeout(done);
      flight?.cancel();
      window.removeEventListener("pointerdown", end, true);
      window.removeEventListener("keydown", end, true);
      useMomentUp.setState({ up: false });
    };
  }, [roll]);

  const sum = roll ? roll.dice[0] + roll.dice[1] : 0;
  return (
    <>
      <p data-testid="announce-roll" className="sr-only" aria-live="polite" aria-atomic="true">
        {/* Keyed by the roll, so the same numbers twice in a row are read twice. */}
        {said ? <span key={said.n}>{said.said}</span> : null}
      </p>
      {roll ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div
            ref={chip}
            key={roll.n}
            data-testid="roll-moment"
            className="flex items-center gap-4 rounded-sheet bg-glass px-6 py-4 backdrop-blur-md motion-safe:animate-[roll-in_220ms_var(--ease-snap)]"
          >
            <Die value={roll.dice[0]} big />
            <Die value={roll.dice[1]} big />
            {/* Not cn: tailwind-merge reads text-display as a colour and would drop it beside the ink. */}
            <span data-testid="roll-sum" className={`text-display tabular-nums ${sum === 7 ? "text-accent-ink" : "text-fg"}`}>
              {sum}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
