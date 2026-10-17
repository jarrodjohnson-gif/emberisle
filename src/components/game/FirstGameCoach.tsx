import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "@/lib/game/store";
import { legalRoads, legalSettle } from "@/lib/game/rules";
import { COST, RESOURCES, type GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const KEY = "emberisle-first-game-coach";
type Progress = {
  game: string;
  actor: string;
  setup: boolean;
  roll: boolean;
  path: boolean;
  outpost: boolean;
  seven: boolean;
};
type Saved = Progress | "done" | null;
let memory: Saved = null;
function read(): Saved {
  try { const raw = localStorage.getItem(KEY); return raw === null ? memory : JSON.parse(raw) as Saved; }
  catch { return memory; }
}
function save(value: Saved) {
  memory = value;
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Tips still work without storage. */ }
}
const signature = (s: GameState) => `${s.seed}:${s.hexes.map((h) => `${h.terrain}${h.pip ?? ""}`).join()}`;
const paths = (s: GameState, id: string) => s.edges.filter((e) => e.path === id).length;
const homes = (s: GameState, id: string) => s.vertices.filter((v) => v.building?.playerId === id).length;

// One browser's first table, including reconnects. Progress records real placements, never an armed button.
export function FirstGameCoach({ className, hidden }: { className?: string; hidden?: boolean }) {
  const state = useGame((s) => s.state);
  const spectator = useGame((s) => s.spectator);
  const pendingSteal = useGame((s) => s.pendingSteal);
  const [progress, setProgress] = useState<Saved>(read);
  const skipped = useRef(false);
  const [skipSlot, setSkipSlot] = useState<Element | null>(null);
  useEffect(() => { setSkipSlot(document.querySelector("[data-coach-skip-slot]")); }, []);
  useEffect(() => {
    let previous: GameState | null = null;
    let saved = read();
    const update = () => {
      const store = useGame.getState();
      const next = store.state;
      if (!next || store.spectator || saved === "done" || skipped.current) return;
      const actor = store.mode === "hotseat" ? next.players.find((p) => p.kind === "human")?.id : store.localId;
      if (!actor || next.players.find((p) => p.id === actor)?.kind !== "human") return;
      let p: Saved = saved;
      if (!p) p = { game: signature(next), actor, setup: false, roll: false, path: false, outpost: false, seven: false };
      if (p.game !== signature(next) || next.phase === "over") p = "done";
      else {
        p = { ...p };
        const before = previous;
        if (before && before.current === p.actor) {
          if (before.phase === "setupSettle" && homes(next, p.actor) > homes(before, p.actor)) p.setup = true;
          if (before.phase === "roll" && (next.rolls ?? 0) > (before.rolls ?? 0)) p.roll = true;
          if (before.phase === "main") {
            if (paths(next, p.actor) > paths(before, p.actor)) p.path = true;
            if (p.path && homes(next, p.actor) > homes(before, p.actor)) p.outpost = true;
          }
          if (before.phase === "robber" && next.phase === "main" && before.dice?.reduce((a, b) => a + b, 0) === 7) p.seven = true;
        }
        // A reconnect can begin after setup or after the first roll.
        if (!["rollOff", "setupSettle", "setupRoad"].includes(next.phase)) p.setup = true;
        if (next.current === p.actor && ["main", "discard", "robber"].includes(next.phase)) p.roll = true;
        if (p.outpost && (p.seven || next.wayfarerMode === "off")) p = "done";
      }
      previous = next;
      if (JSON.stringify(p) !== JSON.stringify(saved)) {
        saved = p;
        save(p);
        setProgress(p);
      }
    };
    update();
    return useGame.subscribe(update);
  }, []);

  if (!state || spectator || !progress || progress === "done" || progress.game !== signature(state) || state.current !== progress.actor) return null;
  const me = state.players.find((p) => p.id === progress.actor);
  if (!me?.resources) return null;
  const ready = (kind: "path" | "outpost") =>
    RESOURCES.every((r) => me.resources[r] >= (COST[kind][r] ?? 0)) &&
    (kind === "path" ? me.pathsLeft > 0 && legalRoads(state, me.id, false).length > 0 : me.outpostsLeft > 0 && legalSettle(state, me.id, false).length > 0);
  let step = 3;
  let text = "";
  if (!progress.setup && state.phase === "setupSettle" && legalSettle(state, me.id, true).length) {
    step = 1;
    text = "Tap a glowing corner, then Place";
  } else if (!progress.roll && state.phase === "roll") {
    step = 2;
    text = "You gain goods when your numbers roll";
  } else if (!progress.seven && state.phase === "robber" && state.wayfarerMode !== "off" && state.dice?.reduce((a, b) => a + b, 0) === 7) {
    text = pendingSteal ? "Pick a victim to take a good from." : "Move the wayfarer to a new hex, then pick a victim if available";
  } else if (state.phase === "main" && !progress.outpost) {
    text = !progress.path && ready("path") ? "Build a path first. Costs are in the menu."
      : progress.path && ready("outpost") ? "Now place an outpost at a connected corner. Costs are in the menu."
      : "Build when you have goods and a legal spot. Costs are in the menu.";
  }
  if (!text || hidden) return null;
  return (
    <div data-testid="first-game-coach" data-step={step} data-steps="3" className={cn("pointer-events-none rounded-control border border-accent/40 bg-surface px-3 py-1 text-sm text-fg", className)}>
      <p role="status"><span className="text-xs text-muted">Tip {step} of 3 · </span>{text}</p>
      {/* Only pointer-transparent text floats over the island. Skip shares the header's existing reserved footprint. */}
      {skipSlot ? createPortal(
        <button type="button" className="pointer-events-auto min-h-11 shrink-0 px-1 text-xs text-muted underline" onClick={() => { skipped.current = true; save("done"); setProgress("done"); }}>Skip tips</button>,
        skipSlot,
      ) : null}
    </div>
  );
}
