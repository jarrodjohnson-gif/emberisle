import { useGame } from "@/lib/game/store";
import { RESOURCE_LABEL } from "@/lib/game/types";
import type { OwnedDockPosition } from "@/lib/scene/isle-renderer";

// #560. Owner 2026-11-03 (q881-all-docks): tags are much smaller and stay inside the board hole.
// Visible text is "3:1" or "2:1 brick". 12 px is the smallest law 9 allows, so the shrink is the shorter
// words, no shadow and no vertical padding. A dock you control gets a 2 px inset ring in the seat colour,
// not the word "Your". The accessible name still says "any" and "Yours". The sails carry no rate.
const spoken = (d: OwnedDockPosition) =>
  d.kind === "any" ? "3:1 any" : `2:1 ${RESOURCE_LABEL[d.kind].toLowerCase()}`;

export default function OwnedDockLabels({ docks }: { docks: readonly OwnedDockPosition[] }) {
  const owner = useGame((s) => s.screen === "play" && !s.spectator ? (s.mode === "hotseat" ? s.state?.current : s.localId) : null);
  const seats = useGame((s) => s.state?.players);
  return <div data-board-overlay className="pointer-events-none fixed inset-0">
    {docks.map((d) => {
      const mine = d.owner !== null && d.owner === owner;
      const words = spoken(d);
      const color = mine ? seats?.find((p) => p.id === d.owner)?.color : undefined;
      const good = d.kind === "any" ? null : d.kind;
      return <div
        key={d.id}
        data-testid="owned-dock-label"
        data-vertex-id={d.id}
        data-harbor={d.kind}
        data-owner-id={d.owner ?? ""}
        data-ring={color ?? ""}
        data-rate={d.kind === "any" ? "3:1" : "2:1"}
        role="img"
        aria-label={mine ? `Yours, ${words}` : words}
        className={"pointer-events-none absolute whitespace-nowrap rounded-control border border-line px-1 py-0 text-[12px] font-semibold leading-none" + (good ? "" : " bg-raised text-fg")}
        style={{
          left: d.x,
          top: d.y,
          translate: "-50% -50%",
          ...(good ? { background: `var(--${good})`, color: `var(--${good}-on)` } : {}),
          ...(color ? { boxShadow: `inset 0 0 0 2px ${color}` } : {}),
        }}
      >{d.kind === "any" ? "3:1" : words}</div>;
    })}
  </div>;
}
