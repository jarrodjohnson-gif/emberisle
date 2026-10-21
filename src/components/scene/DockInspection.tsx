import { useEffect, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useGame } from "@/lib/game/store";
import { RESOURCE_LABEL, type HarborKind } from "@/lib/game/types";
import { RESOURCE_ICON } from "@/components/game/ResourceSymbols";

export type DockTarget = { id: string; kind: HarborKind; x: number; y: number };

type Props = { docks: DockTarget[]; selected: string | null; setSelected: Dispatch<SetStateAction<string | null>> };

export default function DockInspection({ docks, selected, setSelected }: Props) {
  const inspect = useGame((s) => s.screen === "play" && s.buildMode === "none" && !!s.state && ["roll", "main", "over"].includes(s.state.phase));
  const dock = inspect ? docks.find((d) => d.id === selected) : undefined;
  const Icon = dock && dock.kind !== "any" ? RESOURCE_ICON[dock.kind] : null;

  useEffect(() => {
    if (!inspect) setSelected(null);
  }, [inspect, setSelected]);

  useEffect(() => {
    if (!selected) return;
    const dismiss = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-dock-inspection]")) setSelected(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [selected, setSelected]);

  return <>
    {inspect ? <div data-board-overlay className="pointer-events-none fixed inset-0">
      {docks.map((d) => <button
        key={d.id}
        type="button"
        data-dock-inspection
        data-testid="dock-rate-target"
        data-kind={d.kind}
        data-dock={d.id}
        aria-label={d.kind === "any" ? "Inspect 3:1 any goods dock" : `Inspect 2:1 ${RESOURCE_LABEL[d.kind].toLowerCase()} dock`}
        aria-expanded={selected === d.id}
        onClick={() => setSelected((s) => s === d.id ? null : d.id)}
        className="pointer-events-none absolute size-11 rounded-full border border-transparent bg-transparent opacity-0 focus-visible:border-fg focus-visible:opacity-100 focus-visible:outline-none"
        style={{ left: d.x - 22, top: d.y - 22 }}
      />)}
      {dock ? createPortal(<div
        data-dock-inspection
        data-testid="dock-rate-label"
        role="status"
        className="pointer-events-none fixed z-50 flex items-center gap-2 whitespace-nowrap rounded-control border border-line bg-surface px-3 py-2 text-[16px] font-semibold text-fg shadow-lg"
        style={{ left: Math.max(12, Math.min(innerWidth - 210, dock.x - 90)), top: Math.max(12, Math.min(innerHeight - 54, dock.y - 64)) }}
      >
        {Icon ? <Icon className="size-5" aria-hidden /> : <span aria-hidden>⚓</span>}
        {dock.kind === "any" ? "3:1 any goods" : `2:1 ${RESOURCE_LABEL[dock.kind].toLowerCase()}`}
      </div>, document.body) : null}
    </div> : null}
  </>;
}
