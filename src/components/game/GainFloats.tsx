// Goods this seat gains or loses, said once in the middle of the island (Jarrod's playtest: "it should appear in middle of
// screen and fade away like green text and number"). One glass line per good, "+2 Timber" in green or "−1 Ore" in red, each
// rising a little and fading over FLOAT_MS, 150 ms apart; reduced motion fades without the rise. The hand's own +N flash
// (Hand.tsx) stays; this is the line you can read. Only this seat's hand is read, as the hand does: online the other seats
// arrive as a count, and a watcher has no hand, so no other seat's goods are ever shown. Spending on a build or a fortune is
// not a loss: the piece landing says it. A roll's goods wait for the roll moment to leave the centre (#440).
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { RESOURCE_ICON, RESOURCE_PAINT } from "@/components/game/Hand";
import { useMomentUp } from "@/components/game/Dice";
import { useStage } from "@/components/game/stage";
import { useGame } from "@/lib/game/store";
import { hiddenCount } from "@/lib/game/rules";
import { RESOURCES, RESOURCE_LABEL, type PlayerState, type Resource } from "@/lib/game/types";

const FLOAT_MS = 1800;
const STAGGER_MS = 150;
// The roll moment's hold and flight (Dice.tsx). A roll's goods wait for the moment to leave; if it has not come up by
// then, they go.
const ROLL_WAIT_MS = 1120;

// True while lines are on the island or a roll's are waiting to come up, so the turn moment waits for them.
export const useFloatsUp = create<{ up: boolean }>(() => ({ up: false }));

type Line = { key: number; batch: number; r: Resource; n: number; delay: number; end: number };

let next = 0;

export function GainFloats({ me, rolls }: { me: PlayerState; rolls: number }) {
  const [lines, setLines] = useState<Line[]>([]);
  const synced = useGame((s) => s.synced);
  const prev = useRef<{ me: PlayerState; rolls: number; synced: number } | null>(null);
  // What a roll's goods are waiting on (a timer and the moment's store), dropped on a hand-over or unmount.
  const waits = useRef(new Set<() => void>());
  const shown = useRef(false);
  const busy = () => useFloatsUp.setState({ up: shown.current || waits.current.size > 0 });
  const counts = RESOURCES.map((r) => me.resources[r]).join(",");
  const dropWaits = () => {
    waits.current.forEach((stop) => stop());
    waits.current.clear();
    busy();
  };

  useEffect(() => {
    const was = prev.current;
    prev.current = { me, rolls, synced };
    if (!was) return;
    // A welcome's first state (a rejoin after a drop) is a new baseline: nothing in it is news, and goods still on their way
    // from before the drop are dropped.
    if (was.synced !== synced) {
      dropWaits();
      return setLines([]);
    }
    // A hotseat hand-over: the next seat's hand is a new baseline, and the last seat's goods leave with it.
    if (was.me.id !== me.id) {
      dropWaits();
      return setLines([]);
    }
    const spent =
      me.pathsLeft < was.me.pathsLeft ||
      me.outpostsLeft < was.me.outpostsLeft ||
      me.strongholdsLeft < was.me.strongholdsLeft ||
      hiddenCount(me) > hiddenCount(was.me);
    const deltas = RESOURCES.map((r) => ({ r, n: me.resources[r] - was.me.resources[r] })).filter((d) => d.n > 0 || (d.n < 0 && !spent));
    if (!deltas.length) return;
    // New goods join the lines still showing; once every line has faded they start a batch of their own.
    const show = () => {
      shown.current = true;
      const now = Date.now();
      const batch = next;
      setLines((cur) => [
        ...(cur.some((l) => l.end > now) ? cur : []),
        ...deltas.map((d, i) => ({ key: next++, batch, ...d, delay: i * STAGGER_MS, end: now + i * STAGGER_MS + FLOAT_MS })),
      ]);
    };
    if (rolls !== was.rolls + 1) return show();
    // A roll: wait for its moment to leave, held or skipped.
    const unsub = useMomentUp.subscribe((s, p) => {
      if (p.up && !s.up) go();
    });
    const t = setTimeout(() => useMomentUp.getState().up || go(), ROLL_WAIT_MS);
    const stop = () => {
      unsub();
      clearTimeout(t);
      waits.current.delete(stop);
      busy();
    };
    const go = () => {
      show();
      stop();
    };
    waits.current.add(stop);
    busy();
  }, [me.id, counts, rolls, synced]);

  // The batch stays mounted until its last line has faded, so a finished line never moves the ones still rising.
  const last = lines.at(-1)?.key;
  const first = lines[0];
  const [stage, { dy, how }] = useStage<HTMLDivElement>(`${first?.key}|${last}`);
  // No room for them all (a short phone): an older batch's lines give way to the newest, never the newest's own.
  useEffect(() => {
    if (how === "crowded" && first && first.batch !== lines.at(-1)!.batch) setLines((l) => l.slice(1));
  }, [how, first]);
  useEffect(() => {
    shown.current = lines.length > 0;
    busy();
    if (last === undefined) return;
    const t = setTimeout(() => setLines([]), Math.max(...lines.map((l) => l.delay)) + FLOAT_MS);
    return () => clearTimeout(t);
  }, [last]);

  useEffect(
    () => () => {
      dropWaits();
      useFloatsUp.setState({ up: false });
    },
    [],
  );

  if (!lines.length) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="gain-floats"
      className="pointer-events-none absolute z-30 flex items-center justify-center"
      style={{ top: "var(--hole-top, 0px)", right: "var(--hole-right, 0px)", bottom: "var(--hole-bottom, 0px)", left: "var(--hole-left, 0px)" }}
    >
      <div ref={stage} data-shift={dy} data-stage={how} className="flex flex-col items-center gap-2" style={{ translate: `0 ${dy}px` }}>
        {lines.map(({ key, r, n, delay }) => {
          const Icon = RESOURCE_ICON[r];
          return (
            <p
              key={key}
              data-testid="gain-float"
              data-resource={r}
              data-delta={n}
              className={`flex items-center gap-2 rounded-chip bg-glass py-1 pl-1 pr-3 text-title tabular-nums backdrop-blur-md motion-safe:animate-[gain-float_1800ms_linear_both] motion-reduce:animate-[moment-fade_1800ms_linear_both] ${n > 0 ? "text-gain" : "text-loss"}`}
              style={{ animationDelay: `${delay}ms` }}
            >
              <span className={`grid size-7 place-items-center rounded-full ring-1 ring-inset ring-black/10 ${RESOURCE_PAINT[r]}`}>
                <Icon className="size-4" />
              </span>
              {`${n > 0 ? "+" : "−"}${Math.abs(n)} ${RESOURCE_LABEL[r]}`}
            </p>
          );
        })}
      </div>
    </div>
  );
}
