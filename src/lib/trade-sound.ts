import type { Bag, Seat } from "@/lib/net/table";
import type { GameState } from "@/lib/game/types";
import { playLater, playTradePlease, stop } from "./sound";

type Play = typeof import("./sound").play;

const isDiggler = (name = "") => /luck(e|y|ie)?digg?ler|pickle|isa+c/.test(name.toLowerCase().replace(/[^a-z]/g, ""));
export const isDaking = (name = "") => name.trim().toLowerCase() === "daking";

export function offerChime(play: Play, from: string, fromName: string, me: string, give: Bag, want: Bag) {
  const timber = give.timber ?? 0;
  if (timber >= 3) play("three_wood");
  else if (timber && isDaking(fromName)) play("daking_wood");
  else if (want.timber && give.wool) play("sheep_for_wood");
  else if (want.timber && give.ore) play("stone_for_wood");
  else if (!playTradePlease(play, from, want) && from !== me) play("trade_offer");
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
