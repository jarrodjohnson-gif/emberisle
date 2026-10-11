import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BrickWall, Cloud, Mountain, Trees, Wheat } from "lucide-react";
import { RESOURCES, RESOURCE_LABEL, type Phase, type PlayerState, type Resource } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useGame } from "@/lib/game/store";
import "./hand-motion.css";

export const RESOURCE_ICON: Record<Resource, typeof Trees> = {
  timber: Trees,
  clay: BrickWall,
  wool: Cloud,
  grain: Wheat,
  ore: Mountain,
};

// Each card is the terrain cap's colour (docs/design/polish.md, #436); full class names so Tailwind can see them.
export const RESOURCE_PAINT: Record<Resource, string> = {
  timber: "bg-timber text-timber-on",
  clay: "bg-clay text-clay-on",
  wool: "bg-wool text-wool-on",
  grain: "bg-grain text-grain-on",
  ore: "bg-ore text-ore-on",
};

const FLASH_MS = 1200;
const SETTLE_MS = 280;
type ResourceFlash = { delta: number; id: number };

// The hand's counts are diffed on every state, so a gain flashes +N green and a loss -N red whether it
// came from a roll, a trade, a build, a discard, or a steal, hotseat and online alike (#170). Only this
// hand is read: online, the other players arrive as a `goods` count with no `resources`. A change of
// seat (hotseat) or a reconnect's first synced state resets the baseline instead of flashing.
function useResourceFlashes(me: PlayerState) {
  const synced = useGame((s) => s.synced);
  const [flashes, setFlashes] = useState<Partial<Record<Resource, ResourceFlash>>>({});
  const prev = useRef<{ id: string; resources: Record<Resource, number>; synced: number } | null>(null);
  const nextFlash = useRef(0);
  const timers = useRef<Partial<Record<Resource, { flash: ResourceFlash; timer: ReturnType<typeof setTimeout> }>>>({});
  const counts = RESOURCES.map((r) => me.resources[r]).join(",");
  // Hide the previous hand's cues in this commit, before layout effects cancel its movement.
  const visibleFlashes: Partial<Record<Resource, ResourceFlash>> = prev.current?.id === me.id && prev.current.synced === synced ? flashes : {};
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = { id: me.id, resources: { ...me.resources }, synced };
    if (!was) return;
    if (was.id !== me.id || was.synced !== synced) {
      Object.values(timers.current).forEach((t) => clearTimeout(t.timer));
      timers.current = {};
      setFlashes({});
      return;
    }
    const changes: Partial<Record<Resource, ResourceFlash>> = {};
    for (const r of RESOURCES) {
      const delta = me.resources[r] - was.resources[r];
      if (delta) changes[r] = { delta, id: nextFlash.current++ };
    }
    if (Object.keys(changes).length) setFlashes((f) => ({ ...f, ...changes }));
  }, [me.id, counts, synced]);
  // The label's clock starts once it is on the page. The render that mounts it is a separate task, which
  // on a slow machine can wait behind an island frame longer than FLASH_MS; a timer started with the count
  // change would then be due before the label existed (#248).
  useEffect(() => {
    for (const r of RESOURCES) {
      const flash = visibleFlashes[r];
      const cur = timers.current[r];
      if (!flash) {
        if (cur) clearTimeout(cur.timer);
        delete timers.current[r];
        continue;
      }
      if (cur?.flash === flash) continue;
      if (cur) clearTimeout(cur.timer);
      timers.current[r] = {
        flash,
        timer: setTimeout(() => {
          delete timers.current[r];
          setFlashes((f) => {
            if (f[r] !== flash) return f;
            const next = { ...f };
            delete next[r];
            return next;
          });
        }, FLASH_MS),
      };
    }
  }, [visibleFlashes]);
  useEffect(
    () => () => {
      Object.values(timers.current).forEach((t) => clearTimeout(t.timer));
      timers.current = {};
    },
    [],
  );
  return visibleFlashes;
}

