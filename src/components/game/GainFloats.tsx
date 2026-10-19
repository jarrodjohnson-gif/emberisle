// Island gain floats removed per Jarrod (2026-10-18, #772 / #773): resource gains show only on the cards.
// useFloatsUp remains for backward compatibility and is always false so turn and roll moments never wait on it.
import { create } from "zustand";
import type { PlayerState } from "@/lib/game/types";

export const useFloatsUp = create<{ up: boolean }>(() => ({ up: false }));

export function GainFloats(_props?: { me?: PlayerState; rolls?: number }) {
  return null;
}
