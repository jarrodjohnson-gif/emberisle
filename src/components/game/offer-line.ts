import { bagText } from "@/lib/game/trade";
import type { Bag } from "@/lib/net/table";

// "Ember offers 2 sheep for 1 ore"; the asker reads "You offer 2 sheep for 1 ore".
export function offerLine(name: string | null, give: Bag, want: Bag) {
  const g = bagText(give);
  const w = bagText(want);
  const [who, offers, gives, asks] = name ? [name, "offers", "gives away", "asks for"] : ["You", "offer", "give away", "ask for"];
  if (g && w) return `${who} ${offers} ${g} for ${w}`;
  return g ? `${who} ${gives} ${g}` : `${who} ${asks} ${w}`;
}
