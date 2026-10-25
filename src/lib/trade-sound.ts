import type { Bag, Seat } from "@/lib/net/table";
import type { SoundName } from "./sound";

type Play = (name: SoundName, volume?: number) => void;

export function offerChime(play: Play, from: string, fromName: string, me: string, give: Bag, want: Bag) {
  const timber = give.timber ?? 0;
  if (timber >= 3) play("three_wood");
  else if (timber && fromName === "Daking") play("daking_wood");
  else if (want.timber && give.wool) play("sheep_for_wood");
  else if (want.timber && give.ore) play("stone_for_wood");
  else if (from !== me) play("trade_offer");
}

export function diggerBell(play: Play, isDiggler: (name: string | undefined) => boolean, before: Seat[], after: Seat[], me: string) {
  const was = new Set(before.filter((s) => isDiggler(s.name)).map((s) => s.id));
  if (after.some((s) => isDiggler(s.name) && !was.has(s.id) && (before.length || s.id === me))) play("lucke_diggler");
}
