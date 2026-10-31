import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RESOURCE_ICON } from "@/components/game/ResourceSymbols";
import { RESOURCES, RESOURCE_LABEL, type Phase, type PlayerState, type Resource } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useGame } from "@/lib/game/store";
import { chunk, LazyBoundary } from "@/lib/lazy";
const HandRates = chunk(() => import("./HandRates")).pick((m) => m.default);
import "./hand-motion.css";

export { RESOURCE_ICON } from "@/components/game/ResourceSymbols";

// Each card is the terrain cap's colour (docs/design/polish.md, #436); full class names so Tailwind can see them.
export const RESOURCE_PAINT: Record<Resource, string> = {
  timber: "bg-timber text-timber-on",
  clay: "bg-clay text-clay-on",
  wool: "bg-wool text-wool-on",
  grain: "bg-grain text-grain-on",
  ore: "bg-ore text-ore-on",
};

// A gain or loss cue holds for FLASH_MS, then fades over FADE_MS (#773, docs/design/goods-cards-v1). The CSS keyframes in
// hand-motion.css run for the same CUE_MS.
const FLASH_MS = 2200;
const FADE_MS = 300;
const CUE_MS = FLASH_MS + FADE_MS;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
type ResourceFlash = { delta: number; id: number };

// The hand's counts are diffed on every state, so a gain fills its card with +N and a loss rings it with −N whether it
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
        }, CUE_MS),
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

// While an offer is open for this seat, the goods it would move: negative for what the seat gives, positive for what it
// gets (#820). The asker gives `give`; everyone else gives `want`. Answering it, or its closing, clears the lot.
function useOfferDeltas(me: PlayerState) {
  const offer = useGame((s) => s.offer);
  const answered = useGame((s) => s.declined.includes(me.id));
  const deltas: Partial<Record<Resource, number>> = {};
  if (!offer || answered) return deltas;
  const [gives, gets] = offer.from === me.id ? [offer.give, offer.want] : [offer.want, offer.give];
  for (const r of RESOURCES) {
    if (gives[r]) deltas[r] = -gives[r]!;
    else if (gets[r]) deltas[r] = gets[r];
  }
  return deltas;
}

// The card's face: the symbol, the count and the name on one axis. The lit copy a gain lays over it has no test IDs.
function Face({ resource, count, lit }: { resource: Resource; count: number; lit?: boolean }) {
  const Icon = RESOURCE_ICON[resource];
  return (
    <>
      <Icon className="goods-icon" aria-hidden />
      <span data-testid={lit ? undefined : "hand-count"} className="goods-count">
        {count}
      </span>
      <span data-testid={lit ? undefined : "hand-name"} className="goods-label">
        {RESOURCE_LABEL[resource]}
      </span>
    </>
  );
}

