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

// Approved Goods Card design (#772 / #773, docs/DECISIONS.md):
// Pale face at rest (#fff7e5), empty face (#f1ecdf).
// Soft outline and badge in good's color. Full color fill on gain (#acc6a4, #e5b39c, etc.).
// Count and name in high-contrast ink #27271f.
export const GOODS_EDGE: Record<Resource, string> = {
  timber: "#315c38",
  clay: "#89422f",
  wool: "#59613a",
  grain: "#765817",
  ore: "#47566b",
};

export const GOODS_GAIN_FILL: Record<Resource, string> = {
  timber: "#acc6a4",
  clay: "#e5b39c",
  wool: "#d3d9b3",
  grain: "#efd38a",
  ore: "#bdc9d5",
};

export const GOODS_REST_FILL = "#fff7e5";
export const GOODS_EMPTY_FILL = "#f1ecdf";
export const GOODS_INK = "#27271f";

const FLASH_MS = 2200;
const LIFT_DURATION_MS = 1850;
type ResourceFlash = { delta: number; id: number };

// The hand's counts are diffed on every state, so a gain flashes +N and a loss -N whether it
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

function ResourceCard({ resource, count, flash, offer, showRates, buildMode, owner }: { resource: Resource; count: number; flash?: ResourceFlash; offer?: number; buildMode: string; owner: string; showRates: (resource: Resource, card: HTMLElement) => void }) {
  const card = useRef<HTMLDivElement>(null);
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number }>({ x: 0, y: 0 });
  const cancelHold = () => {
    clearTimeout(hold.current.timer);
  };
  useEffect(() => cancelHold, [buildMode, owner]);
  const Icon = RESOURCE_ICON[resource];
  const label = flash ? (flash.delta > 0 ? `+${flash.delta}` : String(flash.delta)) : null;
  const isGained = Boolean(flash && flash.delta > 0);

  // #773: Gain lifts ~20px with +N badge above card; loss dips slightly with -N badge. Movement is transform-only.
  // Holds about 1.5s, settles within 2s. Reduced motion: no transform.
  useLayoutEffect(() => {
    if (!flash || !card.current) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    const keyframes =
      flash.delta > 0
        ? [
            { transform: "translateY(0)", offset: 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            { transform: "translateY(-20px)", offset: 0.1, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            { transform: "translateY(-20px)", offset: 0.8, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            { transform: "translateY(0)", offset: 1 },
          ]
        : [
            { transform: "translateY(0)", offset: 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            { transform: "translateY(3px)", offset: 0.15, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            { transform: "translateY(3px)", offset: 0.75, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            { transform: "translateY(0)", offset: 1 },
          ];

    const animation = card.current.animate(keyframes, { duration: LIFT_DURATION_MS });
    const stopMovement = () => {
      if (preference.matches) animation.cancel();
    };
    preference.addEventListener("change", stopMovement);
    return () => {
      animation.cancel();
      preference.removeEventListener("change", stopMovement);
    };
  }, [flash?.id]);

  const cardBg = isGained ? GOODS_GAIN_FILL[resource] : count === 0 ? GOODS_EMPTY_FILL : GOODS_REST_FILL;
  const cardBorderColor = isGained || count > 0 ? GOODS_EDGE[resource] : `${GOODS_EDGE[resource]}55`;

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
          "goods-card relative flex h-[62px] flex-col items-center justify-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg",
          "short:h-11 short:flex-row short:gap-2",
          count === 0 && "goods-empty",
        )}
        style={{
          backgroundColor: cardBg,
          borderColor: cardBorderColor,
          borderWidth: "1.5px",
          borderStyle: count === 0 && !isGained ? "dashed" : "solid",
          color: GOODS_INK,
          boxShadow: "var(--shadow-control)",
          transition: isGained ? "none" : "background-color 300ms ease-out, border-color 300ms ease-out",
        }}
      >
        <div className="goods-value flex items-center justify-center gap-1.5">
          <Icon
            className="goods-icon size-5"
            style={{ color: count === 0 && !isGained ? "var(--muted, #8c887b)" : GOODS_EDGE[resource] }}
            aria-hidden
          />
          <span
            data-testid="hand-count"
            className="text-number font-bold tabular-nums short:leading-7"
            style={{ color: GOODS_INK }}
          >
            {count}
          </span>
        </div>
        <span
          className="goods-label text-[11px] font-semibold leading-[14px] short:hidden"
          style={{ color: GOODS_INK }}
        >
          {RESOURCE_LABEL[resource]}
        </span>
        {flash ? (
          <span
            key={flash.id}
            data-testid="resource-flash"
            data-resource={resource}
            data-delta={label}
            className={cn(
              "hand-resource-flash pointer-events-none absolute left-1/2 -translate-x-1/2 z-20 flex items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums shadow-sm",
              flash.delta > 0 ? "goods-gain-badge" : "goods-loss-badge",
            )}
            style={{
              bottom: "calc(100% + 2px)",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: GOODS_REST_FILL,
              borderColor: flash.delta > 0 ? GOODS_EDGE[resource] : "var(--loss, #c84c32)",
              color: flash.delta > 0 ? GOODS_EDGE[resource] : "var(--loss, #c84c32)",
              borderWidth: "1.5px",
              borderStyle: "solid",
            }}
          >
            {label}
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
      <div className="goods-tray flex shrink-0 gap-1 overflow-visible rounded-chip p-2 short:p-1">
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
