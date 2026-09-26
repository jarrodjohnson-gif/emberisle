import { useEffect, useRef } from "react";
import { IsleRenderer } from "@/lib/scene/isle-renderer";
import { useGame } from "@/lib/game/store";

export default function IslandCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useRef<IsleRenderer | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const game = useGame.getState();
    const renderer = new IsleRenderer(canvas, (kind, id) => {
      const g = useGame.getState();
      if (kind === "hex") g.pickHex(id);
      if (kind === "vertex") g.pickVertex(id);
      if (kind === "edge") g.pickEdge(id);
    });
    api.current = renderer;
    const sync = () => {
      const s = useGame.getState();
      renderer.setTitleMode(s.screen !== "play");
      if (s.state) {
        const actor =
          s.mode === "hotseat" ? s.state.current : s.localId;
        const mine = s.state.current === actor || s.state.phase === "discard";
        renderer.setBoard(s.state, s.highlights(), mine && s.screen === "play");
      }
    };
    sync();
    const unsub = useGame.subscribe(sync);
    return () => {
      unsub();
      renderer.dispose();
      api.current = null;
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
