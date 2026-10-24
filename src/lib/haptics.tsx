// #542: loaded only for a supported coarse pointer, before rejoin or the first interactive render.
import { useSyncExternalStore } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HAPTIC_MS } from "@/lib/haptic-durations";
import { canHaptic, play, type SoundName } from "@/lib/sound";
import { useGame } from "@/lib/game/store";
import type { GameState } from "@/lib/game/types";

export function available() {
  try { return typeof navigator.vibrate === "function" && matchMedia("(pointer: coarse)").matches; }
  catch { return false; }
}

const KEY = "emberisle-haptics";
let on = (() => {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
})();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const isHapticsOn = () => on;
function setHaptics(value: boolean) {
  on = value;
  try { localStorage.setItem(KEY, value ? "1" : "0"); } catch { /* keep the page's choice */ }
  for (const listener of listeners) listener();
}

export function buzz(ms: number) {
  if (!ms || !canHaptic() || !on || !available()) return;
  try { navigator.vibrate?.(ms); } catch { /* an embedding may forbid vibration */ }
}
export const turn = () => buzz(HAPTIC_MS.yourTurn);
export const pay = (own?: boolean) => { if (own) buzz(HAPTIC_MS.pay); };
export function offer(from: string) {
  const state = useGame.getState();
  if (from !== state.localId && !state.spectator) buzz(HAPTIC_MS.tradeOffer);
}

// Decorate the existing cue player, so the same landing callback still owns audio and motor timing.
export function player(before: GameState | null, after: GameState, me: string, mode: string) {
  const ownsPiece = mode === "hotseat" || (!!me && !!before && (
    after.edges.some((edge, i) => edge.path === me && !before.edges[i]?.path) ||
    after.vertices.some((vertex, i) => vertex.building?.playerId === me && vertex.building.kind !== before.vertices[i]?.building?.kind)
  ));
  const ownFortune = mode === "hotseat" || (!!me && before?.current === me);
  return (sound: SoundName, volume: number) => {
    play(sound, volume);
    if (ownsPiece && (sound === "path_place" || sound === "outpost_place" || sound === "stronghold_place")) buzz(HAPTIC_MS.land);
    if (ownFortune && sound === "card_play") buzz(HAPTIC_MS.fortune);
    if (me && sound === "win") buzz(HAPTIC_MS.win);
  };
}

export function Row() {
  const enabled = useSyncExternalStore(subscribe, isHapticsOn, () => false);
  if (!available()) return null;
  return (
    <Button variant="ghost" className="h-11 w-full justify-start px-3 text-body" data-testid="haptics-toggle" aria-pressed={enabled} silent onClick={() => { setHaptics(!enabled); play("ui_click"); }}>
      <Smartphone className="size-4 shrink-0 text-muted" />
      Haptics {enabled ? "on" : "off"}
    </Button>
  );
}
