import { useGame } from "@/lib/game/store";
import { RESOURCE_LABEL } from "@/lib/game/types";
import type { OwnedDockPosition } from "@/lib/scene/isle-renderer";

// #560. Owner 2026-11-03: every dock is tagged on the pier, and the words name the trade.
// A dock you control starts with "Your". Owner 2026-10-16: the sails carry no rate.
const trade = (d: OwnedDockPosition) =>
  d.kind === "any" ? "3:1 any" : `2:1 ${RESOURCE_LABEL[d.kind].toLowerCase()}`;

export default function OwnedDockLabels({ docks }: { docks: readonly OwnedDockPosition[] }) {
  const owner = useGame((s) => s.screen === "play" && !s.spectator ? (s.mode === "hotseat" ? s.state?.current : s.localId) : null);
  return <div data-board-overlay className="pointer-events-none fixed inset-0">
    {docks.map((d) => {
      const mine = d.owner !== null && d.owner === owner;
      const line = mine ? `Your ${trade(d)}` : trade(d);
      const good = d.kind === "any" ? null : d.kind;
      return <div
        key={d.id}
        data-testid="owned-dock-label"
        data-vertex-id={d.id}
        data-harbor={d.kind}
        data-owner-id={d.owner ?? ""}
        data-rate={d.kind === "any" ? "3:1" : "2:1"}
        role="img"
        aria-label={line}
        className={"pointer-events-none absolute whitespace-nowrap rounded-control border border-line px-1 py-0.5 text-[12px] font-semibold leading-none shadow-sm" + (good ? "" : " bg-raised text-fg")}
        style={{
          left: d.x,
          top: d.y,
          // Keep the chip on the dock, and 8 px inside the screen edges.
          translate: `clamp(calc(8px - ${d.x}px), -50%, calc(100vw - 8px - ${d.x}px - 100%)) -50%`,
          ...(good ? { background: `var(--${good})`, color: `var(--${good}-on)` } : {}),
        }}
      >{line}</div>;
    })}
  </div>;
}