function ResourceCard({ resource, count, flash, offer, showRates, buildMode, owner }: { resource: Resource; count: number; flash?: ResourceFlash; offer?: number; buildMode: string; owner: string; showRates: (resource: Resource, card: HTMLElement) => void }) {
  const card = useRef<HTMLDivElement>(null);
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number }>({ x: 0, y: 0 });
  const cancelHold = () => {
    clearTimeout(hold.current.timer);
  };
  useEffect(() => cancelHold, [buildMode, owner]);
  const gain = !!flash && flash.delta > 0;
  const label = flash ? (gain ? `+${flash.delta}` : String(flash.delta)) : null;
  // Restart on the event ID, even for two gains in the same millisecond. The card itself stays mounted,
  // preserving its footprint and future focus/long-press state; only the decorative cues are keyed.
  // A gain lifts the card by the tray's --goods-lift (hand-motion.css: 6 px, less where the tray has less room) and a
  // loss dips it 2 px, for as long as the fill holds; both settle as it fades.
  useLayoutEffect(() => {
    if (!flash || !card.current) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    // 0 is a real value (a short wide window has no room to lift); only a missing property falls back to 6 px.
    const lift = parseFloat(getComputedStyle(card.current).getPropertyValue("--goods-lift"));
    const y = flash.delta > 0 ? -(Number.isNaN(lift) ? 6 : lift) : 2;
    const animation = preference.matches
      ? null
      : card.current.animate(
          [
            { transform: "translateY(0)", offset: 0, easing: EASE_OUT },
            { transform: `translateY(${y}px)`, offset: 120 / CUE_MS },
            { transform: `translateY(${y}px)`, offset: FLASH_MS / CUE_MS, easing: EASE_OUT },
            { transform: "translateY(0)", offset: 1 },
          ],
          { duration: CUE_MS },
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
    <div
      data-testid={`offer-slot-${resource}`}
      data-offer={offer ? (offer < 0 ? "give" : "get") : undefined}
      className="hand-resource-card-slot relative min-w-0 flex-1"
    >
      <div
        ref={card}
        data-testid={`resource-${resource}`}
        title={RESOURCE_LABEL[resource]}
        role="button"
        tabIndex={0}
        aria-label={`${RESOURCE_LABEL[resource]}: ${count}. Show trade rates`}
        onClick={(e) => {
          // Assistive activation synthesizes a click; pointer taps keep the long-press gesture.
          if (e.detail === 0) showRates(resource, e.currentTarget);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelHold();
          showRates(resource, e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          showRates(resource, e.currentTarget);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          cancelHold();
          hold.current.x = e.clientX;
          hold.current.y = e.clientY;
          const target = e.currentTarget;
          hold.current.timer = setTimeout(() => showRates(resource, target), 500);
        }}
        onPointerMove={(e) => {
          if (Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) cancelHold();
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        className={cn(
          `goods-card goods-${resource} relative h-[62px] rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg short:h-11`,
          count === 0 && "goods-empty",
        )}
      >
        <Face resource={resource} count={count} />
        {flash ? (
          gain ? (
            <span key={`lit-${flash.id}`} data-testid="goods-lit" aria-hidden className="goods-lit">
              <Face resource={resource} count={count} lit />
            </span>
          ) : (
            <span key={`lost-${flash.id}`} data-testid="goods-lost" aria-hidden className="goods-lost" />
          )
        ) : null}
        {flash ? (
          <span key={flash.id} data-testid="resource-flash" data-resource={resource} data-delta={label} data-sign={gain ? "+" : "-"} aria-hidden className="goods-tab">
            {gain ? label : `−${-flash.delta}`}
          </span>
        ) : null}
      </div>
      {offer ? (
        <span
          data-testid="offer-delta"
          aria-hidden
          className={cn(
            "hand-offer-delta pointer-events-none absolute left-0.5 top-0.5 rounded-control bg-surface px-1 text-caption font-semibold tabular-nums short:left-auto short:right-1 short:top-0 short:leading-3",
            offer > 0 ? "text-gain" : "text-loss",
            // The compact card has room for one label: the edge and lift still show while a gain/loss flash holds it.
            flash && "short:hidden",
          )}
        >
          {offer > 0 ? `+${offer}` : String(offer)}
        </span>
      ) : null}
    </div>
  );
}

function ResourceHand({ me, flashes }: { me: PlayerState; flashes: ReturnType<typeof useResourceFlashes> }) {
  const offer = useOfferDeltas(me);
  const buildMode = useGame((s) => s.buildMode);
  const [hint, setHint] = useState<{ resource: Resource; top: number; key: number; owner: string } | null>(null);
  const showRates = (resource: Resource, card: HTMLElement) => {
    if (useGame.getState().buildMode === "none") setHint({ resource, owner: me.id, key: performance.now(), top: card.getBoundingClientRect().top });
  };
  useEffect(() => setHint(null), [buildMode, me.id]);
  return (
    <>
      {/* Not a scroller: the five cards always fit, and a scroller would clip the +N tab and the lift at its edge. */}
      <div className="goods-tray flex shrink-0 gap-1 rounded-chip p-2 short:p-1">
        {RESOURCES.map((r) => (
          <ResourceCard key={r} resource={r} count={me.resources[r]} flash={flashes[r]} offer={offer[r]} showRates={showRates} buildMode={buildMode} owner={me.id} />
        ))}
      </div>
      {hint && hint.owner === me.id && buildMode === "none" ? <LazyBoundary key={hint.key} failed={null}>
        <HandRates owner={me.id} hint={hint} onClose={() => setHint(null)} />
      </LazyBoundary> : null}
    </>
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
  useLayoutEffect(() => {
    if (!rising) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => { if (preference.matches) setRising(false); };
    settle();
    preference.addEventListener("change", settle);
    return () => preference.removeEventListener("change", settle);
  }, [rising]);
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
