import { useEffect, useRef, useState } from "react";
import { BrickWall, Cloud, Mountain, Trees, Wheat } from "lucide-react";
import { RESOURCES, RESOURCE_LABEL, type PlayerState, type Resource } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const ICONS: Record<Resource, typeof Trees> = {
  timber: Trees,
  clay: BrickWall,
  wool: Cloud,
  grain: Wheat,
  ore: Mountain,
};

// Each card is the terrain cap's colour (docs/design/polish.md, #436); full class names so Tailwind can see them.
const PAINT: Record<Resource, string> = {
  timber: "bg-timber text-timber-on",
  clay: "bg-clay text-clay-on",
  wool: "bg-wool text-wool-on",
  grain: "bg-grain text-grain-on",
  ore: "bg-ore text-ore-on",
};

const FLASH_MS = 1200;

// The hand's counts are diffed on every state, so a gain flashes +N green and a loss -N red whether it
// came from a roll, a trade, a build, a discard, or a steal, hotseat and online alike (#170). Only this
// hand is read: online, the other players arrive as a `goods` count with no `resources`. A change of
// seat (hotseat) resets the baseline instead of flashing.
function useResourceFlashes(me: PlayerState) {
  type Flash = { delta: number; at: number };
  const [flashes, setFlashes] = useState<Partial<Record<Resource, Flash>>>({});
  const prev = useRef<{ id: string; resources: Record<Resource, number> } | null>(null);
  const timers = useRef<Partial<Record<Resource, { flash: Flash; timer: ReturnType<typeof setTimeout> }>>>({});
  const counts = RESOURCES.map((r) => me.resources[r]).join(",");
  useEffect(() => {
    const was = prev.current;
    prev.current = { id: me.id, resources: me.resources };
    if (!was) return;
    if (was.id !== me.id) {
      Object.values(timers.current).forEach((t) => clearTimeout(t.timer));
      timers.current = {};
      setFlashes({});
      return;
    }
    for (const r of RESOURCES) {
      const delta = me.resources[r] - was.resources[r];
      if (delta) setFlashes((f) => ({ ...f, [r]: { delta, at: Date.now() } }));
    }
  }, [me.id, counts]);
  // The label's clock starts once it is on the page. The render that mounts it is a separate task, which
  // on a slow machine can wait behind an island frame longer than FLASH_MS; a timer started with the count
  // change would then be due before the label existed (#248).
  useEffect(() => {
    for (const r of RESOURCES) {
      const flash = flashes[r];
      const cur = timers.current[r];
      if (!flash || cur?.flash === flash) continue;
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
  }, [flashes]);
  useEffect(
    () => () => {
      Object.values(timers.current).forEach((t) => clearTimeout(t.timer));
      timers.current = {};
    },
    [],
  );
  return flashes;
}

export function ResourceHand({ me }: { me: PlayerState }) {
  const flashes = useResourceFlashes(me);
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto rounded-[20px] border border-white/50 bg-glass p-2 backdrop-blur-md short:p-1">
      {RESOURCES.map((r) => {
        const Icon = ICONS[r];
        const flash = flashes[r];
        const label = flash ? (flash.delta > 0 ? `+${flash.delta}` : String(flash.delta)) : null;
        const count = me.resources[r];
        return (
          <div
            key={r}
            data-testid={`resource-${r}`}
            title={RESOURCE_LABEL[r]}
            className={cn(
              "relative flex min-w-[3.5rem] flex-1 flex-col items-center gap-1 rounded-chip px-2 py-2 ring-1 ring-inset ring-black/10 transition-opacity duration-base",
              "short:h-11 short:flex-row short:justify-center short:py-0",
              PAINT[r],
              count === 0 && "opacity-40",
            )}
          >
            <Icon className="size-4 opacity-70" aria-hidden />
            <span data-testid="hand-count" className="text-number tabular-nums">
              {count}
            </span>
            <span className="sr-only">{RESOURCE_LABEL[r]}</span>
            {flash ? (
              <>
                <span
                  key={`ring-${flash.at}`}
                  data-testid="hand-ring"
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-chip"
                  style={{ animation: `resource-ring ${FLASH_MS}ms ease-out forwards` }}
                />
                <span
                  key={flash.at}
                  data-testid="resource-flash"
                  data-resource={r}
                  data-delta={label}
                  className="pointer-events-none absolute right-1 top-1 text-sm font-semibold tabular-nums"
                  style={{ animation: `resource-flash ${FLASH_MS}ms ease-out forwards` }}
                >
                  {label}
                </span>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
