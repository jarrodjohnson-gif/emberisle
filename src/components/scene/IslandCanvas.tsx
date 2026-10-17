import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IsleRenderer } from "@/lib/scene/isle-renderer";
import { useGame } from "@/lib/game/store";
import { demoBoard } from "@/lib/game/board";
import { RESOURCE_LABEL, type GameState, type HarborKind } from "@/lib/game/types";
import { RESOURCE_ICON } from "@/components/game/ResourceSymbols";

// One dealt island for the life of the page, shown behind the title and the lobby. It is never in the store.
let demo: GameState | null = null;
type DockTarget = { id: string; kind: HarborKind; x: number; y: number };

export default function IslandCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [docks, setDocks] = useState<DockTarget[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const inspect = useGame((s) => s.screen === "play" && s.buildMode === "none" && !!s.state && ["roll", "main", "over"].includes(s.state.phase));
  const dock = inspect ? docks.find((d) => d.id === selected) : undefined;
  const Icon = dock && dock.kind !== "any" ? RESOURCE_ICON[dock.kind] : null;

  useEffect(() => {
    if (!inspect) setSelected(null);
  }, [inspect]);

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
  }, [selected]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = new IsleRenderer(
      canvas,
      (kind, id) => {
        const g = useGame.getState();
        g.setPendingPlace(null);
        if (kind === "hex") g.pickHex(id);
        if (kind === "vertex") g.pickVertex(id);
        if (kind === "edge") g.pickEdge(id);
      },
      (sel) => useGame.getState().setPendingPlace(sel),
    );
    renderer.onDocks = setDocks;
    renderer.onDock = (id) => {
      const s = useGame.getState();
      if (s.screen !== "play" || s.buildMode !== "none" || !s.state || !["roll", "main", "over"].includes(s.state.phase)) return false;
      setSelected((selected) => selected === id ? null : id);
      return true;
    };
    (window as unknown as { __isle: IsleRenderer }).__isle = renderer;
    // Reported from inside sync (and later by the probe), so the store update waits for sync to finish.
    renderer.onWater = (water) => queueMicrotask(() => useGame.setState({ water }));
    renderer.onView = (playView) => queueMicrotask(() => useGame.setState({ playView }));
    let action = "";
    let chrome = "";
    const sync = () => {
      const s = useGame.getState();
      renderer.setWaterChoice(s.waterChoice);
      renderer.setPlayView(s.viewChoice);
      // The GPU probe waits for a settled client: the title with nothing dialling, or play with its first state.
      renderer.setSettled(!s.restoring && ((s.screen === "title" && !s.net) || (s.screen === "play" && !!s.state)));
      renderer.setTitleMode(s.screen !== "play");
      // The chat dock and the trade sheet change the hole the HUD leaves without the game moving; chromeSeq counts the
      // commits that land one of them from a chunk that was still loading when its flag flipped (#488).
      const nextChrome = `${s.chatOpen}|${s.tradeOpen}|${s.offer?.tradeId ?? ""}|${s.declined.join(",")}|${s.tradeOutcome}|${s.chromeSeq}`;
      if (nextChrome !== chrome) renderer.remeasure();
      chrome = nextChrome;
      // A new state that drops the pending mark from the legal set, or changes what a tap would do, clears it.
      const hi = s.highlights();
      const pp = s.pendingPlace;
      const nextAction = `${s.state?.phase}|${s.buildMode}`;
      const actionChanged = nextAction !== action;
      action = nextAction;
      renderer.setPending(pp);
      renderer.setOneTap(s.buildMode === "stronghold");
      if (pp && (actionChanged || ![...hi.vertices, ...hi.edges, ...hi.hexes].includes(pp.id))) {
        s.setPendingPlace(null);
        return;
      }
      if (s.state) {
        const actor =
          s.mode === "hotseat" ? s.state.current : s.localId;
        const mine = s.state.current === actor || s.state.phase === "discard";
        renderer.setBoard(s.state, s.highlights(), mine && s.screen === "play");
      } else if (s.screen === "title" || s.screen === "lobby") {
        demo ??= demoBoard();
        renderer.setBoard(demo, { vertices: [], edges: [], hexes: [] }, false);
      }
    };
    sync();
    const unsub = useGame.subscribe(sync);
    return () => {
      unsub();
      renderer.dispose();
    };
  }, []);

  return <>
    <canvas ref={ref} className="absolute inset-0 h-full w-full" />
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
