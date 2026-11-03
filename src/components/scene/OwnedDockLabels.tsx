import { useGame } from "@/lib/game/store";
import { RESOURCE_LABEL } from "@/lib/game/types";
import type { OwnedDockPosition } from "@/lib/scene/isle-renderer";

// #560, owner 2026-10-19: no sentence on the board. A rate chip sits on the building.
// The full words stay here as the accessible name, and in the dock inspection.
const phrase = (d: OwnedDockPosition) =>
  d.kind === "any" ? "Your 3:1 dock" : `Your 2:1 ${RESOURCE_LABEL[d.kind].toLowerCase()} dock`;

export default function OwnedDockLabels({ docks }: { docks: readonly OwnedDockPosition[] }) {
  const owner = useGame((s) => s.screen === "play" && !s.spectator ? (s.mode === "hotseat" ? s.state?.current : s.localId) : null);
  return <div data-board-overlay className="pointer-events-none fixed inset-0">
    {docks.filter((d) => d.owner === owner).map((d) => {
      const rate = d.kind === "any" ? "3:1" : "2:1";
      const good = d.kind === "any" ? null : d.kind;
      return <div
        key={d.id}
        data-testid="owned-dock-label"
        data-vertex-id={d.id}
        data-harbor={d.kind}
        data-owner-id={d.owner}
        data-rate={rate}
        aria-label={phrase(d)}
        className={"pointer-events-none absolute whitespace-nowrap rounded-control border border-line px-1 py-0.5 text-[10px] font-semibold leading-none shadow-sm" + (good ? "" : " bg-surface text-fg")}
        style={{
          left: d.x,
          top: d.y,
          // Keep the chip on the building, and 8 px inside the screen edges.
          translate: `clamp(calc(8px - ${d.x}px), -50%, calc(100vw - 8px - ${d.x}px - 100%)) -50%`,
          ...(good ? { background: `var(--${good})`, color: `var(--${good}-on)` } : {}),
        }}
      >{rate}</div>;
    })}
  </div>;
}
