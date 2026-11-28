import type { Bag, Seat } from "@/lib/net/table";
import type { GameState } from "@/lib/game/types";
import { afterOutcome, foregroundScope, playForeground, playTradePlease } from "./sound";

type Play = typeof import("./sound").play;
type SoundName = Parameters<Play>[0];

const isDiggler = (name = "") => /luck(e|y|ie)?digg?ler|pickle|isa+c/.test(name.toLowerCase().replace(/[^a-z]/g, ""));
const isDaking = (name = "") => name.trim().toLowerCase() === "daking";

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

// The winner's chosen song plays for everyone present, and end music waits for it to end. With no pick, Isaac's name still
// plays his own song (DECISIONS-archive 2026-10-19) and, as before, no end music; anyone else hears win or game_lose.
// `song` is the clip store.ts resolved from the host's playback projection (#1045), or undefined for no pick.
export function gameEnd(before: GameState, after: GameState, me: string, mode: string, song?: SoundName) {
  const isaac = !song && isDiggler(after.players.find((p) => p.id === after.winner)?.name);
  const lost = mode !== "hotseat" && me !== "" && !!after.winner && after.winner !== me;
  playForeground(song ?? (isaac ? "isaac_win" : lost ? "game_lose" : "win"), "outcome");
  if (mode !== "hotseat" && me && before.phase !== "over" && after.phase === "over" && after.winner && !isaac) endMusic(1500);
}

// End music `ms` after the outcome, or when the outcome clip ends if that is later. A cancel, or silenced music, in between
// drops it.
export function endMusic(ms: number) {
  const scope = foregroundScope;
  setTimeout(() => scope === foregroundScope && afterOutcome(() => playForeground("end_music", "end")), ms);
}
