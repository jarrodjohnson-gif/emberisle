import { useGame } from "@/lib/game/store";
import { RESOURCE_LABEL } from "@/lib/game/types";
import type { OwnedDockPosition } from "@/lib/scene/isle-renderer";

export default function OwnedDockLabels({ docks }: { docks: readonly OwnedDockPosition[] }) {
  const owner = useGame((s) => s.screen === "play" && !s.spectator ? (s.mode === "hotseat" ? s.state?.current : s.localId) : null);
  return <div data-board-overlay className="pointer-events-none fixed inset-0">
    {docks.filter((d) => d.owner === owner).map((d) => <div
      key={d.id}
      data-testid="owned-dock-label"
      data-vertex-id={d.id}
      data-harbor={d.kind}
      data-owner-id={d.owner}
      className="pointer-events-none absolute -mt-3 whitespace-nowrap rounded-control border border-line bg-surface px-2 py-1 text-[12px] font-semibold leading-4 text-fg shadow-sm"
      style={{ left: d.x, top: d.y, translate: `clamp(calc(8px - ${d.x}px), -50%, calc(100vw - 8px - ${d.x}px - 100%)) -100%` }}
    >{d.kind === "any" ? "Your 3:1 dock" : `Your 2:1 ${RESOURCE_LABEL[d.kind].toLowerCase()} dock`}</div>)}
  </div>;
}
