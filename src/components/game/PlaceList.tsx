import { useEffect, useId, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import { TERRAIN_LABEL, type GameState, type HexCell, type Vertex } from "@/lib/game/types";
import { hexToWorld } from "@/lib/game/hex";

// #376 (WCAG 2.1.1): every legal target the island glows, as a button that does what a tap on it does.
// Hidden until focus enters it, like a skip link, so the pointer view does not change.

const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
// World +z is south: the overhead view has -z up (isle-renderer.ts).
function compass(dx: number, dz: number) {
  return COMPASS[(Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) + 8) % 8]!;
}

const weight = (h: HexCell) => (h.pip ? 6 - Math.abs(7 - h.pip) : -1);

function hexWords(h: HexCell) {
  return h.terrain === "waste" ? "wastes" : `${h.pip} ${h.terrain}`;
}

function list(words: string[]) {
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

// Names that two targets share get a compass point, then a number if they still match, so every button reads differently.
function distinct<T>(items: T[], base: (t: T) => string, point: (t: T) => string) {
  const tally = (names: string[]) => names.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map<string, number>());
  const bases = items.map(base);
  const once = tally(bases);
  const pointed = items.map((t, i) => (once.get(bases[i]!)! > 1 ? `${bases[i]}, ${point(t)}` : bases[i]!));
  const twice = tally(pointed);
  const seen = new Map<string, number>();
  return new Map(
    items.map((t, i) => {
      const n = pointed[i]!;
      if (twice.get(n)! < 2) return [t, n];
      seen.set(n, (seen.get(n) ?? 0) + 1);
      return [t, `${n} ${seen.get(n)}`];
    }),
  );
}

function cornerNames(state: GameState, actor: string) {
  const hex = new Map(state.hexes.map((h) => [h.id, h]));
  const touching = (v: Vertex) => v.hexes.map((id) => hex.get(id)!).sort((a, b) => weight(b) - weight(a));
  const base = (v: Vertex) => {
    const harbor = v.harbor ? `, ${v.harbor === "any" ? "3:1" : v.harbor} harbor` : "";
    return `${list(touching(v).map(hexWords))}${harbor}`;
  };
  const point = (v: Vertex) => {
    const centers = v.hexes.map((id) => hexToWorld(hex.get(id)!.q, hex.get(id)!.r));
    const cx = centers.reduce((s, c) => s + c.x, 0) / centers.length;
    const cz = centers.reduce((s, c) => s + c.z, 0) / centers.length;
    return `${compass(v.x - cx, v.z - cz)} point`;
  };
  const names = distinct(state.vertices, base, point);
  return (v: Vertex) => {
    const b = v.building?.playerId === actor ? `your ${v.building.kind} at ` : "";
    return `${b}${names.get(v)!}`;
  };
}

function hexNames(state: GameState) {
  const base = (h: HexCell) => (h.terrain === "waste" ? "Wastes" : `${h.pip} ${TERRAIN_LABEL[h.terrain]} (${h.terrain})`);
  const point = (h: HexCell) => {
    const { x, z } = hexToWorld(h.q, h.r);
    return x === 0 && z === 0 ? "centre" : compass(x, z);
  };
  return distinct(state.hexes, base, point);
}

function useTargets() {
  const state = useGame((s) => s.state);
  const localId = useGame((s) => s.localId);
  const mode = useGame((s) => s.mode);
  const buildMode = useGame((s) => s.buildMode);
  const screen = useGame((s) => s.screen);
  // highlights() reads legal and roadPicks too; subscribing to them re-renders when they change.
  useGame((s) => s.legal);
  useGame((s) => s.roadPicks);
  const highlights = useGame((s) => s.highlights);
  const actor = mode === "hotseat" ? (state?.current ?? localId) : localId;
  // The names only change with the board, not with every arming or pick.
  const corner = useMemo(() => (state ? cornerNames(state, actor) : null), [state, actor]);
  const hexName = useMemo(() => (state ? hexNames(state) : null), [state]);
  if (!state || !corner || !hexName || screen !== "play") return null;
  if (state.current !== actor) return null;
  const hi = highlights();
  const byId = new Map(state.vertices.map((v) => [v.id, v]));
  if (hi.vertices.length) {
    const heading = buildMode === "stronghold" ? "Raise a stronghold" : "Place an outpost";
    return { heading, kind: "vertex" as const, items: hi.vertices.map((id) => ({ id, name: `Corner: ${corner(byId.get(id)!)}` })) };
  }
  if (hi.edges.length) {
    // A path reads from the end the player already holds: their building first, else their path.
    const hold = (id: string) =>
      byId.get(id)!.building?.playerId === actor ? 2 : state.edges.some((e) => e.path === actor && (e.va === id || e.vb === id)) ? 1 : 0;
    const items = hi.edges.map((id) => {
      const e = state.edges.find((x) => x.id === id)!;
      const [from, to] = hold(e.vb) > hold(e.va) ? [e.vb, e.va] : [e.va, e.vb];
      return { id, name: `Path from ${corner(byId.get(from)!)} to ${corner(byId.get(to)!)}` };
    });
    return { heading: "Lay a path", kind: "edge" as const, items };
  }
  if (hi.hexes.length) {
    const items = hi.hexes.map((id) => ({ id, name: hexName.get(state.hexes.find((h) => h.id === id)!)! }));
    return { heading: "Move the wayfarer", kind: "hex" as const, items };
  }
  return null;
}

export function PlaceList() {
  const targets = useTargets();
  const pickVertex = useGame((s) => s.pickVertex);
  const pickEdge = useGame((s) => s.pickEdge);
  const pickHex = useGame((s) => s.pickHex);
  const headingId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  // The pressed button leaves with the placement; focus moves to the next list (the path after an outpost) rather than to the page.
  const refocus = useRef(false);
  const key = targets ? `${targets.heading}|${targets.items.map((t) => t.id).join()}` : "";
  useEffect(() => {
    const again = refocus.current;
    refocus.current = false;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (again && lost) listRef.current?.querySelector("button")?.focus();
  }, [key]);

  if (!targets) return null;
  const pick = targets.kind === "vertex" ? pickVertex : targets.kind === "edge" ? pickEdge : pickHex;
  return (
    <div className="pointer-events-none absolute right-3 top-20 z-20 w-72">
      <div
        ref={listRef}
        role="group"
        aria-labelledby={headingId}
        data-testid="place-list"
        // A mark tapped on the board but not yet confirmed must not ride along: PlaceChip confirms it on any Enter
        // that reaches the window, which would place it instead of (or as well as) the button pressed here.
        onFocusCapture={() => useGame.getState().setPendingPlace(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.stopPropagation();
        }}
        className="sr-only rounded-[16px] border border-white/50 bg-surface p-2 shadow-lg focus-within:not-sr-only focus-within:pointer-events-auto focus-within:block"
      >
        <h2 id={headingId} className="px-1 pb-1 text-sm font-medium">
          {targets.heading}
        </h2>
        <div className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto">
          {targets.items.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant="secondary"
              className="h-auto min-h-8 justify-start py-1 text-left"
              onClick={() => {
                const before = useGame.getState();
                refocus.current = true;
                before.setPendingPlace(null);
                pick(t.id);
                // Offline a pick acts at once; one that changed nothing (refused, or asking whom to rob) leaves focus alone.
                const after = useGame.getState();
                if (after.mode !== "online" && after.state === before.state && after.roadPicks === before.roadPicks) refocus.current = false;
              }}
            >
              {t.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
