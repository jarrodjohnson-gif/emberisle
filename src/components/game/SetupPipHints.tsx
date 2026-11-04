import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/lib/game/store";
import type { GameState, HexCell, Vertex } from "@/lib/game/types";

// Adjacent producing-hex pips for a legal opening corner (issue #546). Hover on desktop; tap/pending on touch.
// Screen-space tracking uses __isle.screenOf so the board renderer stays untouched.

type IsleApi = { screenOf(id: string): { x: number; y: number } | null };

function producingPips(state: GameState, vertex: Vertex): number[] {
  const byId = new Map(state.hexes.map((h) => [h.id, h]));
  const weight = (h: HexCell) => (h.pip ? 6 - Math.abs(7 - h.pip) : -1);
  return vertex.hexes
    .map((id) => byId.get(id))
    .filter((h): h is HexCell => !!h && h.terrain !== "waste" && h.pip != null)
    .sort((a, b) => weight(b) - weight(a))
    .map((h) => h.pip!);
}

export function SetupPipHints() {
  const state = useGame((s) => s.state);
  const pending = useGame((s) => s.pendingPlace);
  const legalKey = useGame((s) => {
    if (s.screen !== "play" || !s.state || s.state.phase !== "setupSettle") return "";
    const actor = s.mode === "hotseat" ? s.state.current : s.localId;
    if (s.state.current !== actor) return "";
    return s.highlights().vertices.join("\0");
  });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const opening = legalKey.length > 0;
  const legal = useMemo(() => (legalKey ? legalKey.split("\0") : []), [legalKey]);

  const focusId =
    pending?.kind === "vertex" && legal.includes(pending.id) ? pending.id : hoverId && legal.includes(hoverId) ? hoverId : null;

  useEffect(() => {
    if (!opening || !legal.length) {
      setHoverId(null);
      setAnchor(null);
      return;
    }
    const onMove = (e: PointerEvent) => {
      // Touch uses the pending Place chip; mouse hover drives the hint.
      if (e.pointerType === "touch") return;
      const isle = (window as unknown as { __isle?: IsleApi }).__isle;
      if (!isle) return;
      let best: string | null = null;
      let bestD = 36;
      for (const id of legal) {
        const p = isle.screenOf(id);
        if (!p) continue;
        const d = Math.hypot(p.x - e.clientX, p.y - e.clientY);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      setHoverId(best);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [opening, legal]);

  useEffect(() => {
    if (!focusId) {
      setAnchor(null);
      return;
    }
    let frame = 0;
    const tick = () => {
      const isle = (window as unknown as { __isle?: IsleApi }).__isle;
      const p = isle?.screenOf(focusId) ?? null;
      setAnchor(p);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [focusId]);

  if (!opening || !state || !focusId || !anchor) return null;
  const vertex = state.vertices.find((v) => v.id === focusId);
  if (!vertex) return null;
  const pips = producingPips(state, vertex);
  // Illegal corners never reach here: focusId is always in the current legal set.
  if (!pips.length) return null;

  return (
    <div
      data-testid="setup-pip-hint"
      data-vertex={focusId}
      role="status"
      className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-[120%] rounded-control border border-accent/40 bg-surface px-2 py-1 text-sm text-fg shadow-lg"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <span className="text-xs text-muted">Pips · </span>
      <span className="font-medium tabular-nums">{pips.join(" · ")}</span>
    </div>
  );
}
