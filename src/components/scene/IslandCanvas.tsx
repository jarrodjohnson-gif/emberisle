import { useEffect, useRef, useState } from "react";
import { IsleRenderer } from "@/lib/scene/isle-renderer";
import { useGame } from "@/lib/game/store";
import { demoBoard } from "@/lib/game/board";
import type { GameState } from "@/lib/game/types";
import type { DockTarget } from "@/components/scene/DockInspection";

import { chunk, LazyBoundary } from "@/lib/lazy";
const DockInspection = chunk(() => import("@/components/scene/DockInspection")).pick((m) => m.default);

// One dealt island for the life of the page, shown behind the title and the lobby. It is never in the store.
let demo: GameState | null = null;

export default function IslandCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [docks, setDocks] = useState<DockTarget[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: IsleRenderer;
    try {
      renderer = new IsleRenderer(
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isWebGL = Boolean(e && typeof e === "object" && (e as { isWebGL?: boolean }).isWebGL) || /webgl/i.test(msg);
      console.error(isWebGL ? "WebGL creation failed; 3D view unavailable:" : "Renderer init failed; 3D view failed to start:", e);
      setFallback((current) => current ?? (isWebGL ? "3D view unavailable" : "3D view failed to start"));
      return;
    }
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
    let failed = false;
    let unsub: () => void = () => {};
    const fail = (e: unknown) => {
      if (failed) return;
      failed = true;
      unsub();
      console.error("Renderer sync failed; 3D view unavailable:", e);
      setFallback("3D view unavailable");
      renderer.dispose();
    };

    const sync = () => {
      if (failed) return;
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
      renderer.setArmed(s.buildMode !== "none");
      if (pp && (actionChanged || ![...hi.vertices, ...hi.edges, ...hi.hexes].includes(pp.id))) {
        s.setPendingPlace(null);
        return;
      }
      if (s.state) {
        const actor =
          s.mode === "hotseat" ? s.state.current : s.localId;
        const mine = s.state.current === actor || s.state.phase === "discard";
        renderer.setBoard(s.state, s.highlights(), mine && s.screen === "play", s.mode === "hotseat" ? true : s.spectator ? undefined : s.localId);
      } else if (s.screen === "title" || s.screen === "lobby") {
        demo ??= demoBoard();
        renderer.setBoard(demo, { vertices: [], edges: [], hexes: [] }, false);
      }
    };
    try {
      sync();
    } catch (e) {
      fail(e);
      return;
    }
    unsub = useGame.subscribe(() => {
      try {
        sync();
      } catch (e) {
        fail(e);
      }
    });
    return () => {
      unsub();
      if (!failed) renderer.dispose();
    };
  }, []);

  return <>
    <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    {fallback && (
      <div data-testid="canvas-fallback" className="absolute inset-0 flex items-center justify-center bg-bg p-6 text-center select-none pointer-events-none">
        <p className="text-sm text-muted">{fallback}</p>
      </div>
    )}
    {docks.length > 0 && <LazyBoundary retryKey={selected ?? ""} failed={null}><DockInspection docks={docks} selected={selected} setSelected={setSelected} /></LazyBoundary>}
  </>;
}