function ResourceCard({ resource, count, flash }: { resource: Resource; count: number; flash?: ResourceFlash }) {
  const card = useRef<HTMLDivElement>(null);
  const Icon = RESOURCE_ICON[resource];
  const label = flash ? (flash.delta > 0 ? `+${flash.delta}` : String(flash.delta)) : null;
  // Restart on the event ID, even for two gains in the same millisecond. The card itself stays mounted,
  // preserving its footprint and future focus/long-press state; only the decorative cues are keyed.
  useLayoutEffect(() => {
    if (!flash || !card.current) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const animation = preference.matches
      ? null
      : card.current.animate(
          [
            { transform: "translateY(0)", offset: 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            { transform: `translateY(${flash.delta > 0 ? -3 : 2}px)`, offset: 0.25, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            { transform: "translateY(0)", offset: 1 },
          ],
          { duration: SETTLE_MS },
        );
    const stopMovement = () => {
      if (preference.matches) animation?.cancel();
    };
    preference.addEventListener("change", stopMovement);
    return () => {
      animation?.cancel();
      preference.removeEventListener("change", stopMovement);
    };
  }, [flash?.id]);
  return (
    <div className="hand-resource-card-slot relative min-w-[3.5rem] flex-1">
      <div
        ref={card}
        data-testid={`resource-${resource}`}
        title={RESOURCE_LABEL[resource]}
        className={cn(
          "relative flex flex-col items-center gap-1 rounded-chip px-2 py-2 ring-1 ring-inset ring-black/10 transition-opacity duration-base",
          "short:h-11 short:flex-row short:justify-center short:py-0",
          RESOURCE_PAINT[resource],
          count === 0 && "opacity-40",
        )}
      >
        <Icon className="size-4 opacity-70 short:translate-y-1" aria-hidden />
        <span data-testid="hand-count" className="text-number tabular-nums short:translate-y-2 short:leading-7">
          {count}
        </span>
        <span className="sr-only">{RESOURCE_LABEL[resource]}</span>
        {flash ? (
          <span
            key={`ring-${flash.id}`}
            data-testid="hand-ring"
            aria-hidden
            className="pointer-events-none absolute inset-[2px] rounded-chip"
            style={{ animation: `resource-ring ${FLASH_MS}ms ease-out forwards` }}
          />
        ) : null}
      </div>
      {flash ? (
        <span
          key={flash.id}
          data-testid="resource-flash"
          data-resource={resource}
          data-delta={label}
          className={cn(
            "hand-resource-flash pointer-events-none absolute right-1 top-1 rounded-control bg-surface px-1 text-sm font-semibold tabular-nums short:left-1 short:right-auto short:top-0 short:text-caption short:leading-3",
            flash.delta > 0 ? "text-gain" : "text-loss",
          )}
          style={{ animation: `resource-flash ${FLASH_MS}ms ease-out forwards` }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

function ResourceHand({ me, flashes }: { me: PlayerState; flashes: ReturnType<typeof useResourceFlashes> }) {
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto rounded-[20px] border border-white/50 bg-glass p-2 backdrop-blur-md short:p-1">
      {RESOURCES.map((r) => (
        <ResourceCard key={r} resource={r} count={me.resources[r]} flash={flashes[r]} />
      ))}
    </div>
  );
}

// #439: the hand is not on the table through the roll-off and setup until the seat holds a good. After that it is always
// there, so spending down to 0 or a robber does not make it come and go. A pure rule of the state: goods cannot go down in
// setup, so "holds a good" is as good as "has held one", and a reload, a rejoin or a rematch needs no reset. Online `me` is
// the local seat; in hotseat it is the seat on turn.
//
// It is mounted at its full height in the same commit as the state change that brings it, so the renderer's next-frame
// refit measures the hole with the hand in it; the motion is opacity and translateY only (docs/design/polish.md: never
// animate layout). A hand that goes away (a hotseat seat that has held nothing takes the turn) is removed at once for the
// same reason: nothing refits when an animation ends.
export function HandDock({ me, phase }: { me: PlayerState; phase: Phase }) {
  // Read here, not in the hand, so the +N that brings the first good in is not lost to the hand mounting after the change.
  const flashes = useResourceFlashes(me);
  const hasGoods = RESOURCES.some((r) => me.resources[r] > 0);
  const show = hasGoods || !["rollOff", "setupSettle", "setupRoad"].includes(phase);
  const [shown, setShown] = useState(show);
  const [rising, setRising] = useState(false);
  if (show !== shown) {
    setShown(show);
    setRising(show);
  }
  if (!show) return null;
  return (
    <div
      data-testid="hand-dock"
      data-rising={rising || undefined}
      className={cn("shrink-0", rising && "hand-in")}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setRising(false);
      }}
    >
      <ResourceHand me={me} flashes={flashes} />
    </div>
  );
}
