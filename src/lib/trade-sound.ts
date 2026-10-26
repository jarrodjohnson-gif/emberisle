import type { Bag, Seat } from "@/lib/net/table";
import type { GameState } from "@/lib/game/types";
import { playLater, stop, type SoundName } from "./sound";

type Play = (name: SoundName, volume?: number) => void;

const isDiggler = (name = "") => /luck(e|y|ie)?digg?ler|pickle|isa+c/.test(name.toLowerCase().replace(/[^a-z]/g, ""));
export const isDaking = (name = "") => name.trim().toLowerCase() === "daking";

const lastPleaseAt = new Map<string, number>();

const PLEASE_BY_RESOURCE = {
  timber: "sb_only_wood",
  wool: "sb_sheep_please",
  grain: "sb_grain_please",
  clay: "sb_brick_please",
} as const satisfies Partial<Record<keyof Bag, SoundName>>;

function politeClip(want: Bag): SoundName | null {
  const requested = Object.entries(want).filter(([, count]) => Number(count) > 0);
  if (requested.length !== 1) return null;
  const [resource] = requested[0];
  return PLEASE_BY_RESOURCE[resource as keyof typeof PLEASE_BY_RESOURCE] ?? null;
}

export function offerChime(play: Play, from: string, fromName: string, me: string, give: Bag, want: Bag) {
  const timber = give.timber ?? 0;
  if (timber >= 3) play("three_wood");
  else if (timber && isDaking(fromName)) play("daking_wood");
  else if (want.timber && give.wool) play("sheep_for_wood");
  else if (want.timber && give.ore) play("stone_for_wood");
  else if (politeClip(want)) {
    const clip = politeClip(want)!;
    const now = Date.now();
    const key = `${from}:${clip}`;
    if (now - (lastPleaseAt.get(key) ?? -Infinity) >= 3000) {
      lastPleaseAt.set(key, now);
      play(clip);
    }
  }
  else if (from !== me) play("trade_offer");
}

export function diggerBell(play: Play, before: Seat[], after: Seat[], me: string) {
  const was = new Set(before.filter((s) => isDiggler(s.name)).map((s) => s.id));
  if (after.some((s) => isDiggler(s.name) && !was.has(s.id) && (before.length || s.id === me))) play("lucke_diggler");
}

export function gameEnd(cue: Play, before: GameState, after: GameState, me: string, mode: string) {
  const isaac = isDiggler(after.players.find((p) => p.id === after.winner)?.name);
  const lost = mode !== "hotseat" && me !== "" && !!after.winner && after.winner !== me;
  cue(isaac ? "isaac_win" : lost ? "game_lose" : "win", 1);
  if (mode !== "hotseat" && me && before.phase !== "over" && after.phase === "over" && after.winner && !isaac) {
    stop("end_music");
    stop("isaac_win");
    playLater("end_music", 1, 1500);
  }
}
