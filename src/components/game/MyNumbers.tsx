import { useEffect, useRef, useState } from "react";
import { RESOURCE_ICON, RESOURCE_PAINT } from "@/components/game/Hand";
import { RESOURCES, RESOURCE_LABEL, type GameState, type Resource } from "@/lib/game/types";
import { cn } from "@/lib/utils";

// How many of the 36 dice outcomes roll n (the pips under a token).
const pips = (n: number) => 6 - Math.abs(7 - n);
export const MY_NUMBER_GLOW_MS = 1200;

// "My numbers" (#643, the owner: "showing what numbers you currently have settlements on"): each number the seat's outposts and
// strongholds touch, with one good per paying building (a stronghold twice), most likely first; ties by the lower number.
// From the public board only, so it is the same for every seat that looks.
export function myNumbers(state: GameState, playerId: string): { n: number; goods: Resource[] }[] {
  const hexes = new Map(state.hexes.map((h) => [h.id, h]));
  const by = new Map<number, Resource[]>();
  for (const v of state.vertices) {
    if (v.building?.playerId !== playerId) continue;
    const k = v.building.kind === "stronghold" ? 2 : 1;
    for (const id of v.hexes) {
      const h = hexes.get(id);
      if (!h || h.pip == null || h.terrain === "waste") continue;
      const goods = by.get(h.pip) ?? [];
      for (let i = 0; i < k; i++) goods.push(h.terrain);
      by.set(h.pip, goods);
    }
  }
  return [...by]
    .map(([n, goods]) => ({ n, goods: goods.sort((a, b) => RESOURCES.indexOf(a) - RESOURCES.indexOf(b)) }))
    .sort((a, b) => pips(b.n) - pips(a.n) || a.n - b.n);
}

// The strip: a chip per number, the goods it pays as the hand's own little cards. It shares the log line's row (fixed 20 px),
// so it never grows the tray: the declared hole (mobile-fit.ts `playHole`) holds in every layout. A roll of one of the numbers
// lights its chip for 1.2 s, alongside the gain floats. Nothing before the seat's first outpost, and nothing for a watcher (the
// HUD leaves it out).
export function MyNumbers({ state, playerId }: { state: GameState; playerId: string }) {
  const list = myNumbers(state, playerId);
  const rolls = state.rolls ?? 0;
  const sum = state.dice ? state.dice[0] + state.dice[1] : 0;
  // The lit number and the roll that lit it: the same number twice running remounts its chip, so the glow plays again.
  const [lit, setLit] = useState<{ n: number; roll: number } | null>(null);
  const seen = useRef(rolls);
  useEffect(() => {
    if (rolls === seen.current) return;
    seen.current = rolls;
    if (!sum) return;
    setLit({ n: sum, roll: rolls });
    const t = setTimeout(() => setLit(null), MY_NUMBER_GLOW_MS);
    return () => clearTimeout(t);
  }, [rolls, sum]);
  if (!list.length) return null;
  return (
    <ul data-testid="my-numbers" aria-label="Your numbers" className="my-numbers flex h-5 min-w-0 max-w-[62%] shrink-0 items-center gap-1 overflow-x-auto">
      {list.map(({ n, goods }) => (
        <li
          key={lit?.n === n ? `${n}-${lit.roll}` : n}
          data-n={n}
          data-goods={goods.join(",")}
          data-lit={lit?.n === n || undefined}
          aria-label={`${n}: ${goods.map((g) => RESOURCE_LABEL[g]).join(", ")}`}
          className={cn("my-number flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-xs font-semibold tabular-nums", (n === 6 || n === 8) && "my-number-hot", lit?.n === n && "my-number-lit")}
        >
          <span aria-hidden>{n}</span>
          {goods.map((g, i) => {
            const Icon = RESOURCE_ICON[g];
            return <Icon key={i} aria-hidden className={cn("size-3.5 rounded-full p-[2px]", RESOURCE_PAINT[g])} />;
          })}
        </li>
      ))}
    </ul>
  );
}
